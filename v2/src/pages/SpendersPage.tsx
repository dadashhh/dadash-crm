import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { useSpenders, useModels } from '@/hooks/useDadashData';

const FLAGS: Record<string, string> = { fr: '🇫🇷', de: '🇩🇪', en: '🇬🇧', it: '🇮🇹', es: '🇪🇸', pt: '🇵🇹' };

function getTier(total: number): { e: string; n: string; c: string } {
  if (total >= 10000) return { e: '🦈', n: 'Shark', c: 'text-[#60a5fa]' };
  if (total >= 3000) return { e: '🐋', n: 'Whale', c: 'text-[#818cf8]' };
  if (total >= 1000) return { e: '🦍', n: 'Gorille', c: 'text-[#a78bfa]' };
  if (total >= 200) return { e: '🐒', n: 'Monkey', c: 'text-[#f472b6]' };
  return { e: '🐟', n: 'Fish', c: 'text-[#94a3b8]' };
}

export function SpendersPage() {
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<string | null>(null);
  const { data: spenders, isLoading } = useSpenders({ limit: 200, search: search || undefined });
  const { data: models } = useModels();
  const modelById = Object.fromEntries((models ?? []).map(m => [m.id, m]));

  const filtered = useMemo(() => {
    let list = spenders ?? [];
    if (tierFilter) {
      list = list.filter(s => {
        const t = getTier(Number(s.total_spent ?? 0));
        return t.n === tierFilter;
      });
    }
    return list;
  }, [spenders, tierFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { Fish: 0, Monkey: 0, Gorille: 0, Whale: 0, Shark: 0 };
    (spenders ?? []).forEach(s => { c[getTier(Number(s.total_spent ?? 0)).n]++; });
    return c;
  }, [spenders]);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <div className="mono-tag">PORTFOLIO HOLDERS · LIVE DB</div>
          <div className="text-[26px] font-bold mt-1">Spenders · {spenders?.length ?? 0}</div>
          <div className="text-[11px] font-[var(--font-mono)] mt-1" style={{ color: 'var(--color-muted)' }}>
            🐟 {counts.Fish} · 🐒 {counts.Monkey} · 🦍 {counts.Gorille} · 🐋 {counts.Whale} · 🦈 {counts.Shark}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="w-56 px-3 py-2 text-[12px] bg-[var(--color-card-2)] border border-[var(--color-border)] rounded-[10px] text-[var(--color-text)]" placeholder="Rechercher nom/username…" />
          <select value={tierFilter ?? ''} onChange={(e) => setTierFilter(e.target.value || null)} className="px-3 py-2 text-[12px] bg-[var(--color-card-2)] border border-[var(--color-border)] rounded-[10px] text-[var(--color-text)]">
            <option value="">Tous tiers</option>
            <option value="Fish">🐟 Fish</option>
            <option value="Monkey">🐒 Monkey</option>
            <option value="Gorille">🦍 Gorille</option>
            <option value="Whale">🐋 Whale</option>
            <option value="Shark">🦈 Shark</option>
          </select>
        </div>
      </div>
      {isLoading && <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>Chargement…</div>}

      <Card variant="premium" className="overflow-hidden">
        <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 260px)' }}>
          <table className="w-full">
            <thead className="sticky top-0 z-10" style={{ background: 'var(--color-card)' }}>
              <tr className="text-left">
                {['Nom', 'Tier', 'Lang', 'Modèle', 'Total dépensé', 'Panier moy.', 'VIP', 'Dernière activité', 'Statut'].map((h) => (
                  <th key={h} className={`font-[var(--font-mono)] text-[10px] uppercase tracking-wider font-semibold px-4 py-3 border-b border-[var(--color-border)] text-[var(--color-muted)] ${h === 'Total dépensé' || h === 'Panier moy.' ? 'text-right' : ''} ${h === 'VIP' ? 'text-center' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const total = Number(s.total_spent ?? 0);
                const tier = getTier(total);
                const model = s.model_id ? modelById[s.model_id] : null;
                const lang = s.language ?? s.langue;
                const flag = lang ? (FLAGS[lang.slice(0, 2).toLowerCase()] ?? lang) : '—';
                const name = s.display_name ?? [s.first_name, s.last_name].filter(Boolean).join(' ') ?? s.username ?? s.telegram_username ?? '—';
                const lastActive = s.last_active_date ?? s.last_purchase_date ?? s.last_seen_at;
                return (
                  <tr key={s.id} className="hover:bg-[rgba(129,140,248,0.03)] border-b" style={{ borderColor: 'rgba(129,140,248,0.06)' }}>
                    <td className="px-4 py-[11px] font-semibold text-[13px]" style={{ color: 'var(--color-accent-l)' }}>{name}</td>
                    <td className="px-4 py-[11px] text-[13px]"><span className={tier.c}>{tier.e} {tier.n}</span></td>
                    <td className="px-4 py-[11px] text-[13px]">{flag}</td>
                    <td className="px-4 py-[11px] text-[11px]">{model ? `${model.emoji ?? ''} ${model.name}` : '—'}</td>
                    <td className="px-4 py-[11px] text-right font-[var(--font-mono)] font-bold metallic-text text-[13px]">{total.toLocaleString('fr-CH')} CHF</td>
                    <td className="px-4 py-[11px] text-right font-[var(--font-mono)] text-[13px]">{s.avg_basket ? Math.round(Number(s.avg_basket)) : '—'}</td>
                    <td className="px-4 py-[11px] text-center font-[var(--font-mono)] font-bold text-[13px]" style={{ color: (s.vip_score ?? 0) > 70 ? 'var(--color-accent-l)' : 'var(--color-text-2)' }}>{s.vip_score ?? '—'}</td>
                    <td className="px-4 py-[11px] font-[var(--font-mono)] text-[11px]" style={{ color: 'var(--color-muted)' }}>{lastActive ? new Date(lastActive).toLocaleDateString('fr-CH', { day: '2-digit', month: 'short' }) : '—'}</td>
                    <td className="px-4 py-[11px]">
                      {s.is_scammer || s.scam_flag ? <Chip tone="danger">🚨 Scammer</Chip>
                        : s.status === 'active' || s.is_active ? <Chip tone="success">🔥 Actif</Chip>
                        : <Chip tone="warning">💤 Inactif</Chip>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <Button variant="ghost" className="!text-[11px]">⤓ Export CSV</Button>
    </div>
  );
}
