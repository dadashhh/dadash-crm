import { useRouterState } from '@tanstack/react-router';
import { Chip } from '@/components/ui/Chip';
import type { DadashUser } from '@/lib/supabase';

const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/live-ops': 'Live OPS',
  '/messagerie': 'Messagerie',
  '/dadacast': 'Dadacast',
  '/spenders': 'Spenders',
  '/zoo-map': 'Zoo Map',
  '/modeles': 'Modèles',
  '/equipe': 'Équipe',
  '/providers': 'Providers',
  '/catalogue': 'Catalogue',
  '/gestion': 'Gestion agence',
  '/swisscam': 'SwissCam',
  '/params': 'Paramètres',
};

export function Topbar({ user }: { user: DadashUser }) {
  const { location } = useRouterState();
  const title = TITLES[location.pathname] ?? 'DADASH';

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] glass">
      <div className="flex items-center gap-4 px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold">{title}</span>
          <Chip tone="indigo">{user.role.toUpperCase()}</Chip>
        </div>
        <div className="flex-1 max-w-xl mx-auto relative">
          <input
            type="text"
            placeholder="Rechercher…  ⌘K"
            className="w-full pl-10 py-2 text-[13px] rounded-[10px] border border-[var(--color-border)] bg-[rgba(15,20,35,0.6)] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] focus:shadow-[0_0_0_3px_rgba(129,140,248,0.12)]"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 font-[var(--font-mono)] text-[11px] flex items-center gap-2 bg-[var(--color-card-2)] border border-[var(--color-border)] rounded-[10px]">
            <span className="w-1.5 h-1.5 rounded-full blink bg-[var(--color-success)]" />
            <span className="text-[var(--color-muted)]">CHF/EUR</span>
            <span className="metallic-text">0.9420</span>
          </div>
          <div className="flex items-center gap-2 pl-3 border-l border-[var(--color-border)]">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-[12px] bg-[var(--metallic)] text-[#0a0d18]">
              {user.name[0]}
            </div>
            <div className="text-right leading-tight">
              <div className="text-[12.5px] font-semibold">{user.name}</div>
              <div className="text-[10px] font-[var(--font-mono)] text-[var(--color-muted)]">GMT-3 · Brésil</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
