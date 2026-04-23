import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';

type Tab = 'compte' | 'roles' | 'bots' | 'secu' | 'integ';

export function ParamsPage() {
  const [tab, setTab] = useState<Tab>('compte');
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <div className="mono-tag">SYSTEM CONFIGURATION</div>
          <div className="text-[26px] font-bold mt-1">Paramètres</div>
          <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>5 sub-tabs (simplifié depuis 10 en v1)</div>
        </div>
      </div>
      <div className="grid grid-cols-[220px_1fr] gap-5">
        <div className="space-y-1">
          {[
            { k: 'compte' as Tab, e: '👤', l: 'Compte' },
            { k: 'roles' as Tab, e: '🔐', l: 'Rôles' },
            { k: 'bots' as Tab, e: '🤖', l: 'Bots' },
            { k: 'secu' as Tab, e: '🛡️', l: 'Sécurité' },
            { k: 'integ' as Tab, e: '🔌', l: 'Intégrations' },
          ].map((n) => (
            <button key={n.k} onClick={() => setTab(n.k)}
                    className="flex items-center gap-3 px-3 py-2 rounded-[10px] text-[13px] font-medium cursor-pointer transition-all duration-200 w-full text-left"
                    style={{
                      background: tab === n.k ? 'linear-gradient(135deg,rgba(129,140,248,0.16),rgba(99,102,241,0.06))' : 'transparent',
                      border: tab === n.k ? '1px solid var(--color-border-2)' : '1px solid transparent',
                      color: tab === n.k ? 'var(--color-text)' : 'var(--color-text-2)',
                    }}>
              <span className="text-[15px] w-5 text-center">{n.e}</span>{n.l}
            </button>
          ))}
        </div>
        <Card variant="premium" className="p-5">
          {tab === 'compte' && (
            <>
              <div className="mono-tag">PROFILE</div>
              <div className="text-[16px] font-bold mt-1 mb-4">Compte DADA</div>
              <div className="space-y-3">
                {[
                  { l: 'Email', v: 'martin.delamare@mail.novancia.fr' },
                  { l: 'Nom', v: 'Martin Delamare (DADA)' },
                ].map((f) => (
                  <div key={f.l}>
                    <label className="mono-tag">{f.l}</label>
                    <input className="w-full mt-1 px-3 py-2.5 text-[13px] bg-[var(--color-card-2)] border border-[var(--color-border)] rounded-[10px] text-[var(--color-text)]" defaultValue={f.v} />
                  </div>
                ))}
                <div>
                  <label className="mono-tag">Fuseau</label>
                  <select className="w-full mt-1 px-3 py-2.5 text-[13px] bg-[var(--color-card-2)] border border-[var(--color-border)] rounded-[10px] text-[var(--color-text)]"><option>GMT-3 (Brésil)</option></select>
                </div>
                <div>
                  <label className="mono-tag">Langue</label>
                  <select className="w-full mt-1 px-3 py-2.5 text-[13px] bg-[var(--color-card-2)] border border-[var(--color-border)] rounded-[10px] text-[var(--color-text)]"><option>Français</option></select>
                </div>
                <div className="pt-3"><Button variant="primary">Enregistrer</Button></div>
              </div>
            </>
          )}
          {tab === 'roles' && (
            <>
              <div className="mono-tag">ACCESS MATRIX</div>
              <div className="text-[16px] font-bold mt-1 mb-4">Rôles & permissions</div>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left">
                    {['Rôle', 'Dashboard', 'TX', 'Live OPS', 'Compta', 'Dadacast', 'SwissCam'].map((h, i) => (
                      <th key={h} className={`font-[var(--font-mono)] text-[10px] uppercase tracking-wider font-semibold px-3 py-3 border-b border-[var(--color-border)] text-[var(--color-muted)] ${i > 0 ? 'text-center' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { r: 'Admin (Gérant)', c: ['✅', 'validate', '✅', '✅', '✅', '✅'], em: 1 },
                    { r: 'MC', c: ['filtré', 'read', 'équipe', '❌', '✅', 'view'] },
                    { r: 'Chatter', c: ['perso', 'perso', '❌', '❌', '❌', '❌'] },
                    { r: 'Modèle', c: ['fiche', '❌', '❌', 'paie', '❌', 'propre cam'] },
                  ].map((row) => (
                    <tr key={row.r} className="border-b" style={{ borderColor: 'rgba(129,140,248,0.06)' }}>
                      <td className="px-3 py-2.5 font-semibold">{row.r}</td>
                      {row.c.map((v, i) => <td key={i} className="px-3 py-2.5 text-center" style={row.em && i === 0 ? { color: 'var(--color-accent-l)', fontWeight: 700 } : undefined}>{v}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {tab === 'bots' && (
            <>
              <div className="mono-tag">BOT FLEET</div>
              <div className="text-[16px] font-bold mt-1 mb-4">Bots Telegram / Messagerie</div>
              <div className="space-y-3">
                {[
                  { n: 'autofill v2', d: 'Python 3.12 · Telethon · Railway · le seul actif', st: 'Online', tone: 'success' as const, border: 'var(--color-success)' },
                  { n: 'Bot TG', d: 'Rôle flou · audit CARLOS planifié', st: 'À auditer', tone: 'warning' as const, border: 'var(--color-warning)' },
                  { n: 'Chatting Bot', d: 'Doublon Bot TG suspecté', st: 'À auditer', tone: 'warning' as const, border: 'var(--color-warning)' },
                  { n: 'Scan Checker', d: 'À VIRER', st: 'Paused', tone: 'danger' as const, border: 'var(--color-danger)', strike: true },
                ].map((b) => (
                  <div key={b.n} className="p-3 rounded-xl flex items-center gap-3"
                       style={{ background: 'var(--color-card-2)', borderLeft: `2px solid ${b.border}`, borderRadius: '0 12px 12px 0', opacity: b.strike ? 0.5 : 1 }}>
                    <span className="text-[22px]">🤖</span>
                    <div className="flex-1">
                      <div className="text-[13px] font-semibold" style={b.strike ? { textDecoration: 'line-through' } : undefined}>{b.n}</div>
                      <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>{b.d}</div>
                    </div>
                    <Chip tone={b.tone}>{b.st}</Chip>
                  </div>
                ))}
              </div>
            </>
          )}
          {tab === 'secu' && (
            <>
              <div className="mono-tag">SECURITY POSTURE</div>
              <div className="text-[16px] font-bold mt-1 mb-4">Sécurité · <span className="metallic-anim">95/100</span></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl" style={{ background: 'var(--color-card-2)' }}><div className="mono-tag">Tables RLS</div><div className="text-[24px] font-bold font-[var(--font-mono)]" style={{ color: 'var(--color-success)' }}>128/128</div></div>
                <div className="p-4 rounded-2xl" style={{ background: 'var(--color-card-2)' }}><div className="mono-tag">Policies</div><div className="text-[24px] font-bold font-[var(--font-mono)]">280</div></div>
                <div className="p-4 rounded-2xl col-span-2" style={{ background: 'var(--color-card-2)' }}><div className="mono-tag">pgcrypto AES-256</div><div className="text-[13px] mt-1 font-[var(--font-mono)]">bot_key · telegram_bot_token · sc_models · watson</div></div>
                <div className="p-4 rounded-2xl" style={{ background: 'var(--color-card-2)' }}><div className="mono-tag">WARN restants</div><div className="text-[24px] font-bold font-[var(--font-mono)]" style={{ color: 'var(--color-warning)' }}>41</div></div>
                <div className="p-4 rounded-2xl" style={{ background: 'var(--color-card-2)' }}><div className="mono-tag">ERROR</div><div className="text-[24px] font-bold font-[var(--font-mono)]" style={{ color: 'var(--color-success)' }}>0</div></div>
              </div>
              <Card className="mt-4 p-3 relative overflow-hidden text-[12.5px]" style={{ background: 'linear-gradient(135deg,rgba(129,140,248,0.08),rgba(99,102,241,0.02))', borderColor: 'var(--color-border-2)' }}>
                <div className="absolute top-0 left-0 w-[3px] h-full" style={{ background: 'var(--metallic)' }} />
                <b>Évolution</b> : 38 → 45 → 75 → 85 → 92 → <span className="metallic-anim">95</span>
              </Card>
            </>
          )}
          {tab === 'integ' && (
            <>
              <div className="mono-tag">EXTERNAL SYSTEMS</div>
              <div className="text-[16px] font-bold mt-1 mb-4">Intégrations</div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['GitHub', 'Connecté', 'dadashhh/dadash-crm'],
                  ['Supabase', 'Connecté', 'lkrzjwfwhiimpnsyeuxi'],
                  ['Vercel', 'Connecté', 'dadash.co'],
                  ['Railway', 'Connecté', 'autofill v2'],
                  ['Stripe', 'Connecté', 'API key live'],
                  ['PayPal', 'Connecté', 'Business'],
                  ['Telegram Bot API', 'Connecté', 'Telethon'],
                  ['OpenAI', 'Non connecté', 'Pour future IA'],
                ].map(([n, st, d]) => (
                  <div key={n} className="p-3 rounded-xl flex items-center justify-between" style={{ background: 'var(--color-card-2)' }}>
                    <div>
                      <div className="text-[13px] font-semibold">{n}</div>
                      <div className="text-[11px] font-[var(--font-mono)]" style={{ color: 'var(--color-muted)' }}>{d}</div>
                    </div>
                    <Chip tone={st === 'Connecté' ? 'success' : 'muted'}>{st}</Chip>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
