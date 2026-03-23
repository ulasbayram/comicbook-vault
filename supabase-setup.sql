-- ComicVault Supabase Schema Setup
-- Run this in Supabase Dashboard → SQL Editor → New Query → Paste → Run

-- Series table
CREATE TABLE IF NOT EXISTS series (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('comic', 'webtoon', 'manga')),
  cover_url TEXT,
  description TEXT DEFAULT '',
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Issues table
CREATE TABLE IF NOT EXISTS issues (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  series_id UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  issue_number INTEGER NOT NULL,
  title TEXT DEFAULT '',
  page_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Pages table
CREATE TABLE IF NOT EXISTS pages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  image_key TEXT NOT NULL,
  width INTEGER DEFAULT 0,
  height INTEGER DEFAULT 0,
  is_double_spread BOOLEAN DEFAULT false
);

-- Reading progress table
CREATE TABLE IF NOT EXISTS reading_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_page INTEGER DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(issue_id, user_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_series_user ON series(user_id);
CREATE INDEX IF NOT EXISTS idx_series_category ON series(category);
CREATE INDEX IF NOT EXISTS idx_issues_series ON issues(series_id);
CREATE INDEX IF NOT EXISTS idx_pages_issue ON pages(issue_id);
CREATE INDEX IF NOT EXISTS idx_progress_user_issue ON reading_progress(user_id, issue_id);

-- Enable Row Level Security
ALTER TABLE series ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies: users can only see/modify their own data

-- Series policies
CREATE POLICY "Users can view own series" ON series
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own series" ON series
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own series" ON series
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own series" ON series
  FOR DELETE USING (auth.uid() = user_id);

-- Service role bypass for backend operations
CREATE POLICY "Service role full access to series" ON series
  FOR ALL USING (auth.role() = 'service_role');

-- Issues policies (access through series ownership)
CREATE POLICY "Users can view issues of own series" ON issues
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM series WHERE series.id = issues.series_id AND series.user_id = auth.uid())
  );
CREATE POLICY "Service role full access to issues" ON issues
  FOR ALL USING (auth.role() = 'service_role');

-- Pages policies (access through issue → series ownership)
CREATE POLICY "Users can view pages of own issues" ON pages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM issues
      JOIN series ON series.id = issues.series_id
      WHERE issues.id = pages.issue_id AND series.user_id = auth.uid()
    )
  );
CREATE POLICY "Service role full access to pages" ON pages
  FOR ALL USING (auth.role() = 'service_role');

-- Reading progress policies
CREATE POLICY "Users can manage own progress" ON reading_progress
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role full access to progress" ON reading_progress
  FOR ALL USING (auth.role() = 'service_role');
