import { useEffect, useState } from 'react';
import { supabase, type DadashUser, type UserRole } from '@/lib/supabase';

export function useAuth() {
  const [user, setUser] = useState<DadashUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
        // Demo mode : bootstrap DADA user
        setUser({
          id: 'demo-dada',
          email: 'martin.delamare@mail.novancia.fr',
          role: 'admin',
          name: 'DADA',
          tenant_id: 'dadash',
        });
      }
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!session) {
        setUser(null);
        return;
      }
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
  // TODO: Charger depuis tenant_features Supabase. Pour l'instant tout activé.
  void flag;
  return true;
}
