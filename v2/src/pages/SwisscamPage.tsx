import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';

const rand = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;

const CAMS = [
  { m: 'Carla', studio: 'Studio Zurich A', st: 'live' as const, v: 42, tips: 820, hours: '2h14', q: '1080p', fps: 30, br: '5.2 Mbps' },
  { m: 'Sophie', studio: 'Studio Genève', st: 'live' as const, v: 28, tips: 340, hours: '1h48', q: '4K', fps: 60, br: '12.8 Mbps' },
  { m: 'Bella', studio: 'Studio Lausanne', st: 'planned' as const, sched: '14h-17h', q: '1080p' },
  { m: 'Nadia', studio: 'Home Setup', st: 'live' as const, v: 12, tips: 88, hours: '0h32', q: '720p', fps: 30, br: '3.1 Mbps' },
  { m: 'Lea', studio: 'Studio Zurich B', st: 'maintenance' as const, q: '4K' },
  { m: 'Alice', studio: 'Mobile', st: 'offline' as const, q: '720p' },
];

const TIPS = [
  { spender: 'Karl M.', model: 'Carla', amt: 120, t: 'now', tier: '🐋', msg: 'Amazing 🔥' },
  { spender: 'Hans F.', model: 'Sophie', amt: 50, t: '1m', tier: '🦍', msg: '' },
  { spender: 'Whale_DE', model: 'Carla', amt: 250, t: '2m', tier: '🐋', msg: 'Private pls' },
  { spender: 'Dimitri V.', model: 'Sophie', amt: 80, t: '3m', tier: '🦍', msg: '' },
  { spender: 'Paul O.', model: 'Nadia', amt: 30, t: '5m', tier: '🐒', msg: '' },
  { spender: 'Shark_CH', model: 'Carla', amt: 500, t: '8m', tier: '🦈', msg: 'For you babe' },
  { spender: 'Luca R.', model: 'Sophie', amt: 40, t: '12m', tier: '🐒', msg: '' },
];

const VIEWERS = [
  { name: 'Karl M.', model: 'Carla', tier: '🐋', time: '18min', spent: 320 },
  { name: 'Shark_CH', model: 'Carla', tier: '🦈', time: '42min', spent: 890 },
  { name: 'Hans F.', model: 'Sophie', tier: '🦍', time: '24min', spent: 180 },
  { name: 'Whale_DE', model: 'Carla', tier: '🐋', time: '8min', spent: 250 },
  { name: 'Dimitri V.', model: 'Sophie', tier: '🦍', time: '32min', spent: 80 },
];

