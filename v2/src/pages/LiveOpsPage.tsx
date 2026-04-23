import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';

const CHATTERS = ['Alex', 'Jules', 'Marco', 'Yann', 'Nina', 'Kevin', 'Luca', 'Sam'];
const MODELS = ['Carla', 'Sophie', 'Bella', 'Nadia', 'Lea', 'Alice'];
const FLAGS = ['🇫🇷', '🇩🇪', '🇬🇧', '🇮🇹'];
const rand = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = <T,>(a: T[]): T => a[rand(0, a.length - 1)];

interface Alert { t: string; ico: string; lvl: 'danger' | 'warning' | 'indigo' | 'success'; txt: string; }
const ALERTS: Alert[] = [
  { t: '09:42:18', ico: '🔴', lvl: 'danger', txt: 'RED ALERT · Marco ignore 🐋 Karl M. depuis 3min42' },
  { t: '09:41:02', ico: '🟠', lvl: 'warning', txt: 'Nouveau spender non pris · Jules · 6min' },
  { t: '09:38:55', ico: '🟡', lvl: 'indigo', txt: 'Souris idle 5min · Yann' },
  { t: '09:35:12', ico: '🟠', lvl: 'warning', txt: 'Style robotique détecté · Nina · conf 0.84' },
  { t: '09:32:40', ico: '🟢', lvl: 'success', txt: 'Conv TX +18% · Alex · dernière heure' },
  { t: '09:30:07', ico: '🟡', lvl: 'indigo', txt: 'Score qualité baisse · Kevin · 58/100' },
  { t: '09:28:22', ico: '🟢', lvl: 'success', txt: 'TX validée 520 CHF · Alex → Sophie' },
];

