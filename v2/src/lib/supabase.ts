import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL || 'https://lkrzjwfwhiimpnsyeuxi.supabase.co';
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key-not-configured';

const envMissing = !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY;

if (envMissing && typeof window !== 'undefined') {
  console.warn(
    '[DADASH v2] Supabase env vars missing — running in demo mode.\n' +
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel → Settings → Environment Variables.',
  );
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: !envMissing,
    autoRefreshToken: !envMissing,
    storageKey: 'dadash-v2-auth',
  },
});

export const isDemoMode = envMissing;

export type UserRole = 'admin' | 'mc' | 'chatter' | 'model';

export interface DadashUser {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  tenant_id: string;
}
