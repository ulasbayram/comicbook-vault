import { Router } from 'express';
import crypto from 'crypto';
import db from '../lib/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

function hashPassword(password) {
  // Use a static salt for simplicity, or generate and store one.
  // For a basic local app, a static salt or basic hex generation is okay, 
  // but a unique salt per user is better. We'll store salt:hash.
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, key] = storedHash.split(':');
  const hashBuffer = crypto.scryptSync(password, salt, 64);
  const keyBuffer = Buffer.from(key, 'hex');
  const match = crypto.timingSafeEqual(hashBuffer, keyBuffer);
  return match;
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// POST /api/auth/signup
router.post('/signup', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: 'Invalid email or password (min 6 chars)' });
  }

  try {
    const id = crypto.randomUUID();
    const passwordHash = hashPassword(password);

    db.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)').run(id, email, passwordHash);
    res.status(201).json({ message: 'User created' });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const user = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email);
    
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken();
    db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, user.id);

    const normalizedEmail = (email || '').toLowerCase().trim();
    res.json({ token, user: { id: user.id, email, isAdmin: normalizedEmail === 'ulas.bayram8527@gmail.com' } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  try {
    const user = { id: req.userId, email: req.userEmail, isAdmin: req.isAdmin };
    
    // Create dummy session object for frontend compat
    res.json({ session: { user } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader.split(' ')[1];
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to logout' });
  }
});

export default router;
