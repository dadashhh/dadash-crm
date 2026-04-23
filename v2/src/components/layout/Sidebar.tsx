import { Link, useRouterState } from '@tanstack/react-router';
import { cn } from '@/lib/cn';
import type { UserRole } from '@/lib/supabase';

interface NavEntry {
  to: string;
  label: string;
  emoji: string;
  roles: UserRole[];
  badge?: { value: string | number; tone?: 'danger' | 'indigo' };
  group: 'OPS' | 'BUSINESS' | 'ADMIN';
}

const NAV: NavEntry[] = [
  { to: '/', label: 'Dashboard', emoji: '📊', roles: ['admin', 'mc', 'chatter', 'model'], group: 'OPS' },
  { to: '/live-ops', label: 'Live OPS', emoji: '🖥️', roles: ['admin', 'mc'], badge: { value: 'LIVE', tone: 'danger' }, group: 'OPS' },
  { to: '/messagerie', label: 'Messagerie', emoji: '✉️', roles: ['admin', 'mc', 'chatter'], badge: { value: 7, tone: 'indigo' }, group: 'OPS' },
  { to: '/dadacast', label: 'Dadacast', emoji: '📡', roles: ['admin', 'mc'], group: 'OPS' },
  { to: '/spenders', label: 'Spenders', emoji: '👤', roles: ['admin', 'mc'], group: 'BUSINESS' },
  { to: '/zoo-map', label: 'Zoo Map', emoji: '🗺️', roles: ['admin', 'mc'], group: 'BUSINESS' },
  { to: '/modeles', label: 'Modèles', emoji: '✨', roles: ['admin', 'mc', 'chatter', 'model'], group: 'BUSINESS' },
  { to: '/equipe', label: 'Équipe', emoji: '👥', roles: ['admin', 'mc'], group: 'BUSINESS' },
  { to: '/providers', label: 'Providers', emoji: '🏦', roles: ['admin'], group: 'BUSINESS' },
  { to: '/catalogue', label: 'Catalogue', emoji: '🎁', roles: ['admin', 'mc', 'chatter'], group: 'BUSINESS' },
  { to: '/gestion', label: 'Gestion agence', emoji: '🧾', roles: ['admin'], group: 'ADMIN' },
  { to: '/swisscam', label: 'SwissCam', emoji: '📸', roles: ['admin', 'mc'], badge: { value: '3 live', tone: 'danger' }, group: 'ADMIN' },
  { to: '/params', label: 'Paramètres', emoji: '⚙️', roles: ['admin', 'mc', 'chatter', 'model'], group: 'ADMIN' },
];

export function Sidebar({ role }: { role: UserRole }) {
  const state = useRouterState();
  const pathname = state.location.pathname;
  const visible = NAV.filter((n) => n.roles.includes(role));
  const groups = (['OPS', 'BUSINESS', 'ADMIN'] as const).map((g) => ({ g, items: visible.filter((n) => n.group === g) })).filter((grp) => grp.items.length > 0);

  return (
    <aside className="w-[248px] shrink-0 border-r border-[var(--color-border)] bg-[var(--color-sidebar)] relative">
      <div className="p-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-[14px] flex items-center justify-center font-bold text-[20px] bg-[var(--metallic)] text-[#0a0d18] shadow-[0_0_0_1px_rgba(199,210,254,0.3),0_8px_24px_rgba(99,102,241,0.4),inset_0_1px_0_rgba(255,255,255,0.3)] relative">
            D
            <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full blink bg-[var(--color-success)] border-2 border-[var(--color-sidebar)]" />
          </div>
          <div>
            <div className="font-bold text-[16px] metallic-anim">DADASH</div>
            <div className="text-[9.5px] font-[var(--font-mono)] text-[var(--color-muted)] tracking-[0.14em]">v2.0 · PREMIUM</div>
          </div>
        </div>
      </div>
      <nav className="p-3 overflow-y-auto scrollbar" style={{ maxHeight: 'calc(100vh - 80px)' }}>
        {groups.map(({ g, items }) => (
          <div key={g}>
            <div className="nav-group-title font-[var(--font-mono)] text-[9.5px] text-[var(--color-dim)] uppercase tracking-[0.18em] font-semibold px-3.5 my-3 flex items-center gap-2">
              <span className="flex-1 h-px bg-gradient-to-r from-transparent via-[var(--color-border)] to-transparent" />
              {g}
              <span className="flex-1 h-px bg-gradient-to-r from-transparent via-[var(--color-border)] to-transparent" />
            </div>
            {items.map((n) => {
              const active = pathname === n.to || (n.to !== '/' && pathname.startsWith(n.to));
              return (
                <Link
                  key={n.to}
                  to={n.to as never} search={{} as never}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-[10px] text-[13px] font-medium transition-all duration-200 border border-transparent relative',
                    active
                      ? 'text-[var(--color-text)] bg-[linear-gradient(135deg,rgba(129,140,248,0.16)_0%,rgba(99,102,241,0.06)_100%)] border-[var(--color-border-2)] shadow-[inset_0_1px_0_rgba(199,210,254,0.08),0_4px_12px_rgba(99,102,241,0.18)]'
                      : 'text-[var(--color-text-2)] hover:bg-[rgba(129,140,248,0.04)] hover:text-[var(--color-text)]',
                  )}
                >
                  {active && (
                    <span className="absolute -left-[13px] top-[20%] bottom-[20%] w-0.5 bg-[var(--metallic)] rounded-sm shadow-[0_0_12px_rgba(129,140,248,0.5)]" />
                  )}
                  <span className="text-[15px] w-5 text-center">{n.emoji}</span>
                  {n.label}
                  {n.badge && (
                    <span
                      className={cn(
                        'ml-auto px-1.5 py-px rounded-full text-[9px] font-semibold',
                        n.badge.tone === 'danger'
                          ? 'bg-[rgba(251,113,133,0.1)] text-[var(--color-danger)] border border-[rgba(251,113,133,0.22)]'
                          : 'text-[var(--color-accent-l)]',
                      )}
                    >
                      {n.badge.value}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
        <SidebarFooter />
      </nav>
    </aside>
  );
}

function SidebarFooter() {
  return (
    <div className="mt-5 p-3 rounded-2xl relative overflow-hidden bg-[linear-gradient(135deg,rgba(129,140,248,0.05),rgba(99,102,241,0.02))] border border-[var(--color-border)]">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full blink bg-[var(--color-success)] shadow-[0_0_8px_var(--color-success)]" />
        <div className="mono-tag text-[var(--color-text-2)]">SUPABASE</div>
      </div>
      <div className="text-[9.5px] font-[var(--font-mono)] text-[var(--color-muted)]">lkrzjwfwhiimpnsyeuxi</div>
      <div className="h-px my-2 bg-[var(--color-border)]" />
      <div className="space-y-1 text-[10.5px]">
        <Row k="RLS" v="128/128" tone="success" />
        <Row k="Policies" v="280" />
        <Row k="Sécu" v="95/100" metallic />
        <Row k="Bot TG" v="online" tone="success" />
      </div>
    </div>
  );
}
function Row({ k, v, tone, metallic }: { k: string; v: string; tone?: 'success'; metallic?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--color-muted)]">{k}</span>
      <span className={cn('font-[var(--font-mono)] font-bold', tone === 'success' && 'text-[var(--color-success)]', metallic && 'metallic-text')}>{v}</span>
    </div>
  );
}
