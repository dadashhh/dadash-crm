import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';

const NAMES = ['Karl M.', 'Hans F.', 'Dimitri V.', 'Paul O.', 'Luca R.', 'Max W.', 'Antoine L.', 'Miguel S.', 'Oleg R.', 'Jamal K.', 'Franz B.', 'Sebastian Z.', 'Pierre G.', 'Tomas K.', 'Alessandro F.'];
const TIERS = [
  { e: '🐟', n: 'Fish', c: 'tier-fish' }, { e: '🐒', n: 'Monkey', c: 'tier-monkey' },
  { e: '🦍', n: 'Gorille', c: 'tier-gorilla' }, { e: '🐋', n: 'Whale', c: 'tier-whale' },
  { e: '🦈', n: 'Shark', c: 'tier-shark' },
];
const FLAGS = ['🇫🇷', '🇩🇪', '🇬🇧', '🇮🇹'];
const MODELS = ['Carla', 'Sophie', 'Bella', 'Nadia', 'Lea', 'Alice'];
const CHATTERS = ['Alex', 'Jules', 'Marco', 'Nina'];

export function SpendersPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <div className="mono-tag">PORTFOLIO HOLDERS</div>
          <div className="text-[26px] font-bold mt-1">Spenders · 2 733</div>
          <div className="text-[11px] font-[var(--font-mono)] mt-1" style={{ color: 'var(--color-muted)' }}>🐟 1 542 · 🐒 738 · 🦍 201 · 🐋 52 · 🦈 8 · 🚨 192</div>
        </div>
        <div className="flex items-center gap-2">
          <input className="w-56 px-3 py-2 text-[12px] bg-[var(--color-card-2)] border border-[var(--color-border)] rounded-[10px] text-[var(--color-text)]" placeholder="Rechercher…" />
          <select className="px-3 py-2 text-[12px] bg-[var(--color-card-2)] border border-[var(--color-border)] rounded-[10px] text-[var(--color-text)]"><option>Tous tiers</option></select>
          <select className="px-3 py-2 text-[12px] bg-[var(--color-card-2)] border border-[var(--color-border)] rounded-[10px] text-[var(--color-text)]"><option>Toutes langues</option></select>
          <Button variant="ghost" className="!text-[11px]">⤓ Export</Button>
        </div>
      </div>

      <Card variant="premium" className="overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-left">
              {['Nom', 'Tier', 'Lang', 'Modèles', 'CA lifetime', 'TX', 'AOV', 'Dernière', 'Chatter', 'VIP', 'Statut'].map((h) => (
                <th key={h} className={`font-[var(--font-mono)] text-[10px] uppercase tracking-wider font-semibold px-4 py-3 border-b border-[var(--color-border)] text-[var(--color-muted)] ${['CA lifetime', 'TX', 'AOV'].includes(h) ? 'text-right' : ''} ${h === 'VIP' ? 'text-center' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NAMES.map((n, i) => {
              const tierIdx = Math.min(4, i % 5);
              const tier = TIERS[tierIdx];
              const ca = (tierIdx + 1) * (800 + i * 150);
              const tx = 3 + (i * 4) % 60;
              const vip = tierIdx * 18 + 5 + (i * 3) % 17;
              const isScammer = i === 7;
              return (
                <tr key={n} className="hover:bg-[rgba(129,140,248,0.03)] border-b" style={{ borderColor: 'rgba(129,140,248,0.06)' }}>
                  <td className="px-4 py-[11px] font-semibold cursor-pointer text-[13px]" style={{ color: 'var(--color-accent-l)' }}>{n}</td>
                  <td className="px-4 py-[11px] text-[13px]"><span className={tier.c}>{tier.e} {tier.n}</span></td>
                  <td className="px-4 py-[11px] text-[13px]">{FLAGS[i % 4]}</td>
                  <td className="px-4 py-[11px] text-[11px]">{MODELS[i % 6]}, {MODELS[(i + 2) % 6]}</td>
                  <td className="px-4 py-[11px] text-right font-[var(--font-mono)] font-bold metallic-text text-[13px]">{ca}</td>
                  <td className="px-4 py-[11px] text-right font-[var(--font-mono)] text-[13px]">{tx}</td>
                  <td className="px-4 py-[11px] text-right font-[var(--font-mono)] text-[13px]">{Math.floor(ca / tx)}</td>
                  <td className="px-4 py-[11px] font-[var(--font-mono)] text-[11px]" style={{ color: 'var(--color-muted)' }}>il y a {1 + i * 3}j</td>
                  <td className="px-4 py-[11px] text-[13px]">{CHATTERS[i % 4]}</td>
                  <td className="px-4 py-[11px] text-center font-[var(--font-mono)] font-bold text-[13px]" style={{ color: vip > 70 ? 'var(--color-accent-l)' : 'var(--color-text-2)' }}>{vip}</td>
                  <td className="px-4 py-[11px]">
                    {isScammer ? <Chip tone="danger">🚨 Scammer</Chip> : i % 3 === 0 ? <Chip tone="warning">💤</Chip> : <Chip tone="success">🔥</Chip>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