export function SwisscamPage() {
  const [viewers, setViewers] = useState(82);
  const [tipsSum, setTipsSum] = useState(1248);
  useEffect(() => {
    const id = setInterval(() => { setViewers(rand(70, 95)); setTipsSum(rand(1100, 1400)); }, 2500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <div className="mono-tag">CAM OPERATIONS · COCKPIT</div>
          <div className="flex items-center gap-3 mt-1">
            <div className="w-3 h-3 rounded-full blink" style={{ background: 'var(--color-danger)', boxShadow: '0 0 12px rgba(251,113,133,0.8)' }} />
            <div className="text-[26px] font-bold">SwissCam</div>
            <Chip tone="danger">3 LIVE</Chip>
          </div>
          <div className="text-[12px] mt-1" style={{ color: 'var(--color-muted)' }}>Pilotage cames modèles · planning · tips live → TX auto · stats · qualité signal</div>
        </div>
        <div className="flex items-center gap-2">
          <select className="px-3 py-2 text-[12px] bg-[var(--color-card-2)] border border-[var(--color-border)] rounded-[10px] text-[var(--color-text)]"><option>Toutes modèles</option></select>
          <Button variant="primary">▶ Démarrer live</Button>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-3">
        {[
          { l: 'SESSIONS LIVE', v: '3', h: '/ 9 modèles', metallic: true },
          { l: 'VIEWERS LIVE', v: viewers, h: '↑ 24% vs moy', hintColor: 'var(--color-success)' },
          { l: 'TIPS · HEURE', v: tipsSum, h: 'CHF · 38 tips', metallic: true },
          { l: 'CONV CAM→TX', v: '28.4%', h: '+4.2%', hintColor: 'var(--color-success)' },
          { l: 'TPS SESSION', v: '42min', h: 'médiane 7j' },
          { l: 'QUALITÉ SIGNAL', v: '98%', h: '0 incident', color: 'var(--color-success)' },
        ].map((k) => (
          <Card key={k.l} variant="premium" className="p-4">
            <div className="mono-tag">{k.l}</div>
            <div className={`text-[22px] font-bold font-[var(--font-mono)] mt-1 ${k.metallic ? 'metallic-anim' : ''}`} style={{ color: k.color }}>{k.v}</div>
            <div className="text-[10px]" style={{ color: k.hintColor || 'var(--color-muted)' }}>{k.h}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_340px] gap-4">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {CAMS.map((c) => (
              <div key={c.m} className="rounded-2xl overflow-hidden relative"
                   style={{
                     background: 'var(--color-card)',
                     border: `1px solid ${c.st === 'live' ? 'rgba(251,113,133,0.45)' : 'var(--color-border)'}`,
                     opacity: c.st === 'offline' || c.st === 'maintenance' ? 0.65 : 1,
                     boxShadow: c.st === 'live' ? '0 0 0 1px rgba(251,113,133,0.25),var(--shadow-card)' : 'var(--shadow-card)',
                   }}>
                <div className="relative" style={{
                  aspectRatio: '16/9',
                  background: 'radial-gradient(circle at 50% 50%,rgba(129,140,248,0.15),transparent 60%),linear-gradient(135deg,#1e1b4b 0%,#0f1423 100%)',
                  overflow: 'hidden',
                }}>
                  {c.st === 'live' && <div className="absolute left-0 right-0 h-[2px]" style={{ background: 'linear-gradient(90deg,transparent,rgba(129,140,248,0.5),transparent)', animation: 'scan-line 4s linear infinite' }} />}
                  {c.st === 'live' ? (
                    <>
                      <div className="absolute top-3 left-3 flex items-center gap-2">
                        <Chip tone="danger" className="pulse-red" style={{ fontWeight: 700 }}>● LIVE</Chip>
                        <Chip tone="indigo">{c.q} · {c.fps}fps</Chip>
                      </div>
                      <div className="absolute top-3 right-3 flex items-center gap-2">
                        <span className="px-2 py-1 rounded-md text-[10.5px] font-[var(--font-mono)] font-bold text-white" style={{ background: 'rgba(7,9,18,0.65)', backdropFilter: 'blur(8px)' }}>👁️ {c.v}</span>
                        <span className="px-2 py-1 rounded-md text-[10.5px] font-[var(--font-mono)] font-bold" style={{ background: 'rgba(7,9,18,0.65)', color: 'var(--color-accent-l)', backdropFilter: 'blur(8px)' }}>{c.hours}</span>
                      </div>
                      <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
                        <div>
                          <div className="text-[16px] font-bold text-white">{c.m}</div>
                          <div className="text-[10.5px] font-[var(--font-mono)]" style={{ color: 'rgba(255,255,255,0.6)' }}>{c.studio} · {c.br}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10.5px] font-[var(--font-mono)]" style={{ color: 'rgba(255,255,255,0.6)' }}>Tips session</div>
                          <div className="text-[18px] font-bold font-[var(--font-mono)] metallic-anim">{c.tips} CHF</div>
                        </div>
                      </div>
                    </>
                  ) : c.st === 'planned' ? (
                    <>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                          <div className="text-[40px] opacity-40">⏳</div>
                          <div className="text-[13px] font-semibold mt-1" style={{ color: 'var(--color-warning)' }}>Programmé {c.sched}</div>
                        </div>
                      </div>
                      <div className="absolute top-3 left-3"><Chip tone="warning">PLANNED</Chip></div>
                      <div className="absolute bottom-3 left-3">
                        <div className="text-[16px] font-bold text-white">{c.m}</div>
                        <div className="text-[10.5px] font-[var(--font-mono)]" style={{ color: 'rgba(255,255,255,0.6)' }}>{c.studio}</div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                          <div className="text-[40px] opacity-30">{c.st === 'maintenance' ? '🛠️' : '⚫'}</div>
                          <div className="text-[12px] font-semibold mt-1" style={{ color: 'var(--color-muted)' }}>{c.st === 'maintenance' ? 'MAINTENANCE' : 'OFFLINE'}</div>
                        </div>
                      </div>
                      <div className="absolute top-3 left-3"><Chip tone="muted">{c.st === 'maintenance' ? 'MAINT' : 'OFF'}</Chip></div>
                      <div className="absolute bottom-3 left-3">
                        <div className="text-[16px] font-bold text-white">{c.m}</div>
                        <div className="text-[10.5px] font-[var(--font-mono)]" style={{ color: 'rgba(255,255,255,0.6)' }}>{c.studio}</div>
                      </div>
                    </>
                  )}
                </div>
                <div className="p-4 grid gap-2" style={{ gridTemplateColumns: c.st === 'live' ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr' }}>
                  {c.st === 'live' ? (
                    <>
                      <Button variant="ghost" className="!text-[11px]">📺 Voir</Button>
                      <Button variant="ghost" className="!text-[11px]">💬 Chat</Button>
                      <Button variant="ghost" className="!text-[11px]">📊 Stats</Button>
                      <Button variant="ghost" className="!text-[11px]" style={{ color: 'var(--color-danger)', borderColor: 'rgba(251,113,133,0.3)' }}>⏹ Stop</Button>
                    </>
                  ) : c.st === 'planned' ? (
                    <>
                      <Button variant="primary" className="!text-[11px]">▶ Démarrer now</Button>
                      <Button variant="ghost" className="!text-[11px]">📅 Modifier</Button>
                      <Button variant="ghost" className="!text-[11px]">⚙ Config</Button>
                    </>
                  ) : (
                    <>
                      <Button variant={c.st === 'maintenance' ? 'ghost' : 'primary'} className="!text-[11px]" disabled={c.st === 'maintenance'}>{c.st === 'maintenance' ? '🛠️ En cours' : '▶ Démarrer'}</Button>
                      <Button variant="ghost" className="!text-[11px]">📅 Planifier</Button>
                      <Button variant="ghost" className="!text-[11px]">⚙ Config</Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          <Card variant="premium" className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="mono-tag">PLANNING AUJOURD'HUI</div>
                <div className="text-[15px] font-semibold mt-0.5">Jeudi 23 avril · 9 créneaux</div>
              </div>
              <Button variant="ghost" className="!text-[11px]">+ Créneau</Button>
            </div>
            <div className="relative" style={{ height: 80 }}>
              <div className="absolute inset-0 flex text-[9px] font-[var(--font-mono)]" style={{ color: 'var(--color-muted)' }}>
                {Array.from({ length: 13 }, (_, i) => (
                  <div key={i} className="flex-1 border-l pt-1 pl-1" style={{ borderColor: 'var(--color-border)' }}>{String(8 + i).padStart(2, '0')}h</div>
                ))}
              </div>
              <div className="absolute top-[28px] h-10 rounded-lg flex items-center px-2 text-[11px] font-semibold text-white" style={{ left: '8%', width: '16%', background: 'linear-gradient(135deg,#818cf8,#6366f1)', boxShadow: '0 4px 12px rgba(99,102,241,0.4)' }}>🔴 Carla · Zurich A</div>
              <div className="absolute top-[28px] h-10 rounded-lg flex items-center px-2 text-[11px] font-semibold text-white" style={{ left: '22%', width: '12%', background: 'linear-gradient(135deg,#fb7185,#f43f5e)' }}>🔴 Sophie · Genève</div>
              <div className="absolute top-[28px] h-10 rounded-lg flex items-center px-2 text-[11px] font-semibold" style={{ left: '48%', width: '18%', background: 'rgba(129,140,248,0.15)', border: '1px dashed var(--color-border-2)', color: 'var(--color-accent-l)' }}>⏳ Bella · 14h-17h</div>
              <div className="absolute top-[28px] h-10 rounded-lg flex items-center px-2 text-[11px] font-semibold" style={{ left: '70%', width: '14%', background: 'rgba(129,140,248,0.15)', border: '1px dashed var(--color-border-2)', color: 'var(--color-accent-l)' }}>⏳ Nadia · 18h-20h30</div>
            </div>
          </Card>
        </div>

        <div className="space-y-3">
          <Card variant="premium" className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="mono-tag">TIPS LIVE</div>
                <div className="text-[15px] font-semibold mt-0.5">💸 Auto → TX DADASH</div>
              </div>
              <div className="w-2 h-2 rounded-full blink" style={{ background: 'var(--color-danger)' }} />
            </div>
            <div className="space-y-2 max-h-[280px] overflow-y-auto scrollbar">
              {TIPS.map((t, i) => (
                <div key={i} className="p-2.5 rounded-xl" style={{ background: 'var(--color-card-2)', border: '1px solid var(--color-border)', borderLeft: '2px solid var(--color-accent)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px]">{t.tier}</span>
                      <span className="text-[12px] font-semibold">{t.spender}</span>
                    </div>
                    <span className="text-[15px] font-bold font-[var(--font-mono)] metallic-anim">+{t.amt}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10.5px] font-[var(--font-mono)]" style={{ color: 'var(--color-muted)' }}>→ {t.model} · {t.t}</span>
                    {t.msg && <span className="text-[10.5px] italic" style={{ color: 'var(--color-text-2)' }}>"{t.msg}"</span>}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card variant="premium" className="p-5">
            <div className="mono-tag">TOP VIEWERS · LIVE</div>
            <div className="text-[15px] font-semibold mt-1 mb-3">👁️ Baleines connectées</div>
            <div className="space-y-2">
              {VIEWERS.map((v) => (
                <div key={v.name} className="flex items-center gap-2.5 p-2 rounded-lg" style={{ background: 'var(--color-card-2)' }}>
                  <span className="text-[14px]">{v.tier}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold truncate">{v.name}</div>
                    <div className="text-[10px] font-[var(--font-mono)]" style={{ color: 'var(--color-muted)' }}>{v.model} · {v.time}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[13px] font-bold font-[var(--font-mono)] metallic-text">{v.spent}</div>
                    <div className="text-[9px] font-[var(--font-mono)]" style={{ color: 'var(--color-muted)' }}>session</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card variant="premium" className="p-5">
            <div className="mono-tag">QUALITÉ TECHNIQUE</div>
            <div className="text-[15px] font-semibold mt-1 mb-3">📡 Signal cames</div>
            <div className="space-y-2 text-[12px]">
              {[
                { n: 'Carla · Zurich A', bars: 5, q: '1080p', ok: true },
                { n: 'Sophie · Genève', bars: 4, q: '4K', ok: true },
                { n: 'Nadia · Home', bars: 3, q: '720p', ok: false },
              ].map((c) => (
                <div key={c.n} className="flex items-center justify-between">
                  <span>{c.n}</span>
                  <div className="flex items-center gap-1">
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="w-1 rounded-sm" style={{ height: 6 + i * 2, background: i <= c.bars ? (c.ok ? 'var(--color-success)' : 'var(--color-warning)') : 'var(--color-card-2)' }} />
                      ))}
                    </div>
                    <span className="text-[10px] font-[var(--font-mono)] ml-1">{c.q}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
