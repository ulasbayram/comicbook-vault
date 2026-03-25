import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { exec } from 'child_process';
import { promisify } from 'util';
import supabase from '../lib/supabase.js';

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

const router = Router();

// ---- File type detection ----
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

// ---- CBR extraction ----
async function extractCbrImages(cbrPath, outputDir) {
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
    const ext = path.extname(entries[i].name).toLowerCase();
    const outPath = path.join(outputDir, `page-${String(i + 1).padStart(4, '0')}${ext}`);
    fs.writeFileSync(outPath, Buffer.from(entries[i].extraction));
    paths.push(outPath);
  }
  return paths;
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

// ---- Main upload route ----
router.post('/', upload.single('file'), async (req, res) => {
  const tempDir = path.join(TEMP_DIR, `job-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const { seriesTitle, seriesId, category, issueNumber, issueTitle, description, userId } = req.body;

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (!userId) return res.status(400).json({ error: 'User ID is required' });

    const fileType = getFileType(req.file.originalname);
    if (fileType === 'unknown') return res.status(400).json({ error: 'Unsupported file type' });

    // Create or get series
    let finalSeriesId = seriesId;
    if (!seriesId || seriesId === 'new') {
      if (!seriesTitle) return res.status(400).json({ error: 'Series title required' });

      const { data: newSeries, error } = await supabase
        .from('series')
        .insert({ title: seriesTitle, category: category || 'comic', description: description || '', user_id: userId })
        .select('id')
        .single();

      if (error) throw error;
      finalSeriesId = newSeries.id;
    }

    // Create issue
    const { data: newIssue, error: issueError } = await supabase
      .from('issues')
      .insert({ series_id: finalSeriesId, issue_number: parseInt(issueNumber) || 1, title: issueTitle || '' })
      .select('id')
      .single();

    if (issueError) throw issueError;
    const issueId = newIssue.id;

    // Extract/convert source images
    const sourceImages = await getSourceImages(req.file.path, fileType, tempDir);

    // Process and upload each page to R2
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

    // Insert all pages into Supabase
    const { error: pagesError } = await supabase.from('pages').insert(pagesWithSpread);
    if (pagesError) throw pagesError;

    // Update issue page count
    await supabase.from('issues').update({ page_count: pageData.length }).eq('id', issueId);

    // Generate and upload cover
    if (sourceImages.length > 0) {
      const coverBuffer = await sharp(sourceImages[0])
        .resize(400, 600, { fit: 'cover' })
        .webp({ quality: 80 })
        .toBuffer();

      const coverKey = `${userId}/covers/${finalSeriesId}.webp`;
      const fullPath = path.join(IMAGES_DIR, coverKey);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, coverBuffer);

      // Only set cover if series doesn't have one
      const { data: currentSeries } = await supabase
        .from('series').select('cover_url').eq('id', finalSeriesId).single();

      if (!currentSeries?.cover_url) {
        await supabase.from('series').update({ cover_url: coverKey }).eq('id', finalSeriesId);
      }
    }

    // Clean up temp files
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (req.file.path) fs.rmSync(req.file.path, { force: true });

    res.json({
      success: true,
      seriesId: finalSeriesId,
      issueId,
      pageCount: pageData.length,
      message: `Uploaded ${pageData.length} pages (${fileType.toUpperCase()})`
    });

  } catch (error) {
    console.error('Upload error:', error);
    // Clean up temp files on error
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (req.file?.path) fs.rmSync(req.file.path, { force: true });
    res.status(500).json({ error: error.message });
  }
});

export default router;
