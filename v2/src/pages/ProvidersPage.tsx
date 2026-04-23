import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';

const PROVS = [
  { n: 'Stripe', cur: 'CHF', fee: '2.9%', vol: 12840, tx: 182, st: 'OK' },
  { n: 'PayPal', cur: 'EUR', fee: '3.5%', vol: 8420, tx: 124, st: 'OK' },
  { n: 'Revolut Business', cur: 'CHF', fee: '1.2%', vol: 6280, tx: 88, st: 'OK' },
  { n: 'Wise', cur: 'EUR', fee: '0.8%', vol: 4180, tx: 62, st: 'OK' },
  { n: 'Binance Pay', cur: 'USDT', fee: '0.1%', vol: 3240, tx: 42, st: 'OK' },
  { n: 'Twint', cur: 'CHF', fee: '1.3%', vol: 2840, tx: 48, st: 'Paiement dû' },
  { n: 'MBWay', cur: 'EUR', fee: '1.5%', vol: 1420, tx: 24, st: 'OK' },
  { n: 'SEPA direct', cur: 'EUR', fee: '0.5%', vol: 2640, tx: 18, st: 'OK' },
  { n: 'Apple Pay', cur: 'CHF', fee: '2.9%', vol: 1840, tx: 38, st: 'OK' },
  { n: 'Google Pay', cur: 'EUR', fee: '2.9%', vol: 820, tx: 12, st: 'OK' },
];

export function ProvidersPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <div className="mono-tag">PAYMENT RAILS · DATA ONLY</div>
          <div className="text-[26px] font-bold mt-1">Providers · 10 actifs</div>
          <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>Zéro accès login · paiements déclarés par DADA</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {PROVS.map((p) => (
          <Card key={p.n} variant="premium" className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[16px] font-bold">{p.n}</div>
                <div className="text-[11px] font-[var(--font-mono)]" style={{ color: 'var(--color-muted)' }}>Frais {p.fee} · {p.cur}</div>
              </div>
              <Chip tone={p.st === 'OK' ? 'success' : 'warning'}>{p.st}</Chip>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3 text-[11px]">
              <div className="p-2 rounded-lg bg-[var(--color-card-2)]"><div className="mono-tag">Volume</div><div className="font-[var(--font-mono)] font-bold metallic-text">{p.vol} CHF</div></div>
              <div className="p-2 rounded-lg bg-[var(--color-card-2)]"><div className="mono-tag">TX</div><div className="font-[var(--font-mono)] font-bold">{p.tx}</div></div>
            </div>
            <div className="mt-3 pt-3 border-t flex items-center justify-between text-[11px]" style={{ borderColor: 'var(--color-border)' }}>
              <span className="mono-tag">Accès login</span>
              <Chip tone="muted">Data only</Chip>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
