import db from '../lib/db.js';

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization token' });
  }

  const token = authHeader.split(' ')[1];

  // Try to find the session
  const session = db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token);

  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  // Attach user ID to request
  req.userId = session.user_id;
  next();
}
