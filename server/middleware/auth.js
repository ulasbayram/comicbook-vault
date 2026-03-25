import db from '../lib/db.js';

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization token' });
  }

  const token = authHeader.split(' ')[1];

  // Try to find the session and user email
  const session = db.prepare(`
    SELECT s.user_id, u.email 
    FROM sessions s 
    JOIN users u ON s.user_id = u.id 
    WHERE s.token = ?
  `).get(token);

  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  // Attach user ID and admin status to request
  req.userId = session.user_id;
  req.userEmail = session.email;
  req.isAdmin = session.email === 'ulas.bayram8527@gmail.com';
  next();
}
