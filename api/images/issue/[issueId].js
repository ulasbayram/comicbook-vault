import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@supabase/supabase-js';

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME || 'comicvault';
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function presign(key, expiresIn = 3600) {
  return getSignedUrl(r2, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { issueId } = req.query;

  try {
    const { data: pages, error } = await supabase
      .from('pages')
      .select('*')
      .eq('issue_id', issueId)
      .order('page_number', { ascending: true });

    if (error) throw error;
    if (!pages?.length) return res.status(404).json({ error: 'No pages found' });

    const pagesWithUrls = await Promise.all(
      pages.map(async (page) => ({
        ...page,
        image_url: await presign(page.image_key, 7200)
      }))
    );

    res.setHeader('Cache-Control', 's-maxage=300');
    res.json(pagesWithUrls);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}
