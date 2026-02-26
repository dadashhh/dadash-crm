// ─────────────────────────────────────────────
// Supabase client — service role (bypasses RLS)
// ─────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(1);
}

export const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type AlertStatus = 'pending' | 'sent' | 'error';

export interface ManagerAlert {
  id: string;
  created_at: string;
  type: string;
  message: string;
  payload: Record<string, unknown> | null;
  status: AlertStatus;
  sent_at: string | null;
  last_error: string | null;
  retry_count: number;
}

export interface ManagerSettings {
  id: true;
  tg_chat_id: string | null;
}
