import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';

const TIERS = [
  { e: '🐟', n: 'Fish', range: '1-24' }, { e: '🐒', n: 'Monkey', range: '25-44' },
  { e: '🦍', n: 'Gorille', range: '45-64' }, { e: '🐋', n: 'Whale', range: '65-84' },
  { e: '🦈', n: 'Shark', range: '85-100' },
];

const BIOMES = [
  { id: 'shark', label: 'ABYSSES · Sharks 85+', emoji: '🦈', count: 8, ca: '24 400', tone: 'tone-shark' },
  { id: 'whale', label: 'HAUTE MER · Whales 65-84', emoji: '🐋', count: 14, ca: '78 200', tone: 'tone-whale' },
  { id: 'gorilla', label: 'MONTAGNE · Gorilles 45-64', emoji: '🦍', count: 16, ca: '124 800', tone: 'tone-gorilla' },
  { id: 'monkey', label: 'JUNGLE · Monkeys 25-44', emoji: '🐒', count: 20, ca: '89 400', tone: 'tone-monkey' },
  { id: 'fish', label: 'OCÉAN · Fish 1-24', emoji: '🐟', count: 22, ca: '18 400', tone: 'tone-fish' },
];

const LEADERBOARD = [
  { n: 'Alex', s: 4820, t: '↑', r: 7, b: '🥇' },
  { n: 'Nina', s: 3940, t: '↑', r: 4, b: '🥈' },
  { n: 'Jules', s: 3680, t: '=', r: 3, b: '🥉' },
  { n: 'Marco', s: 2980, t: '↓', r: 2, b: '4' },
  { n: 'Yann', s: 2420, t: '↑', r: 1, b: '5' },
];

