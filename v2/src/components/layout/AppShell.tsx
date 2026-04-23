import { Outlet } from '@tanstack/react-router';
import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useAuth } from '@/hooks/useAuth';

export function AppShell() {
  const { user, loading, signIn, signingIn, signInError } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <LoginScreen signIn={signIn} signingIn={signingIn} signInError={signInError} />;
  return (
    <div className="flex min-h-screen relative z-[2]">
      <Sidebar role={user.role} />
      <main className="flex-1 min-w-0 relative">
        <Topbar user={user} />
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-[var(--metallic)] flex items-center justify-center font-bold text-[#0a0d18] text-[22px] glow-breathe">D</div>
        <div className="mt-4 text-[12px] mono-tag">Chargement…</div>
      </div>
    </div>
  );
}

interface LoginProps {
  signIn: (email: string, password: string) => Promise<boolean>;
  signingIn: boolean;
  signInError: string | null;
}

function LoginScreen({ signIn, signingIn, signInError }: LoginProps) {
  const [email, setEmail] = useState('martin.delamare@mail.novancia.fr');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    await signIn(email, password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="max-w-md w-full p-8 rounded-[20px] border border-[var(--color-border-2)] bg-[var(--color-card)]" style={{ boxShadow: 'var(--shadow-deep)' }}>
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-bold mx-auto" style={{ background: 'var(--metallic)', color: '#0a0d18', fontSize: 22 }}>D</div>
        <div className="text-center mt-4 text-[22px] font-bold metallic-anim">DADASH v2</div>
        <div className="text-center text-[12px]" style={{ color: 'var(--color-muted)' }}>Connexion requise · Supabase auth</div>

        <div className="mt-6 space-y-3">
          <div>
            <label className="mono-tag block mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full px-3 py-2.5 text-[13px] bg-[var(--color-card-2)] border border-[var(--color-border)] rounded-[10px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
              required
            />
          </div>
          <div>
            <label className="mono-tag block mb-1">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full px-3 py-2.5 text-[13px] bg-[var(--color-card-2)] border border-[var(--color-border)] rounded-[10px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
              required
            />
          </div>
        </div>

        {signInError && (
          <div className="mt-4 p-3 rounded-xl text-[12px]" style={{ background: 'rgba(251,113,133,0.08)', border: '1px solid rgba(251,113,133,0.25)', color: 'var(--color-danger)' }}>
            {signInError}
          </div>
        )}

        <button
          type="submit"
          disabled={signingIn || !email || !password}
          className="w-full mt-6 py-3 rounded-[10px] text-[13px] font-semibold text-white"
          style={{
            background: 'var(--grad-primary)',
            boxShadow: '0 6px 20px rgba(99,102,241,0.4)',
            border: '1px solid rgba(199,210,254,0.2)',
            opacity: signingIn || !email || !password ? 0.6 : 1,
            cursor: signingIn || !email || !password ? 'not-allowed' : 'pointer',
          }}
        >
          {signingIn ? 'Connexion…' : 'Se connecter'}
        </button>

        <div className="text-center mt-4 text-[10.5px]" style={{ color: 'var(--color-muted)' }}>
          v2.0 · Supabase lkrzjwfwhiimpnsyeuxi · RLS 128/128
        </div>
      </form>
    </div>
  );
}