export function LiveOpsPage() {
  const [liveCa, setLiveCa] = useState(1284);
  const [liveMsg, setLiveMsg] = useState(142);
  useEffect(() => {
    const id = setInterval(() => { setLiveCa(rand(1200, 1400)); setLiveMsg(rand(120, 170)); }, 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <div className="mono-tag">SALLE DE TRADING · TEMPS RÉEL</div>
          <div className="flex items-center gap-3 mt-1">
            <div className="w-3 h-3 rounded-full blink" style={{ background: 'var(--color-danger)', boxShadow: '0 0 12px rgba(251,113,133,0.8)' }} />
            <div className="text-[26px] font-bold">Live OPS</div>
            <Chip tone="danger" className="pulse-red">LIVE · 2s</Chip>
          </div>
          <div className="text-[12px] mt-1" style={{ color: 'var(--color-muted)' }}>8 chatters actifs · 247 conv simultanées · 34 TX en cours</div>
        </div>
        <div className="flex items-center gap-2">
          <select className="px-3 py-2 text-[12px] bg-[var(--color-card-2)] border border-[var(--color-border)] rounded-[10px] text-[var(--color-text)]"><option>Tous MC</option></select>
          <select className="px-3 py-2 text-[12px] bg-[var(--color-card-2)] border border-[var(--color-border)] rounded-[10px] text-[var(--color-text)]">
            <option>Toutes modèles</option>
            {MODELS.map((m) => <option key={m}>{m}</option>)}
          </select>
          <Button variant="primary">⛶ Plein écran</Button>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-3">
        {[
          { l: 'CA LIVE', v: liveCa, hint: '+84 CHF · 5min', hintTone: 'success' as const, metallic: true },
          { l: 'TX EN COURS', v: '34', hint: '12 pending' },
          { l: 'MSG/MIN', v: liveMsg, hint: '↑ 45% vs moy', hintTone: 'success' as const },
          { l: 'CONV GLOBALE', v: '16.2%', hint: '+1.9%', hintTone: 'success' as const },
          { l: 'RED ALERTS', v: '2', hint: 'baleines ignorées', danger: true },
          { l: 'SCORE QUALITÉ', v: '78/100', hint: 'moy. équipe', success: true },
        ].map((k) => (
          <Card key={k.l} variant="premium" className="p-3" style={k.danger ? { borderColor: 'rgba(251,113,133,0.4)' } : undefined}>
            <div className="mono-tag" style={k.danger ? { color: 'var(--color-danger)' } : undefined}>{k.l}</div>
            <div className={`text-[20px] font-bold font-[var(--font-mono)] mt-1 ${k.metallic ? 'metallic-anim' : ''}`}
                 style={k.danger ? { color: 'var(--color-danger)' } : k.success ? { color: 'var(--color-success)' } : undefined}>{k.v}</div>
            <div className="text-[10px]" style={{ color: k.hintTone === 'success' ? 'var(--color-success)' : 'var(--color-muted)' }}>{k.hint}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-4">
        {CHATTERS.map((c, i) => {
          const alertKind = i === 2 ? 'red' : i === 5 ? 'warn' : 'ok';
          const score = rand(55, 95);
          return (
            <div key={c} className="rounded-[14px] p-[14px] relative overflow-hidden transition-all duration-250"
                 style={{
                   background: alertKind === 'red' ? 'linear-gradient(135deg,rgba(251,113,133,0.05),transparent 60%)' : 'var(--color-card)',
                   border: `1px solid ${alertKind === 'red' ? 'rgba(251,113,133,0.4)' : alertKind === 'warn' ? 'rgba(251,191,36,0.35)' : 'var(--color-border)'}`,
                 }}>
              <div className="absolute top-0 left-0 right-0 h-[2px]" style={{
                background: alertKind === 'red' ? 'var(--color-danger)' : alertKind === 'warn' ? 'var(--color-warning)' : 'var(--color-success)',
                boxShadow: alertKind === 'red' ? '0 0 12px var(--color-danger)' : undefined,
              }} />
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-[12px]" style={{ background: 'var(--metallic)', color: '#0a0d18' }}>{c[0]}</div>
                  <div>
                    <div className="text-[13px] font-semibold">{c}</div>
                    <div className="text-[10px] font-[var(--font-mono)]" style={{ color: 'var(--color-muted)' }}>{pick(MODELS)} · {pick(FLAGS)}</div>
                  </div>
                </div>
                {alertKind === 'red' ? <Chip tone="danger" className="pulse-red">🐋 IGNORÉE 3:42</Chip>
                 : alertKind === 'warn' ? <Chip tone="warning">IDLE 5min</Chip>
                 : <Chip tone="success">ACTIVE</Chip>}
              </div>
              <div className="grid grid-cols-3 gap-2 text-[10.5px]">
                {[
                  { l: 'CA/h', v: rand(80, 260), metallic: true },
                  { l: 'Msg/min', v: rand(12, 45) },
                  { l: 'Conv', v: `${rand(8, 22)}%` },
                  { l: 'Parallel', v: rand(3, 9) },
                  { l: 'Réponse', v: `${rand(18, 140)}s` },
                  { l: 'Score', v: score, color: score > 75 ? 'var(--color-success)' : score > 60 ? 'var(--color-warning)' : 'var(--color-danger)' },
                ].map((s) => (
                  <div key={s.l}>
                    <div className="mono-tag">{s.l}</div>
                    <div className={`font-[var(--font-mono)] font-bold ${s.metallic ? 'metallic-text' : ''}`} style={{ color: s.color }}>{s.v}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t flex items-center gap-1.5" style={{ borderColor: 'var(--color-border)' }}>
                <Button variant="ghost" className="!py-1 !px-2 !text-[10px]">👁️ Screen</Button>
                <Button variant="ghost" className="!py-1 !px-2 !text-[10px]">📜 Replay</Button>
                <Button variant="ghost" className="!py-1 !px-2 !text-[10px] ml-auto">💬 Ping MC</Button>
              </div>
            </div>
          );
        })}
      </div>

      <Card variant="premium" className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="mono-tag">FLUX ALERTES</div>
            <div className="text-[15px] font-semibold">Temps réel</div>
          </div>
          <Button variant="ghost" className="!text-[11px]">⚙ Seuils</Button>
        </div>
        <div className="space-y-1.5 max-h-[260px] overflow-y-auto scrollbar">
          {ALERTS.map((a, i) => (
            <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg" style={{ background: 'var(--color-card-2)' }}>
              <span className="font-[var(--font-mono)] text-[10.5px]" style={{ color: 'var(--color-muted)' }}>{a.t}</span>
              <span>{a.ico}</span>
              <span className="text-[12px] flex-1">{a.txt}</span>
              <Button variant="ghost" className="!py-1 !px-3 !text-[10.5px]">Ack</Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
