import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { useProviders, useTransactions } from '@/hooks/useDadashData';
import { useMemo } from 'react';

export function ProvidersPage() {
  const { data: providers, isLoading } = useProviders();
  const { data: txs } = useTransactions({ days: 30 });

  const stats = useMemo(() => {
    const map: Record<string, { vol: number; tx: number }> = {};
    (txs ?? []).forEach(t => {
      if (!t.provider_id) return;
      if (t.status !== 'validated') return;
      if (!map[t.provider_id]) map[t.provider_id] = { vol: 0, tx: 0 };
      map[t.provider_id].vol += Number(t.amount_chf ?? t.amount ?? 0);
      map[t.provider_id].tx += 1;
    });
    return map;
  }, [txs]);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <div className="mono-tag">PAYMENT RAILS · LIVE DB</div>
          <div className="text-[26px] font-bold mt-1">Providers · {providers?.length ?? 0} actifs</div>
          <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>Volumes 30j · frais calculés depuis TX validées</div>
        </div>
      </div>
      {isLoading && <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>Chargement…</div>}
      <div className="grid grid-cols-2 gap-4">
        {(providers ?? []).map((p) => {
          const s = stats[p.id] ?? { vol: 0, tx: 0 };
          return (
            <Card key={p.id} variant="premium" className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[16px] font-bold">{p.name}</div>
                  <div className="text-[11px] font-[var(--font-mono)]" style={{ color: 'var(--color-muted)' }}>
                    Frais {Number(p.fee_pct ?? 0).toFixed(2)}% {p.payment_method ? `· ${p.payment_method}` : ''}
                  </div>
                </div>
                <Chip tone={p.active ? 'success' : 'muted'}>{p.active ? 'OK' : 'Inactif'}</Chip>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3 text-[11px]">
                <div className="p-2 rounded-lg bg-[var(--color-card-2)]">
                  <div className="mono-tag">Volume 30j</div>
                  <div className="font-[var(--font-mono)] font-bold metallic-text">{s.vol.toLocaleString('fr-CH')} CHF</div>
                </div>
                <div className="p-2 rounded-lg bg-[var(--color-card-2)]">
                  <div className="mono-tag">TX 30j</div>
                  <div className="font-[var(--font-mono)] font-bold">{s.tx}</div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t flex items-center justify-between text-[11px]" style={{ borderColor: 'var(--color-border)' }}>
                <span className="mono-tag">Contact</span>
                <span className="font-[var(--font-mono)]">{p.email ?? '—'}</span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
