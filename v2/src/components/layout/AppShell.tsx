import { Outlet } from '@tanstack/react-router';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useAuth } from '@/hooks/useAuth';

export function AppShell() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <LoginScreen />;
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

function LoginScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full p-8 rounded-[20px] border border-[var(--color-border-2)] bg-[var(--color-card)] shadow-[var(--shadow-deep)]">
        <div className="w-12 h-12 rounded-2xl bg-[var(--metallic)] flex items-center justify-center font-bold text-[#0a0d18] text-[22px] mx-auto">D</div>
        <div className="text-center mt-4 text-[20px] font-bold metallic-anim">DADASH v2</div>
        <div className="text-center text-[12px] text-[var(--color-muted)]">Connexion requise</div>
        <button className="w-full mt-6 py-2.5 rounded-[10px] text-[13px] font-semibold text-white bg-[var(--grad-primary)] shadow-[0_6px_20px_rgba(99,102,241,0.4)]">
          Se connecter
        </button>
      </div>
    </div>
  );
}
