import { Router } from 'express';
import db from '../lib/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// GET /api/progress/:issueId
router.get('/:issueId', authenticate, (req, res) => {
  try {
    const progress = db.prepare('SELECT current_page FROM reading_progress WHERE issue_id = ? AND user_id = ?').get(req.params.issueId, req.userId);
    res.json(progress || { current_page: null });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

// POST /api/progress -> Upsert reading progress for an issue
router.post('/', authenticate, (req, res) => {
  try {
    const { issue_id, current_page } = req.body;
    
    if (!issue_id || current_page === undefined) {
      return res.status(400).json({ error: 'issue_id and current_page required' });
    }

    // Upsert using ON CONFLICT (requires UNIQUE constraint on issue_id, user_id)
    db.prepare(`
      INSERT INTO reading_progress (issue_id, user_id, current_page, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(issue_id, user_id) DO UPDATE SET 
        current_page = excluded.current_page,
        updated_at = CURRENT_TIMESTAMP
    `).run(issue_id, req.userId, current_page);

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to update progress:', error);
    res.status(500).json({ error: 'Failed to save progress' });
  }
});

export default router;
