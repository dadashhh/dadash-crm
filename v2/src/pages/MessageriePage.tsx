import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';

const MODELS = ['Carla', 'Sophie', 'Bella', 'Nadia', 'Lea', 'Alice', 'Maria', 'Jade', 'Alix'];
const CHATTERS = ['Alex', 'Jules', 'Marco', 'Yann', 'Nina', 'Kevin', 'Luca', 'Sam'];
const FLAGS = ['🇫🇷', '🇩🇪', '🇬🇧', '🇮🇹'];
const TIERS = [
  { e: '🐟', n: 'Fish' }, { e: '🐒', n: 'Monkey' }, { e: '🦍', n: 'Gorille' },
  { e: '🐋', n: 'Whale' }, { e: '🦈', n: 'Shark' },
];
const CONVS = [
  'Karl M.', 'Hans F.', 'Dimitri V.', 'Paul O.', 'Luca R.', 'Max W.',
  'Antoine L.', 'Miguel S.', 'Oleg R.', 'Jamal K.', 'Franz B.', 'Sebastian Z.',
];
const MSGS = [
  { f: 's' as const, t: 'Salut beauté 💋', h: '09:12' },
  { f: 'm' as const, t: 'Hey Karl 😘 content de te revoir', h: '09:14' },
  { f: 's' as const, t: "Tu m'as manqué, t'as du nouveau ?", h: '09:15' },
  { f: 'm' as const, t: 'Un pack photo exclusif tombé hier 🔥 300 CHF tu le veux ?', h: '09:18' },
  { f: 's' as const, t: 'Hmm montre moi un teaser', h: '09:20' },
  { f: 'm' as const, t: '[teaser.jpg]', h: '09:21' },
  { f: 's' as const, t: 'Ok je prends les 300', h: '09:38' },
  { f: 'm' as const, t: 'Tu me fais kiffer 🥰 lien de paiement envoyé', h: '09:40' },
];

