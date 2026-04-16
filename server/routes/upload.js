import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import db from '../lib/db.js';
import { authenticate } from '../middleware/auth.js';

const IMAGES_DIR = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'), 'data', 'images');
fs.mkdirSync(IMAGES_DIR, { recursive: true });

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');
const TEMP_DIR = path.join(ROOT, 'data', 'temp');
fs.mkdirSync(TEMP_DIR, { recursive: true });

const ALLOWED_EXTENSIONS = ['.pdf', '.cbz', '.cbr', '.zip', '.rar'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.tiff', '.tif'];

// ---- Multer for single-file uploads (legacy / small files) ----
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TEMP_DIR),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext) || file.mimetype === 'application/pdf' || file.mimetype === 'application/octet-stream') {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Use PDF, CBZ, or CBR.'));
    }
  },
  limits: { fileSize: 500 * 1024 * 1024 }
});

// ---- Multer for chunk uploads ----
// NOTE: In multer, req.body text fields are only populated if they appear
// before the file field in the FormData. The frontend must append text fields first.
const chunkStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadId = req.body.uploadId;
    if (!uploadId) return cb(new Error('Missing uploadId'));
    const chunkDir = path.join(TEMP_DIR, `chunks-${uploadId}`);
    fs.mkdirSync(chunkDir, { recursive: true });
    cb(null, chunkDir);
  },
  filename: (req, file, cb) => {
    const chunkIndex = req.body.chunkIndex;
    cb(null, `chunk-${String(chunkIndex).padStart(6, '0')}`);
  }
});

const chunkUpload = multer({
  storage: chunkStorage,
  limits: { fileSize: 95 * 1024 * 1024 } // 95MB per chunk - safely under Cloudflare's 100MB limit
});

const router = Router();

// ======================================================================
// Shared helpers
// ======================================================================

function getFileType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (ext === '.cbz' || ext === '.zip') return 'cbz';
  if (ext === '.cbr' || ext === '.rar') return 'cbr';
  return 'unknown';
}

// ---- PDF conversion ----
async function convertPdfToImages(pdfPath, outputDir) {
  try {
    const { default: pdfPoppler } = await import('pdf-poppler');
    await pdfPoppler.convert(pdfPath, {
      format: 'png', out_dir: outputDir, out_prefix: 'page', scale: 2048
    });
    return getSortedImages(outputDir, 'page', '.png');
  } catch (e) {
    console.log('pdf-poppler failed, trying pdftoppm...', e.message);
  }

  try {
    await execAsync(`pdftoppm -png -r 300 "${pdfPath}" "${path.join(outputDir, 'page')}"`);
    return getSortedImages(outputDir, 'page', '.png');
  } catch (e) {
    throw new Error('Could not convert PDF. Please install Poppler utils.');
  }
}

function getSortedImages(dir, prefix, ext) {
  return fs.readdirSync(dir)
    .filter(f => f.startsWith(prefix) && f.endsWith(ext))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] || '0');
      const numB = parseInt(b.match(/\d+/)?.[0] || '0');
      return numA - numB;
    })
    .map(f => path.join(dir, f));
}

// ---- CBZ extraction ----
async function extractCbzImages(cbzPath, outputDir) {
  const unzipper = await import('unzipper');
  const directory = await unzipper.Open.file(cbzPath);

  const imageFiles = directory.files
    .filter(f => {
      const ext = path.extname(f.path).toLowerCase();
      return IMAGE_EXTENSIONS.includes(ext) && !f.path.startsWith('__MACOSX') && !path.basename(f.path).startsWith('.');
    })
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));

  const paths = [];
  for (let i = 0; i < imageFiles.length; i++) {
    const ext = path.extname(imageFiles[i].path).toLowerCase();
    const outPath = path.join(outputDir, `page-${String(i + 1).padStart(4, '0')}${ext}`);
    fs.writeFileSync(outPath, await imageFiles[i].buffer());
    paths.push(outPath);
  }
  return paths;
}

// ---- Native File Processing Helper ----
function processExtractedFiles(sourceDir, destDir) {
  function getAllFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      if (fs.statSync(filePath).isDirectory()) {
        getAllFiles(filePath, fileList);
      } else {
        fileList.push(filePath);
      }
    }
    return fileList;
  }

  const files = getAllFiles(sourceDir)
    .filter(f => {
      const ext = path.extname(f).toLowerCase();
      const base = path.basename(f);
      return IMAGE_EXTENSIONS.includes(ext) && !base.startsWith('__MACOSX') && !base.startsWith('.');
    })
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const paths = [];
  for (let i = 0; i < files.length; i++) {
    const ext = path.extname(files[i]).toLowerCase();
    const oldPath = files[i];
    const newPath = path.join(destDir, `page-${String(i + 1).padStart(4, '0')}${ext}`);
    fs.renameSync(oldPath, newPath);
    paths.push(newPath);
  }
  return paths;
}

