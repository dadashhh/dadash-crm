import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';

const CHATTERS = ['Alex', 'Jules', 'Marco', 'Yann', 'Nina', 'Kevin', 'Luca', 'Sam'];
const MCS = ['Alex (MC)', 'Jules (MC)'];
const TIERS = ['T3 · 20%', 'T2 · 12%', 'T1 · 8%'];

export function EquipePage() {
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <div className="mono-tag">WORKFORCE</div>
          <div className="text-[26px] font-bold mt-1">Équipe · 15 chatters · 2 MC</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex gap-0.5 bg-[var(--color-card-2)] border border-[var(--color-border)] rounded-[10px] p-0.5">
            <button className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white shadow-[0_2px_8px_rgba(99,102,241,0.35)]" style={{ background: 'var(--grad-primary)' }}>Chatters</button>
            <button className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-[var(--color-text-2)]">MC</button>
            <button className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-[var(--color-text-2)]">Paies</button>
          </div>
          <Button variant="primary">+ Recruter</Button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {CHATTERS.map((c, i) => (
          <Card key={c} variant="premium" className="p-5">
            <div className="flex items-start gap-3">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-[18px]" style={{ background: 'var(--metallic)', color: '#0a0d18' }}>{c[0]}</div>
              <div className="flex-1">
                <div className="text-[16px] font-bold">{c}</div>
                <div className="text-[11px] font-[var(--font-mono)]" style={{ color: 'var(--color-muted)' }}>MC: {MCS[i % 2]}</div>
              </div>
              <Chip tone="indigo">{TIERS[i % 3]}</Chip>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4 text-[11px]">
              <div className="p-2 rounded-lg bg-[var(--color-card-2)]"><div className="mono-tag">CA</div><div className="font-[var(--font-mono)] font-bold metallic-text">{1800 + i * 425}</div></div>
              <div className="p-2 rounded-lg bg-[var(--color-card-2)]"><div className="mono-tag">Conv</div><div className="font-[var(--font-mono)] font-bold">{9 + i}%</div></div>
              <div className="p-2 rounded-lg bg-[var(--color-card-2)]"><div className="mono-tag">Score</div><div className="font-[var(--font-mono)] font-bold" style={{ color: 'var(--color-success)' }}>{68 + i * 3}</div></div>
            </div>
            <div className="mt-3 p-2.5 rounded-xl flex items-center justify-between" style={{ background: 'linear-gradient(135deg,rgba(129,140,248,0.06),transparent)', border: '1px solid var(--color-border-2)' }}>
              <span className="mono-tag">Paie en cours</span>
              <span className="font-[var(--font-mono)] font-bold metallic-text">{140 + i * 85} CHF</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
