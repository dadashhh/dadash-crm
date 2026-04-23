// Serverless function Vercel : renvoie les env vars publiques au client.
// Aucun secret sensible côté serveur n'est exposé — seulement ce dont la v1 a besoin.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({
    SUPABASE_URL: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://lkrzjwfwhiimpnsyeuxi.supabase.co',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
    CRM_API_KEY: process.env.CRM_API_KEY || process.env.DADASH_INTERNAL_API_KEY || '',
    DADASH_INTERNAL_API_KEY: process.env.DADASH_INTERNAL_API_KEY || process.env.CRM_API_KEY || '',
    TELEGRAM_BOT_URL: process.env.TELEGRAM_BOT_URL || 'https://dadash-autofill-v2-production.up.railway.app',
  });
}