// ---- CBR extraction ----
async function extractCbrImages(cbrPath, outputDir) {
  const nativeExtractDir = path.join(outputDir, 'native_extract');
  fs.mkdirSync(nativeExtractDir, { recursive: true });

  const errors = [];

  const extractors = [
    { cmd: `bsdtar -xf "${cbrPath}" -C "${nativeExtractDir}/"`, name: 'bsdtar' },
    { cmd: `7zz x -y "${cbrPath}" -o"${nativeExtractDir}/"`, name: '7zz' },
    { cmd: `7z x -y "${cbrPath}" -o"${nativeExtractDir}/"`, name: '7z' },
    { cmd: `unrar e -y "${cbrPath}" "${nativeExtractDir}/"`, name: 'unrar' }
  ];

  for (const { cmd, name } of extractors) {
    try {
      await execAsync(cmd);
    } catch (err) {
      errors.push(`[${name} shell]: ${err.message.split('\\n')[0]}`);
    }
  }

  try {
    const files = fs.readdirSync(nativeExtractDir);
    if (files.length > 0) {
      const paths = processExtractedFiles(nativeExtractDir, outputDir);
      if (paths.length > 0) return paths;

      const allExts = [...new Set(files.map(f => path.extname(f).toLowerCase()))];
      errors.push(`[Native Reader]: Files extracted, but no valid images found! Extensions present: ${allExts.join(', ')}`);
    } else {
      errors.push(`[Native Reader]: The binaries ran but extracted 0 files into the output folder.`);
    }
  } catch (e) {
    errors.push(`[Native Process]: ${e.message}`);
  }

  // Fallback to node-unrar-js
  try {
    const { createExtractorFromFile } = await import('node-unrar-js');
    const extractor = await createExtractorFromFile({ filepath: cbrPath });
    const list = extractor.extract();

    const entries = [];
    for (const entry of list.files) {
      const ext = path.extname(entry.fileHeader.name).toLowerCase();
      if (IMAGE_EXTENSIONS.includes(ext) && !entry.fileHeader.flags.directory) {
        entries.push({ name: entry.fileHeader.name, extraction: entry.extraction });
      }
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    const paths = [];
    for (let i = 0; i < entries.length; i++) {
      if (!entries[i].extraction) continue;
      const ext = path.extname(entries[i].name).toLowerCase();
      const outPath = path.join(outputDir, `page-${String(i + 1).padStart(4, '0')}${ext}`);
      fs.writeFileSync(outPath, Buffer.from(entries[i].extraction));
      paths.push(outPath);
    }

    if (paths.length > 0) return paths;
    errors.push('[node-unrar-js]: File parsed, but all extracted image buffers were undefined (Solid archive or OOM).');
  } catch (e) {
    errors.push(`[node-unrar-js]: ${e.message}`);
  }

  throw new Error(`CBR Error Logs:\\n${errors.join('\\n')}`);
}

// ---- Get source images ----
async function getSourceImages(filePath, fileType, outputDir) {
  switch (fileType) {
    case 'pdf': return convertPdfToImages(filePath, outputDir);
    case 'cbz': return extractCbzImages(filePath, outputDir);
    case 'cbr': return extractCbrImages(filePath, outputDir);
    default: throw new Error(`Unsupported: ${fileType}`);
  }
}

// ---- Spread detection ----
function isDoubleSpread(width, height, medianRatio) {
  return (width / height) > medianRatio * 1.3;
}

// ======================================================================
// Shared processing logic — used by both single & chunked uploads
// ======================================================================

async function processUploadedFile({ filePath, fileName, seriesTitle, seriesId, category, issueNumber, issueTitle, description, userId }) {
  const tempDir = path.join(TEMP_DIR, `job-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const fileType = getFileType(fileName);
    if (fileType === 'unknown') throw new Error('Unsupported file type');
    if (!userId) throw new Error('User ID is required');

    // Create or get series
    let finalSeriesId = seriesId;
    if (!seriesId || seriesId === 'new') {
      if (!seriesTitle) throw new Error('Series title required');

      finalSeriesId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO series (id, title, category, description, user_id) 
        VALUES (?, ?, ?, ?, ?)
      `).run(finalSeriesId, seriesTitle, category || 'comic', description || '', userId);
    }

    // Create issue
    const issueId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO issues (id, series_id, issue_number, title)
      VALUES (?, ?, ?, ?)
    `).run(issueId, finalSeriesId, parseInt(issueNumber) || 1, issueTitle || '');

    // Extract/convert source images
    const sourceImages = await getSourceImages(filePath, fileType, tempDir);

    // Process and save each page
    const pageData = [];
    for (let i = 0; i < sourceImages.length; i++) {
      const srcPath = sourceImages[i];
      const webpBuffer = await sharp(srcPath).webp({ quality: 85 }).toBuffer();
      const metadata = await sharp(srcPath).metadata();

      const relativeKey = `${userId}/${finalSeriesId}/${issueId}/page-${String(i + 1).padStart(4, '0')}.webp`;
      const fullPath = path.join(IMAGES_DIR, relativeKey);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, webpBuffer);

      pageData.push({
        issue_id: issueId,
        page_number: i + 1,
        image_key: relativeKey,
        width: metadata.width,
        height: metadata.height,
      });
    }

    // Detect spreads
    const ratios = pageData.map(p => p.width / p.height).sort((a, b) => a - b);
    const medianRatio = ratios[Math.floor(ratios.length / 2)];

    const pagesWithSpread = pageData.map(p => ({
      ...p,
      is_double_spread: isDoubleSpread(p.width, p.height, medianRatio)
    }));

    // Insert all pages into SQLite
    const insertPage = db.prepare(`
      INSERT INTO pages (id, issue_id, page_number, image_key, width, height, is_double_spread)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    db.transaction((pages) => {
      for (const p of pages) {
        insertPage.run(crypto.randomUUID(), p.issue_id, p.page_number, p.image_key, p.width, p.height, p.is_double_spread ? 1 : 0);
      }
    })(pagesWithSpread);

    // Update issue page count
    db.prepare('UPDATE issues SET page_count = ? WHERE id = ?').run(pageData.length, issueId);

    // Generate and save cover
    if (sourceImages.length > 0) {
      const coverBuffer = await sharp(sourceImages[0])
        .resize(400, 600, { fit: 'cover' })
        .webp({ quality: 80 })
        .toBuffer();

      const coverKey = `${userId}/covers/${finalSeriesId}.webp`;
      const coverFullPath = path.join(IMAGES_DIR, coverKey);
      fs.mkdirSync(path.dirname(coverFullPath), { recursive: true });
      fs.writeFileSync(coverFullPath, coverBuffer);

      const currentSeries = db.prepare('SELECT cover_url FROM series WHERE id = ?').get(finalSeriesId);
      if (!currentSeries?.cover_url) {
        db.prepare('UPDATE series SET cover_url = ? WHERE id = ?').run(coverKey, finalSeriesId);
      }
    }

    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(filePath, { force: true });

    return {
      success: true,
      seriesId: finalSeriesId,
      issueId,
      pageCount: pageData.length,
      message: `Uploaded ${pageData.length} pages (${fileType.toUpperCase()})`
    };

  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(filePath, { force: true });
    throw error;
  }
}