export function ZooMapPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <div className="mono-tag">GAMIFIED ARENA · CARTE INTERACTIVE</div>
          <div className="text-[26px] font-bold mt-1">Zoo Map</div>
          <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>Clic sur un spender = fiche + stratégies · Progression 🐟→🦈 · Primes réactivation dormants</div>
        </div>
        <div className="flex items-center gap-2">
          <Chip tone="indigo">🏆 Leaderboard</Chip>
          <Button variant="primary">🎯 Focus baleines</Button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_320px] gap-4">
        <div className="space-y-3">
          {BIOMES.map((b) => (
            <div key={b.id} className="biome-card relative h-[220px] rounded-[18px] overflow-hidden cursor-pointer"
                 style={{
                   background: b.id === 'shark' ? 'linear-gradient(180deg,rgba(2,6,23,0.95),rgba(0,0,0,1)),radial-gradient(circle at 30% 30%,rgba(59,130,246,0.18),transparent 50%)'
                   : b.id === 'whale' ? 'linear-gradient(180deg,rgba(30,41,99,0.85),rgba(15,23,42,0.95)),radial-gradient(circle at 20% 30%,rgba(129,140,248,0.3),transparent 50%)'
                   : b.id === 'gorilla' ? 'linear-gradient(180deg,rgba(120,53,15,0.55),rgba(15,23,42,0.95)),radial-gradient(circle at 30% 40%,rgba(251,191,36,0.12),transparent 50%)'
                   : b.id === 'monkey' ? 'linear-gradient(180deg,rgba(22,101,52,0.7),rgba(15,23,42,0.95)),radial-gradient(circle at 20% 30%,rgba(217,119,6,0.2),transparent 50%)'
                   : 'linear-gradient(180deg,rgba(30,58,138,0.8),rgba(15,23,42,0.95)),radial-gradient(circle at 30% 40%,rgba(148,163,184,0.15),transparent 50%)',
                 }}>
              <div className="absolute top-3.5 left-3.5 z-[3] inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold"
                   style={{ background: 'rgba(7,9,18,0.7)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                {b.emoji} <span style={{ color: 'var(--color-accent-l)' }}>{b.label}</span>
              </div>
              <div className="absolute top-3.5 right-3.5 z-[3] flex gap-2">
                <span className="px-2.5 py-1 rounded-full text-[11px]" style={{ background: 'rgba(7,9,18,0.7)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--color-text-2)' }}><b>{b.count}</b> spenders</span>
                <span className="px-2.5 py-1 rounded-full text-[11px]" style={{ background: 'rgba(7,9,18,0.7)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--color-text-2)' }}>CA <b className="metallic-text">{b.ca}</b></span>
              </div>
              <div className="absolute inset-0" style={{ zIndex: 2 }}>
                {Array.from({ length: b.count }).map((_, i) => {
                  const x = 4 + ((i * 7) % 90);
                  const y = 20 + ((i * 11) % 65);
                  const isReact = i === Math.floor(b.count / 3) && b.id !== 'shark';
                  const isScam = i === 13 && b.id === 'monkey';
                  return (
                    <div key={i}
                         className={isReact ? 'glow-breathe' : isScam ? 'pulse-red' : ''}
                         style={{
                           position: 'absolute',
                           left: `${x}%`, top: `${y}%`,
                           width: 36, height: 36,
                           borderRadius: '50%',
                           display: 'flex', alignItems: 'center', justifyContent: 'center',
                           fontSize: 18,
                           background: 'rgba(15,20,35,0.6)',
                           backdropFilter: 'blur(8px)',
                           border: `1px solid ${isReact ? 'var(--color-success)' : isScam ? 'var(--color-danger)' : 'rgba(255,255,255,0.15)'}`,
                           cursor: 'pointer',
                           boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                         }}>
                      {isScam ? '🚨' : b.emoji}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <Card variant="premium" className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3 text-[11px]">
                {TIERS.map((t) => (
                  <div key={t.n} className="flex items-center gap-1.5">
                    <span className="text-[16px]">{t.e}</span>
                    <span>{t.n}</span>
                    <span className="font-[var(--font-mono)]" style={{ color: 'var(--color-muted)' }}>{t.range}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1.5">
                  <span className="text-[16px]">🚨</span>
                  <span style={{ color: 'var(--color-danger)' }}>Scammer</span>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-3">
          <Card variant="premium" className="p-5">
            <div className="mono-tag">LEADERBOARD</div>
            <div className="text-[15px] font-semibold mt-1 mb-3">🏆 Top chatters · mois</div>
            <div className="space-y-2">
              {LEADERBOARD.map((d) => (
                <div key={d.n} className="flex items-center gap-3 p-2.5 rounded-lg" style={{ background: 'var(--color-card-2)', border: '1px solid var(--color-border)' }}>
                  <div className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[18px] font-bold" style={{ background: 'linear-gradient(135deg,rgba(129,140,248,0.2),rgba(99,102,241,0.08))', border: '1px solid var(--color-border-2)' }}>{d.b}</div>
                  <div className="flex-1">
                    <div className="text-[12.5px] font-semibold">{d.n}</div>
                    <div className="text-[10px] font-[var(--font-mono)]" style={{ color: 'var(--color-muted)' }}>{d.r} réactivations</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[14px] font-[var(--font-mono)] font-bold metallic-text">{d.s}</div>
                    <div className="text-[10px] font-[var(--font-mono)]" style={{ color: d.t === '↑' ? 'var(--color-success)' : d.t === '↓' ? 'var(--color-danger)' : 'var(--color-muted)' }}>{d.t} XP</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card variant="premium" className="p-5">
            <div className="mono-tag">PRIME RÉACTIVATION</div>
            <div className="text-[15px] font-semibold mt-1 mb-3">💎 Réveils dormants</div>
            <Card className="p-3 relative overflow-hidden" style={{ background: 'linear-gradient(135deg,rgba(129,140,248,0.08),rgba(99,102,241,0.02))', borderColor: 'var(--color-border-2)' }}>
              <div className="absolute top-0 left-0 w-[3px] h-full" style={{ background: 'var(--metallic)' }} />
              <div className="flex items-center gap-2 mb-2">
                <div className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[18px] font-bold" style={{ background: 'linear-gradient(135deg,rgba(129,140,248,0.2),rgba(99,102,241,0.08))', border: '1px solid var(--color-border-2)' }}>🥇</div>
                <div>
                  <div className="text-[12.5px] font-semibold">Alex · Karl M. réveillé</div>
                  <div className="text-[10px] font-[var(--font-mono)]" style={{ color: 'var(--color-muted)' }}>dormant 42j · il y a 2h</div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>Bonus</span>
                <span className="text-[18px] font-bold metallic-anim">+80 CHF</span>
              </div>
            </Card>
          </Card>

          <Card variant="premium" className="p-5">
            <div className="mono-tag">MA PROGRESSION</div>
            <div className="text-[15px] font-semibold mt-1 mb-3">⭐ Badges débloqués</div>
            <div className="grid grid-cols-4 gap-2">
              {['🐋', '🦈', '🔄', '🌙', '⚡', '🇩🇪', '🔒', '🔒'].map((b, i) => (
                <div key={i} className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[18px] font-bold"
                     style={{
                       background: 'linear-gradient(135deg,rgba(129,140,248,0.2),rgba(99,102,241,0.08))',
                       border: '1px solid var(--color-border-2)',
                       opacity: b === '🔒' ? 0.3 : 1,
                     }}>
                  {b}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
