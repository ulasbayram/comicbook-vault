import { Router } from 'express';
import db from '../lib/db.js';

const router = Router();

// Get presigned URLs for all pages of an issue
router.get('/issue/:issueId', (req, res) => {
  try {
    const { issueId } = req.params;

    // Get all pages for this issue
    const pages = db.prepare('SELECT * FROM pages WHERE issue_id = ? ORDER BY page_number ASC').all(issueId);

    if (!pages?.length) return res.status(404).json({ error: 'No pages found' });

    // Return local URLs for all pages
    const pagesWithUrls = pages.map((page) => ({
      ...page,
      image_url: `/data/images/${page.image_key}`
    }));

    res.json(pagesWithUrls);
  } catch (error) {
    console.error('Image URL error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get presigned URL for a cover image
router.get('/cover/:seriesId', (req, res) => {
  try {
    const series = db.prepare('SELECT cover_url FROM series WHERE id = ?').get(req.params.seriesId);

    if (!series || !series.cover_url) {
      return res.status(404).json({ error: 'No cover found' });
    }

    const url = `/data/images/${series.cover_url}`;
    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Batch cover URLs for library page
router.post('/covers', (req, res) => {
  try {
    const { seriesIds } = req.body;
    if (!seriesIds?.length) return res.json([]);

    // Create a dynamic IN clause
    const placeholders = seriesIds.map(() => '?').join(',');
    const seriesList = db.prepare(`SELECT id, cover_url FROM series WHERE id IN (${placeholders})`).all(...seriesIds);

    const covers = seriesList
      .filter(s => s.cover_url)
      .map((s) => ({
        seriesId: s.id,
        url: `/data/images/${s.cover_url}`
      }));

    res.json(covers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