// ======================================================================
// Routes
// ======================================================================

// ---- Single-file upload (original, works for files < 100MB through Cloudflare) ----
router.post('/', authenticate, upload.single('file'), async (req, res) => {
  if (!req.isAdmin) {
    if (req.file?.path) fs.rmSync(req.file.path, { force: true });
    return res.status(403).json({ error: 'Only administrators can upload comics' });
  }

  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const result = await processUploadedFile({
      filePath: req.file.path,
      fileName: req.file.originalname,
      ...req.body
    });
    res.json(result);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---- Chunked upload: receive a single chunk ----
router.post('/chunk', authenticate, chunkUpload.single('chunk'), (req, res) => {
  if (!req.isAdmin) {
    if (req.file?.path) fs.rmSync(req.file.path, { force: true });
    return res.status(403).json({ error: 'Only administrators can upload comics' });
  }

  const { uploadId, chunkIndex, totalChunks } = req.body;
  if (!uploadId || chunkIndex === undefined || !totalChunks) {
    return res.status(400).json({ error: 'Missing chunk metadata (uploadId, chunkIndex, totalChunks)' });
  }

  res.json({
    success: true,
    chunkIndex: parseInt(chunkIndex),
    totalChunks: parseInt(totalChunks)
  });
});

// ---- Chunked upload: reassemble and process ----
router.post('/complete', authenticate, async (req, res) => {
  if (!req.isAdmin) {
    return res.status(403).json({ error: 'Only administrators can upload comics' });
  }

  const { uploadId, fileName, totalChunks, seriesTitle, seriesId, category, issueNumber, issueTitle, description, userId } = req.body;

  if (!uploadId || !fileName || !userId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const chunkDir = path.join(TEMP_DIR, `chunks-${uploadId}`);

  if (!fs.existsSync(chunkDir)) {
    return res.status(400).json({ error: 'No chunks found for this upload. Please re-upload.' });
  }

  try {
    // Reassemble chunks into a single file
    const chunks = fs.readdirSync(chunkDir)
      .filter(f => f.startsWith('chunk-'))
      .sort();

    if (totalChunks && chunks.length !== parseInt(totalChunks)) {
      throw new Error(`Expected ${totalChunks} chunks but found ${chunks.length}. Upload may be incomplete.`);
    }

    const assembledPath = path.join(TEMP_DIR, `${uploadId}-${fileName}`);
    const writeStream = fs.createWriteStream(assembledPath);

    for (const chunkFile of chunks) {
      const chunkData = fs.readFileSync(path.join(chunkDir, chunkFile));
      writeStream.write(chunkData);
    }

    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      writeStream.end();
    });

    // Clean up chunk directory
    fs.rmSync(chunkDir, { recursive: true, force: true });

    // Process the reassembled file
    const result = await processUploadedFile({
      filePath: assembledPath,
      fileName,
      seriesTitle,
      seriesId,
      category,
      issueNumber,
      issueTitle,
      description,
      userId
    });

    res.json(result);

  } catch (error) {
    console.error('Chunked upload complete error:', error);
    fs.rmSync(chunkDir, { recursive: true, force: true });
    res.status(500).json({ error: error.message });
  }
});

export default router;
