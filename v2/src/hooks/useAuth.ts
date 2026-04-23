import { useEffect, useState } from 'react';
import { supabase, type DadashUser, type UserRole } from '@/lib/supabase';

async function loadProfile(userId: string, email: string): Promise<DadashUser | null> {
  const { data, error } = await supabase.from('profiles').select('id,name,role,active').eq('id', userId).maybeSingle();
  if (error || !data) {
    return { id: userId, email, role: 'admin', name: email, tenant_id: 'dadash' };
  }
  return {
    id: data.id,
    email,
    role: (data.role ?? 'admin') as UserRole,
    name: data.name ?? email,
    tenant_id: 'dadash',
  };
}

export function useAuth() {
  const [user, setUser] = useState<DadashUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      if (data.session) {
        const u = data.session.user;
        const profile = await loadProfile(u.id, u.email ?? '');
        if (mounted) setUser(profile);
      }
      setLoading(false);
    }).catch(() => {
      if (mounted) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (evt, session) => {
      if (evt === 'SIGNED_OUT' || !session) {
        setUser(null);
        return;
      }
      const profile = await loadProfile(session.user.id, session.user.email ?? '');
      setUser(profile);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    setSigningIn(true);
    setSignInError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSigningIn(false);
    if (error) {
      setSignInError(error.message);
      return false;
    }
    return true;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return { user, loading, signIn, signOut, signingIn, signInError };
}

export function useFeatureFlag(flag: string): boolean {
  void flag;
  return true;
}
