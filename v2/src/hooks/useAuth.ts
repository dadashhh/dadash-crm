import { useEffect, useState } from 'react';
import { supabase, isDemoMode, type DadashUser, type UserRole } from '@/lib/supabase';

const DEMO_USER: DadashUser = {
  id: 'demo-dada',
  email: 'martin.delamare@mail.novancia.fr',
  role: 'admin',
  name: 'DADA',
  tenant_id: 'dadash',
};

export function useAuth() {
  const [user, setUser] = useState<DadashUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Demo mode : bypass supabase auth entirely, bootstrap DADA admin user
    if (isDemoMode) {
      setUser(DEMO_USER);
      setLoading(false);
      return;
    }

    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) {
        const u = data.session.user;
        setUser({
          id: u.id,
          email: u.email ?? '',
          role: (u.user_metadata?.role ?? 'admin') as UserRole,
          name: u.user_metadata?.name ?? u.email ?? 'User',
          tenant_id: u.user_metadata?.tenant_id ?? 'default',
        });
      } else {
        // Auth configured but no session yet — fallback to demo user (pas de flow login formel pour l'instant)
        setUser(DEMO_USER);
      }
      setLoading(false);
    }).catch(() => {
      if (!mounted) return;
      // Supabase injoignable → fallback demo
      setUser(DEMO_USER);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!session) return; // ne pas écraser le demo user si session null
      const u = session.user;
      setUser({
        id: u.id,
        email: u.email ?? '',
        role: (u.user_metadata?.role ?? 'admin') as UserRole,
        name: u.user_metadata?.name ?? u.email ?? 'User',
        tenant_id: u.user_metadata?.tenant_id ?? 'default',
      });
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, loading, signOut: () => supabase.auth.signOut() };
}

export function useFeatureFlag(flag: string): boolean {
  void flag;
  return true;
}
