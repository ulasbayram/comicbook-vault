import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Data directory is mapped to the persistent volume in Docker setup
const dataDir = path.join(path.resolve(__dirname, '..', '..'), 'data');
const dbPath = path.join(dataDir, 'comicvault.db');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS series (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('comic', 'webtoon', 'manga')),
    cover_url TEXT,
    description TEXT DEFAULT '',
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS issues (
    id TEXT PRIMARY KEY,
    series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
    issue_number INTEGER NOT NULL,
    title TEXT DEFAULT '',
    page_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS pages (
    id TEXT PRIMARY KEY,
    issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    image_key TEXT NOT NULL,
    width INTEGER DEFAULT 0,
    height INTEGER DEFAULT 0,
    is_double_spread INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS reading_progress (
    id TEXT PRIMARY KEY,
    issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    current_page INTEGER DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(issue_id, user_id)
  );

  -- Create indexes for performance
  CREATE INDEX IF NOT EXISTS idx_series_user ON series(user_id);
  CREATE INDEX IF NOT EXISTS idx_series_category ON series(category);
  CREATE INDEX IF NOT EXISTS idx_issues_series ON issues(series_id);
  CREATE INDEX IF NOT EXISTS idx_pages_issue ON pages(issue_id);
  CREATE INDEX IF NOT EXISTS idx_progress_user_issue ON reading_progress(user_id, issue_id);
`);

export default db;
