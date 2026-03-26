import { Router } from 'express';
import db from '../lib/db.js';
import { authenticate } from '../middleware/auth.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IMAGES_DIR = path.join(path.resolve(__dirname, '..', '..'), 'data', 'images');

// GET /api/series -> list all series with issue count
router.get('/', authenticate, (req, res) => {
  try {
    const { category, search } = req.query;
    let query = `
      SELECT s.*, COUNT(i.id) as issue_count 
      FROM series s
      LEFT JOIN issues i ON s.id = i.series_id
      WHERE 1=1
    `;
    const params = [];

    if (category && category !== 'all') {
      query += ` AND s.category = ?`;
      params.push(category);
    }

    if (search) {
      query += ` AND s.title LIKE ?`;
      params.push(`%${search}%`);
    }

    query += ` GROUP BY s.id ORDER BY s.created_at DESC`;

    const series = db.prepare(query).all(...params);
    res.json(series);
  } catch (error) {
    console.error('Fetch series error:', error);
    res.status(500).json({ error: 'Failed to fetch series' });
  }
});

// GET /api/series/:id -> get single series details
router.get('/:id', authenticate, (req, res) => {
  try {
    const series = db.prepare('SELECT * FROM series WHERE id = ?').get(req.params.id);
    if (!series) return res.status(404).json({ error: 'Series not found' });
    
    res.json(series);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch series details' });
  }
});

// GET /api/series/:id/issues -> get issues for a series along with reading progress
router.get('/:id/issues', authenticate, (req, res) => {
  try {
    const issues = db.prepare(`
      SELECT i.*, rp.current_page 
      FROM issues i
      LEFT JOIN reading_progress rp ON i.id = rp.issue_id AND rp.user_id = ?
      WHERE i.series_id = ?
      ORDER BY i.issue_number ASC
    `).all(req.userId, req.params.id);

    res.json(issues);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch issues' });
  }
});

// GET /api/series/issue/:id -> get single issue with series
router.get('/issue/:id', authenticate, (req, res) => {
  try {
    const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(req.params.id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });
    
    // Check if series exists
    const series = db.prepare('SELECT * FROM series WHERE id = ?').get(issue.series_id);
    if (!series) return res.status(404).json({ error: 'Series not found' });
    
    issue.series = series;
    res.json(issue);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch issue' });
  }
});

// PUT /api/series/issue/:id -> update issue details
router.put('/issue/:id', authenticate, (req, res) => {
  try {
    if (!req.isAdmin) return res.status(403).json({ error: 'Only administrators can edit issues' });

    const { title, issueNumber } = req.body;
    db.prepare('UPDATE issues SET title = ?, issue_number = ? WHERE id = ?')
      .run(title || '', parseInt(issueNumber) || 1, req.params.id);

    res.json({ success: true });
  } catch (error) {
    console.error('Edit issue error:', error);
    res.status(500).json({ error: 'Failed to edit issue' });
  }
});

// DELETE /api/series/issue/:id -> delete single issue
router.delete('/issue/:id', authenticate, (req, res) => {
  try {
    if (!req.isAdmin) return res.status(403).json({ error: 'Only administrators can delete issues' });

    const issue = db.prepare('SELECT id, series_id FROM issues WHERE id = ?').get(req.params.id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    const series = db.prepare('SELECT user_id FROM series WHERE id = ?').get(issue.series_id);
    
    // SQLite ON DELETE CASCADE handles DB removal
    db.prepare('DELETE FROM issues WHERE id = ?').run(req.params.id);

    // Physically explicitly clean up the image folder for this specific issue
    if (series) {
      const issueFolder = path.join(IMAGES_DIR, series.user_id, issue.series_id, issue.id);
      fs.rmSync(issueFolder, { recursive: true, force: true });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete issue error:', error);
    res.status(500).json({ error: 'Failed to delete issue' });
  }
});

// DELETE /api/series/:id
router.delete('/:id', authenticate, (req, res) => {
  try {
    if (!req.isAdmin) return res.status(403).json({ error: 'Only administrators can delete series' });

    // Find the series cover
    const series = db.prepare('SELECT id, cover_url FROM series WHERE id = ?').get(req.params.id);
    if (!series) return res.status(404).json({ error: 'Series not found' });

    // SQLite ON DELETE CASCADE will delete issues, pages, and reading_progress from DB
    db.prepare('DELETE FROM series WHERE id = ?').run(req.params.id);

    // Optionally clean up files - this deletes the whole series folder
    const seriesFolder = path.join(IMAGES_DIR, req.userId, req.params.id);
    fs.rmSync(seriesFolder, { recursive: true, force: true });
    
    // Also delete cover
    if (series.cover_url) {
      const coverPath = path.join(IMAGES_DIR, series.cover_url);
      fs.rmSync(coverPath, { force: true });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete series error:', error);
    res.status(500).json({ error: 'Failed to delete series' });
  }
});

export default router;
