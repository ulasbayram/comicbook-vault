import { Router } from 'express';
import supabase from '../lib/supabase.js';

const router = Router();

// Get presigned URLs for all pages of an issue
router.get('/issue/:issueId', async (req, res) => {
  try {
    const { issueId } = req.params;

    // Get all pages for this issue
    const { data: pages, error } = await supabase
      .from('pages')
      .select('*')
      .eq('issue_id', issueId)
      .order('page_number', { ascending: true });

    if (error) throw error;
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
router.get('/cover/:seriesId', async (req, res) => {
  try {
    const { data: series, error } = await supabase
      .from('series')
      .select('cover_url')
      .eq('id', req.params.seriesId)
      .single();

    if (error || !series?.cover_url) {
      return res.status(404).json({ error: 'No cover found' });
    }

    const url = `/data/images/${series.cover_url}`;
    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Batch cover URLs for library page
router.post('/covers', async (req, res) => {
  try {
    const { seriesIds } = req.body;
    if (!seriesIds?.length) return res.json([]);

    const { data: seriesList, error } = await supabase
      .from('series')
      .select('id, cover_url')
      .in('id', seriesIds);

    if (error) throw error;

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
