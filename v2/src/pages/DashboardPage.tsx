import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { KpiCard } from '@/components/ui/KpiCard';
import { PremiumChart } from '@/components/ui/Chart';
import { useTransactions, useTransactionStats, useSpendersCount, useModels, useChatters, useProviders, useValidateTx, useRefuseTx } from '@/hooks/useDadashData';

type KpiKey = 'ca' | 'tx' | 'spenders' | 'pending' | 'aov';

export function DashboardPage() {
  const [selected, setSelected] = useState<KpiKey>('ca');
  const { data: stats } = useTransactionStats();
  const { data: spCount } = useSpendersCount();
  const { data: recentTx } = useTransactions({ limit: 14 });
  const { data: chartTx } = useTransactions({ days: 30 });
  const { data: models } = useModels();
  const { data: chatters } = useChatters();
  const { data: providers } = useProviders();
  const validateTx = useValidateTx();
  const refuseTx = useRefuseTx();

  const modelById = useMemo(() => Object.fromEntries((models ?? []).map(m => [m.id, m])), [models]);
  const chatterById = useMemo(() => Object.fromEntries((chatters ?? []).map(c => [c.id, c])), [chatters]);
  const providerById = useMemo(() => Object.fromEntries((providers ?? []).map(p => [p.id, p])), [providers]);

  const chartData = useMemo(() => {
    const days: Record<string, number> = {};
    const labels: string[] = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      days[key] = 0;
      labels.push(`${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    (chartTx ?? []).forEach(tx => {
      if (!tx.date) return;
      const key = new Date(tx.date).toISOString().slice(0, 10);
      if (key in days) {
        if (selected === 'ca') days[key] += Number(tx.amount_chf ?? tx.amount ?? 0);
        else if (selected === 'tx' && tx.status === 'validated') days[key] += 1;
        else if (selected === 'pending' && tx.status === 'pending') days[key] += 1;
        else if (selected === 'aov' && tx.status === 'validated') days[key] += Number(tx.amount_chf ?? tx.amount ?? 0);
      }
    });
    return { labels, values: Object.values(days) };
  }, [chartTx, selected]);

  const chartTitle: Record<KpiKey, string> = {
    ca: 'CA cumulé — 30 derniers jours',
    tx: 'TX validées — 30 derniers jours',
    spenders: 'Spenders actifs',
    pending: 'TX en attente',
    aov: 'AOV — 30 derniers jours',
  };

  const caPct = stats && stats.caBrut > 0 ? '+' : '';
  const pendingCount = stats?.pending ?? 0;

  return (
    <div className="space-y-5">
      <Card variant="hero" className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="mono-tag">DADASH · DATA LIVE SUPABASE</div>
            <h1 className="text-[26px] font-bold mt-1">
              Bonjour <span className="metallic-anim">DADA</span>. <span className="font-[var(--font-serif)] italic font-normal text-[var(--color-text-2)]">Ton matin.</span>
            </h1>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <div className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: 'rgba(251,113,133,0.06)', border: '1px solid rgba(251,113,133,0.2)' }}>
            <div className="text-[22px]">🔴</div>
            <div className="flex-1">
              <div className="mono-tag">TX à valider</div>
              <div className="text-[22px] font-bold font-[var(--font-mono)]" style={{ color: 'var(--color-danger)' }}>{pendingCount}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)' }}>
            <div className="text-[22px]">✓</div>
            <div className="flex-1">
              <div className="mono-tag">TX validées</div>
              <div className="text-[22px] font-bold font-[var(--font-mono)]" style={{ color: 'var(--color-success)' }}>{stats?.validated ?? 0}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.18)' }}>
            <div className="text-[22px]">✗</div>
            <div className="flex-1">
              <div className="mono-tag">TX refusées</div>
              <div className="text-[22px] font-bold font-[var(--font-mono)]" style={{ color: 'var(--color-warning)' }}>{stats?.refused ?? 0}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: 'rgba(129,140,248,0.06)', border: '1px solid var(--color-border-2)' }}>
            <div className="text-[22px]">👥</div>
            <div className="flex-1">
              <div className="mono-tag">Spenders</div>
              <div className="text-[22px] font-bold font-[var(--font-mono)] metallic-anim">{spCount ?? 0}</div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-5 gap-3">
        <KpiCard label="CA cumulé" value={stats ? Math.round(stats.caBrut).toLocaleString('fr-CH') : '…'} hint="CHF · total validées" trend={{ value: caPct + ((stats?.caBrut ?? 0) > 0 ? 'live' : '—') }} selected={selected === 'ca'} onClick={() => setSelected('ca')} metallic />
        <KpiCard label="TX validées" value={stats?.validated ?? 0} hint={`AOV ${stats ? Math.round(stats.aov) : 0} CHF`} selected={selected === 'tx'} onClick={() => setSelected('tx')} />
        <KpiCard label="Spenders" value={spCount ?? 0} hint="total DB" trend={{ value: 'live', tone: 'indigo' }} selected={selected === 'spenders'} onClick={() => setSelected('spenders')} />
        <KpiCard label="TX pending" value={pendingCount} hint="à valider" trend={{ value: pendingCount > 0 ? 'à traiter' : 'OK', tone: pendingCount > 0 ? 'warning' : 'success' }} selected={selected === 'pending'} onClick={() => setSelected('pending')} />
        <KpiCard label="AOV" value={stats ? Math.round(stats.aov) : 0} hint="CHF · panier moyen" selected={selected === 'aov'} onClick={() => setSelected('aov')} metallic />
      </div>

      <Card variant="premium" className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="mono-tag">PERFORMANCE</div>
            <div className="text-[16px] font-semibold mt-0.5">{chartTitle[selected]}</div>
          </div>
        </div>
        <div className="h-[280px]">
          <PremiumChart type="line" labels={chartData.labels} data={chartData.values} unit={selected === 'tx' || selected === 'pending' ? '' : 'CHF'} />
        </div>
      </Card>

      <Card variant="premium" className="p-0">
        <div className="p-5 flex items-center justify-between border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div>
            <div className="mono-tag">TRANSACTIONS RÉCENTES</div>
            <div className="text-[16px] font-semibold mt-0.5">{(recentTx ?? []).length} dernières TX</div>
          </div>
          {pendingCount > 0 && <Chip tone="danger" className="pulse-red">{pendingCount} EN ATTENTE</Chip>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left">
                {['Date', 'Spender', 'Modèle', 'Chatter', 'Provider', 'Montant', 'Statut', 'Actions'].map((h) => (
                  <th key={h} className={`font-[var(--font-mono)] text-[10px] uppercase tracking-wider font-semibold px-4 py-3 border-b border-[var(--color-border)] text-[var(--color-muted)] ${h === 'Montant' ? 'text-right' : ''} ${h === 'Statut' ? 'text-center' : ''} ${h === 'Actions' ? 'text-right pr-4' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(recentTx ?? []).map((tx) => {
                const model = tx.model_id ? modelById[tx.model_id] : null;
                const chatter = tx.chatter_id ? chatterById[tx.chatter_id] : null;
                const provider = tx.provider_id ? providerById[tx.provider_id] : null;
                const st = tx.status;
                const amt = Number(tx.amount_chf ?? tx.amount ?? 0);
                return (
                  <tr key={tx.id} className="hover:bg-[rgba(129,140,248,0.03)] border-b" style={{ borderColor: 'rgba(129,140,248,0.06)' }}>
                    <td className="px-4 py-[11px] font-[var(--font-mono)] text-[11px]">{tx.date ? new Date(tx.date).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit' }) + ' ' + new Date(tx.date).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td className="px-4 py-[11px] text-[13px]" style={{ color: 'var(--color-accent-l)' }}>{tx.spender_handle ?? '—'}</td>
                    <td className="px-4 py-[11px] text-[13px]">{model ? `${model.emoji ?? '✨'} ${model.name}` : '—'}</td>
                    <td className="px-4 py-[11px] text-[13px]">{chatter?.full_name ?? '—'}</td>
                    <td className="px-4 py-[11px] font-[var(--font-mono)] text-[11px]">{provider?.name ?? '—'}</td>
                    <td className="px-4 py-[11px] text-right font-[var(--font-mono)] font-bold metallic-text text-[13px]">{amt.toLocaleString('fr-CH')} {tx.currency ?? 'CHF'}</td>
                    <td className="px-4 py-[11px] text-center">
                      {st === 'validated' && <Chip tone="success">Validée</Chip>}
                      {st === 'pending' && <Chip tone="warning">En attente</Chip>}
                      {(st === 'refused' || st === 'cancelled') && <Chip tone="danger">Refusée</Chip>}
                      {st && !['validated', 'pending', 'refused', 'cancelled'].includes(st) && <Chip tone="muted">{st}</Chip>}
                    </td>
                    <td className="px-4 py-[11px] text-right pr-4">
                      {st === 'pending' ? (
                        <>
                          <Button variant="ghost" className="!py-1 !px-2 !text-[10px] mr-1" onClick={() => validateTx.mutate(tx.id)} disabled={validateTx.isPending}>✓ Valider</Button>
                          <Button variant="ghost" className="!py-1 !px-2 !text-[10px]" onClick={() => refuseTx.mutate({ id: tx.id })} disabled={refuseTx.isPending}>✗ Refuser</Button>
                        </>
                      ) : <span className="text-[10px] text-[var(--color-muted)]">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
