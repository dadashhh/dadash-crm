import { createClient } from '@supabase/supabase-js';

// Hardcoded fallback — anon key publique protégée par RLS Supabase
const DEFAULT_URL = 'https://lkrzjwfwhiimpnsyeuxi.supabase.co';
const DEFAULT_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxrcnpqd2Z3aGlpbXBuc3lldXhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0NTYwNDgsImV4cCI6MjA4NzAzMjA0OH0.qs9yvOv_eb_QIHzv977qRwEBIIHDfyAvtKRvdJ4DKus';

const url = import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;

// Demo mode uniquement si les env vars sont absentes ET on utilise un URL invalide
export const isDemoMode = false; // Maintenant on a toujours une URL valide

if (typeof window !== 'undefined') {
  console.info('[DADASH v2] Supabase client', { urlConfigured: !!import.meta.env.VITE_SUPABASE_URL, keyConfigured: !!import.meta.env.VITE_SUPABASE_ANON_KEY });
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'dadash-v2-auth',
  },
});

export type UserRole = 'admin' | 'mc' | 'chatter' | 'model' | 'gerant';

export interface DadashUser {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  tenant_id: string;
}