export function MessageriePage() {
  const [activeTab, setActiveTab] = useState('conv');
  return (
    <section style={{ margin: '-16px -8px 0' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="mono-tag">COMMUNICATION DESK</div>
          <div className="w-px h-5 bg-[var(--color-border)]" />
          <div className="text-[13px] text-[var(--color-text-2)]">
            <b>247</b> conversations · <span style={{ color: 'var(--color-warning)' }}><b>7 non lus</b></span>
          </div>
        </div>
        <div className="inline-flex gap-0.5 bg-[var(--color-card-2)] border border-[var(--color-border)] rounded-[10px] p-0.5">
          <TabBtn active={activeTab === 'conv'} onClick={() => setActiveTab('conv')}>Conv</TabBtn>
          <TabBtn active={activeTab === 'pro'} onClick={() => setActiveTab('pro')}>Conv Pro 🚧</TabBtn>
          <TabBtn active={activeTab === 'tindada'} onClick={() => setActiveTab('tindada')}>TINDADA</TabBtn>
        </div>
      </div>

      <Card variant="premium" className="px-4 py-2.5 mb-3">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar">
          <div className="relative shrink-0" style={{ width: 220 }}>
            <input
              className="w-full pl-3 py-1.5 text-[12px] bg-[var(--color-card-2)] border border-[var(--color-border)] rounded-[10px] text-[var(--color-text)] outline-none"
              placeholder="Rechercher…"
            />
          </div>
          <div className="w-px h-5 bg-[var(--color-border)] shrink-0" />
          <span className="mono-tag shrink-0">MODÈLE</span>
          <select className="px-2 py-1.5 text-[11.5px] bg-[var(--color-card-2)] border border-[var(--color-border)] rounded-[10px] text-[var(--color-text)] shrink-0">
            <option>Tous</option>
            {MODELS.map((m) => <option key={m}>{m}</option>)}
          </select>
          <div className="w-px h-5 bg-[var(--color-border)] shrink-0" />
          <span className="mono-tag shrink-0">TIER</span>
          <div className="flex items-center gap-1 shrink-0">
            <FilterPill active>Tous</FilterPill>
            {TIERS.map((t) => <FilterPill key={t.n} title={t.n}>{t.e}</FilterPill>)}
            <FilterPill title="Scammer">🚨</FilterPill>
          </div>
          <div className="w-px h-5 bg-[var(--color-border)] shrink-0" />
          <span className="mono-tag shrink-0">LANGUE</span>
          <div className="flex items-center gap-1 shrink-0">
            <FilterPill active>Ttes</FilterPill>
            {FLAGS.map((f) => <FilterPill key={f}>{f}</FilterPill>)}
          </div>
          <div className="w-px h-5 bg-[var(--color-border)] shrink-0" />
          <span className="mono-tag shrink-0">CHATTER</span>
          <select className="px-2 py-1.5 text-[11.5px] bg-[var(--color-card-2)] border border-[var(--color-border)] rounded-[10px] text-[var(--color-text)] shrink-0">
            <option>Tous</option>
            {CHATTERS.map((c) => <option key={c}>{c}</option>)}
          </select>
          <div className="w-px h-5 bg-[var(--color-border)] shrink-0" />
          <label className="filter-pill-active shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-[10px] border cursor-pointer"
                 style={{ background: 'linear-gradient(135deg,rgba(129,140,248,0.18),rgba(99,102,241,0.08))', borderColor: 'var(--color-accent)', color: 'var(--color-accent-xl)' }}>
            <input type="checkbox" defaultChecked /> Non lus
          </label>
          <Button variant="ghost" className="!py-1 !px-2 !text-[10.5px] shrink-0 ml-auto">↺ Reset</Button>
        </div>
      </Card>

      <div className="grid grid-cols-[220px_1fr_240px] gap-3" style={{ height: 'calc(100vh - 220px)' }}>
        <Card variant="premium" className="overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto scrollbar">
            {CONVS.map((n, i) => {
              const unread = i < 7 && i % 2 === 0;
              const tier = TIERS[Math.min(4, Math.floor(i / 3))];
              return (
                <div key={n} className="p-3 border-b flex items-center gap-3 cursor-pointer"
                     style={{ borderColor: 'var(--color-border)', ...(i === 0 && { background: 'linear-gradient(90deg,rgba(129,140,248,0.1),transparent)' }) }}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-[11px] relative"
                       style={{ background: 'var(--metallic)', color: '#0a0d18' }}>
                    {n[0]}
                    {unread && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full pulse-red" style={{ background: 'var(--color-danger)' }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12.5px] font-semibold truncate">{n}</span>
                      <span>{tier.e}</span>
                      <span>{FLAGS[i % 4]}</span>
                    </div>
                    <div className="text-[11px] truncate" style={{ color: 'var(--color-muted)' }}>
                      {['Tu me manques 😘', 'Du neuf ?', 'Pack reçu', '500 ok ?', 'Je veux custom', 'Réponds stp', 'Coucou', 'Ce soir ?'][i % 8]}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-[var(--font-mono)]" style={{ color: 'var(--color-muted)' }}>{String(9 - (i % 9)).padStart(2, '0')}:0{i % 6}</div>
                    {unread && <Chip tone="danger" className="mt-1 !px-1.5 !py-0 !text-[9px]">{(i % 5) + 1}</Chip>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card variant="premium" className="overflow-hidden flex flex-col" style={{ boxShadow: 'var(--shadow-premium),0 0 40px rgba(129,140,248,0.08)' }}>
          <div className="px-5 py-3 border-b flex items-center gap-3 glass" style={{ borderColor: 'var(--color-border)' }}>
            <div className="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-[15px]" style={{ background: 'var(--metallic)', color: '#0a0d18' }}>K</div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[16px]">Karl M.</span>
                <span className="text-[18px]">🐋</span>
                <span>🇩🇪</span>
                <Chip tone="indigo">VIP 82</Chip>
              </div>
              <div className="text-[11.5px] font-[var(--font-mono)]" style={{ color: 'var(--color-muted)' }}>
                avec <b style={{ color: 'var(--color-accent-l)' }}>Sophie</b> · Alex · TX 2h · 1 240 CHF
              </div>
            </div>
            <Button variant="ghost" className="!text-[11px]">📋 Script</Button>
            <Button variant="ghost" className="!text-[11px]">🤖 IA</Button>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar px-8 py-6 space-y-5">
            {MSGS.map((m, i) => (
              <div key={i} className={`flex ${m.f === 'm' ? 'justify-end' : ''}`}>
                <div className="max-w-[68%]">
                  <div className="px-5 py-3.5 text-[15px]" style={{
                    background: m.f === 'm' ? 'var(--grad-primary)' : 'var(--color-card-2)',
                    color: m.f === 'm' ? 'white' : 'var(--color-text)',
                    borderRadius: '20px',
                    ...(m.f === 'm' ? { borderBottomRightRadius: '6px' } : { borderBottomLeftRadius: '6px' }),
                    border: `1px solid ${m.f === 'm' ? 'rgba(199,210,254,0.25)' : 'var(--color-border)'}`,
                    boxShadow: m.f === 'm' ? '0 6px 20px rgba(99,102,241,0.3),0 1px 0 rgba(255,255,255,0.15) inset' : '0 2px 8px rgba(0,0,0,0.15)',
                    lineHeight: 1.5,
                  }}>
                    {m.t}
                  </div>
                  <div className={`text-[10.5px] font-[var(--font-mono)] mt-1.5 px-2 ${m.f === 'm' ? 'text-right' : ''}`} style={{ color: 'var(--color-muted)' }}>
                    {m.h}{m.f === 'm' && <> · <span style={{ color: 'var(--color-success)' }}>✓✓ lu</span></>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="px-5 py-4 border-t" style={{ borderColor: 'var(--color-border)', background: 'linear-gradient(180deg,transparent,rgba(129,140,248,0.03))' }}>
            <div className="flex items-end gap-3">
              <textarea rows={2} className="flex-1 py-3 text-[14px] bg-[var(--color-card-2)] border border-[var(--color-border)] rounded-[10px] text-[var(--color-text)] px-3 outline-none" placeholder="Écrire un message à Karl… (Shift+Enter saut de ligne)" />
              <Button variant="primary" className="!px-6 !py-3 !text-[13.5px]">Envoyer</Button>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <Button variant="ghost" className="!text-[12px]">📎 Média</Button>
              <Button variant="ghost" className="!text-[12px]">🎁 Catalogue</Button>
              <Button variant="ghost" className="!text-[12px]">💰 Créer TX</Button>
              <Button variant="ghost" className="!text-[12px]">😊 Emoji</Button>
              <Button variant="ghost" className="!text-[12px]">⚡ Templates</Button>
              <span className="ml-auto text-[11px] font-[var(--font-mono)]" style={{ color: 'var(--color-muted)' }}>Session 00:14:22 · Alex typing…</span>
            </div>
          </div>
        </Card>

        <Card variant="premium" className="overflow-hidden flex flex-col">
          <div className="p-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <div className="mono-tag">SPENDER</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[14px] font-semibold">Karl M.</span>
              <Chip tone="indigo">VIP 82</Chip>
            </div>
          </div>
          <div className="p-3 space-y-3 overflow-y-auto scrollbar text-[11.5px]">
            <div>
              <div className="mono-tag">CA LIFETIME</div>
              <div className="text-[18px] font-bold font-[var(--font-mono)] metallic-anim">18 420 CHF</div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { l: 'TX', v: '47' }, { l: 'AOV', v: '392' },
                { l: 'Dernière', v: '2h' }, { l: 'Tier', v: '🐋 Whale' },
              ].map((s) => (
                <div key={s.l} className="p-1.5 rounded-lg bg-[var(--color-card-2)]">
                  <div className="mono-tag" style={{ fontSize: 9 }}>{s.l}</div>
                  <div className="font-[var(--font-mono)] font-bold">{s.v}</div>
                </div>
              ))}
            </div>
            <div className="h-px bg-[var(--color-border)] my-2" />
            <div className="mono-tag">STRATÉGIES IA</div>
            <div className="space-y-1.5">
              <div className="p-2 rounded-lg relative overflow-hidden"
                   style={{ background: 'linear-gradient(135deg,rgba(129,140,248,0.08),rgba(99,102,241,0.02))', border: '1px solid var(--color-border-2)' }}>
                <div className="absolute top-0 left-0 w-[3px] h-full" style={{ background: 'var(--metallic)' }} />
                <div className="text-[11.5px] font-semibold">🎯 Pousser → Shark</div>
                <div className="text-[10px]" style={{ color: 'var(--color-muted)' }}>+2k CA 30j · conf 72%</div>
              </div>
              <div className="p-2 rounded-lg bg-[var(--color-card-2)] border border-[var(--color-border)]">
                <div className="text-[11.5px] font-semibold">💎 Custom 500+</div>
                <div className="text-[10px]" style={{ color: 'var(--color-muted)' }}>Fréquence x2 possible</div>
              </div>
            </div>
            <div className="h-px bg-[var(--color-border)] my-2" />
            <div className="mono-tag">NOTES MC</div>
            <div className="p-2 rounded-lg text-[10.5px] bg-[var(--color-card-2)] border border-[var(--color-border)]" style={{ color: 'var(--color-text-2)' }}>
              Réactif soir CEST · Photos custom · Budget ~800 CHF
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}

function TabBtn({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all duration-200 ${active ? 'text-white shadow-[0_2px_8px_rgba(99,102,241,0.35)]' : 'text-[var(--color-text-2)] hover:bg-[rgba(129,140,248,0.06)]'}`}
            style={active ? { background: 'var(--grad-primary)' } : undefined}>
      {children}
    </button>
  );
}

function FilterPill({ children, active, title }: { children: React.ReactNode; active?: boolean; title?: string }) {
  return (
    <button title={title}
            className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-[10px] border transition-colors duration-200 ${active ? 'text-[var(--color-accent-xl)]' : 'text-[var(--color-text-2)]'}`}
            style={{
              background: active ? 'linear-gradient(135deg,rgba(129,140,248,0.18),rgba(99,102,241,0.08))' : 'var(--color-card-2)',
              borderColor: active ? 'var(--color-accent)' : 'var(--color-border)',
            }}>
      {children}
    </button>
  );
}
