import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.warn('[DADASH v2] Supabase env vars missing — running in demo mode');
}

export const supabase = createClient(url ?? '', key ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'dadash-v2-auth',
  },
});

export type UserRole = 'admin' | 'mc' | 'chatter' | 'model';

export interface DadashUser {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  tenant_id: string;
}
