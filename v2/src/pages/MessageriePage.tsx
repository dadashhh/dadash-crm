import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { useTgConversations, useTgMessages, useModels, useChatters, useSendMessage, useSpenders } from '@/hooks/useDadashData';

const FLAGS: Record<string, string> = { fr: '🇫🇷', de: '🇩🇪', en: '🇬🇧', it: '🇮🇹', es: '🇪🇸', pt: '🇵🇹' };

function getTier(total: number): { e: string; n: string } {
  if (total >= 10000) return { e: '🦈', n: 'Shark' };
  if (total >= 3000) return { e: '🐋', n: 'Whale' };
  if (total >= 1000) return { e: '🦍', n: 'Gorille' };
  if (total >= 200) return { e: '🐒', n: 'Monkey' };
  return { e: '🐟', n: 'Fish' };
}

export function MessageriePage() {
  const [modelFilter, setModelFilter] = useState<string | null>(null);
  const [chatterFilter, setChatterFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<string | null>(null);
  const [langFilter, setLangFilter] = useState<string | null>(null);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [msgInput, setMsgInput] = useState('');

  const { data: convs, isLoading: loadingConvs } = useTgConversations({ limit: 200, modelId: modelFilter ?? undefined, chatterId: chatterFilter ?? undefined });
  const { data: messages } = useTgMessages(selectedConvId ?? undefined);
  const { data: models } = useModels();
  const { data: chatters } = useChatters();
  const { data: spenders } = useSpenders({ limit: 500 });
  const sendMsg = useSendMessage();

  const modelById = useMemo(() => Object.fromEntries((models ?? []).map(m => [m.id, m])), [models]);
  const spenderById = useMemo(() => Object.fromEntries((spenders ?? []).map(s => [s.id, s])), [spenders]);

  const filteredConvs = useMemo(() => {
    let list = convs ?? [];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(c => {
        const name = (c.display_name ?? c.tg_display_name ?? c.username ?? c.tg_username ?? '').toLowerCase();
        return name.includes(s);
      });
    }
    if (tierFilter) {
      list = list.filter(c => {
        const sp = c.spender_id ? spenderById[c.spender_id] : null;
        if (!sp) return tierFilter === 'Fish';
        return getTier(Number(sp.total_spent ?? 0)).n === tierFilter;
      });
    }
    if (langFilter) {
      list = list.filter(c => {
        const sp = c.spender_id ? spenderById[c.spender_id] : null;
        return sp?.language === langFilter || sp?.langue === langFilter;
      });
    }
    return list;
  }, [convs, search, tierFilter, langFilter, spenderById]);

  const selectedConv = useMemo(() => (convs ?? []).find(c => c.id === selectedConvId), [convs, selectedConvId]);
  const selectedSpender = selectedConv?.spender_id ? spenderById[selectedConv.spender_id] : null;
  const selectedModel = selectedConv?.model_id ? modelById[selectedConv.model_id] : null;

  const handleSend = () => {
    if (!selectedConvId || !msgInput.trim()) return;
    sendMsg.mutate({ conversationId: selectedConvId, text: msgInput.trim(), modelId: selectedConv?.model_id ?? undefined });
    setMsgInput('');
  };

  return (
    <section style={{ margin: '-16px -8px 0' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="mono-tag">COMMUNICATION DESK · LIVE DB</div>
          <div className="w-px h-5 bg-[var(--color-border)]" />
          <div className="text-[13px] text-[var(--color-text-2)]">
            <b>{filteredConvs.length}</b> / {convs?.length ?? 0} conversations {loadingConvs && '· chargement…'}
          </div>
        </div>
      </div>

      <Card variant="premium" className="px-4 py-2.5 mb-3">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar">
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="shrink-0 pl-3 py-1.5 text-[12px] bg-[var(--color-card-2)] border border-[var(--color-border)] rounded-[10px] text-[var(--color-text)] outline-none" placeholder="Rechercher…" style={{ width: 220 }} />
          <div className="w-px h-5 bg-[var(--color-border)] shrink-0" />
          <span className="mono-tag shrink-0">MODÈLE</span>
          <select value={modelFilter ?? ''} onChange={(e) => setModelFilter(e.target.value || null)} className="px-2 py-1.5 text-[11.5px] bg-[var(--color-card-2)] border border-[var(--color-border)] rounded-[10px] text-[var(--color-text)] shrink-0">
            <option value="">Tous</option>
            {(models ?? []).map(m => <option key={m.id} value={m.id}>{m.emoji ?? ''} {m.name}</option>)}
          </select>
          <div className="w-px h-5 bg-[var(--color-border)] shrink-0" />
          <span className="mono-tag shrink-0">TIER</span>
          <select value={tierFilter ?? ''} onChange={(e) => setTierFilter(e.target.value || null)} className="px-2 py-1.5 text-[11.5px] bg-[var(--color-card-2)] border border-[var(--color-border)] rounded-[10px] text-[var(--color-text)] shrink-0">
            <option value="">Tous</option>
            <option value="Fish">🐟 Fish</option>
            <option value="Monkey">🐒 Monkey</option>
            <option value="Gorille">🦍 Gorille</option>
            <option value="Whale">🐋 Whale</option>
            <option value="Shark">🦈 Shark</option>
          </select>
          <div className="w-px h-5 bg-[var(--color-border)] shrink-0" />
          <span className="mono-tag shrink-0">LANGUE</span>
          <select value={langFilter ?? ''} onChange={(e) => setLangFilter(e.target.value || null)} className="px-2 py-1.5 text-[11.5px] bg-[var(--color-card-2)] border border-[var(--color-border)] rounded-[10px] text-[var(--color-text)] shrink-0">
            <option value="">Toutes</option>
            <option value="fr">🇫🇷 FR</option>
            <option value="de">🇩🇪 DE</option>
            <option value="en">🇬🇧 EN</option>
            <option value="it">🇮🇹 IT</option>
            <option value="es">🇪🇸 ES</option>
          </select>
          <div className="w-px h-5 bg-[var(--color-border)] shrink-0" />
          <span className="mono-tag shrink-0">CHATTER</span>
          <select value={chatterFilter ?? ''} onChange={(e) => setChatterFilter(e.target.value || null)} className="px-2 py-1.5 text-[11.5px] bg-[var(--color-card-2)] border border-[var(--color-border)] rounded-[10px] text-[var(--color-text)] shrink-0">
            <option value="">Tous</option>
            {(chatters ?? []).map(c => <option key={c.id} value={c.id}>{c.full_name ?? c.email}</option>)}
          </select>
          <Button variant="ghost" className="!py-1 !px-2 !text-[10.5px] shrink-0 ml-auto" onClick={() => { setSearch(''); setModelFilter(null); setChatterFilter(null); setTierFilter(null); setLangFilter(null); }}>↺ Reset</Button>
        </div>
      </Card>

      <div className="grid grid-cols-[260px_1fr_260px] gap-3" style={{ height: 'calc(100vh - 220px)' }}>
        <Card variant="premium" className="overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto scrollbar">
            {filteredConvs.length === 0 && !loadingConvs && (
              <div className="p-8 text-center">
                <div className="text-[30px] opacity-40">📭</div>
                <div className="text-[12px] mt-2" style={{ color: 'var(--color-muted)' }}>Aucune conversation</div>
              </div>
            )}
            {filteredConvs.map((c) => {
              const sp = c.spender_id ? spenderById[c.spender_id] : null;
              const tier = sp ? getTier(Number(sp.total_spent ?? 0)) : null;
              const m = c.model_id ? modelById[c.model_id] : null;
              const name = c.display_name ?? c.tg_display_name ?? [c.tg_first_name, c.tg_last_name].filter(Boolean).join(' ') ?? c.username ?? c.tg_username ?? 'Inconnu';
              const lang = sp?.language ?? sp?.langue;
              const flag = lang ? FLAGS[lang.slice(0, 2).toLowerCase()] : '';
              const isSelected = c.id === selectedConvId;
              return (
                <div key={c.id} onClick={() => setSelectedConvId(c.id)} className="p-3 border-b flex items-center gap-3 cursor-pointer" style={{ borderColor: 'var(--color-border)', background: isSelected ? 'linear-gradient(90deg,rgba(129,140,248,0.12),transparent)' : undefined }}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-[11px]" style={{ background: 'var(--metallic)', color: '#0a0d18' }}>{name[0]?.toUpperCase() ?? '?'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12.5px] font-semibold truncate">{name}</span>
                      {tier && <span>{tier.e}</span>}
                      {flag && <span>{flag}</span>}
                    </div>
                    <div className="text-[11px] truncate" style={{ color: 'var(--color-muted)' }}>{m ? `${m.emoji ?? ''} ${m.name}` : '—'} · {c.status ?? 'active'}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-[var(--font-mono)]" style={{ color: 'var(--color-muted)' }}>
                      {c.last_message_at ? new Date(c.last_message_at).toLocaleString('fr-CH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card variant="premium" className="overflow-hidden flex flex-col" style={{ boxShadow: 'var(--shadow-premium),0 0 40px rgba(129,140,248,0.08)' }}>
          {!selectedConvId ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="text-[40px] opacity-30">💬</div>
                <div className="text-[13px] mt-2" style={{ color: 'var(--color-muted)' }}>Sélectionne une conversation à gauche</div>
              </div>
            </div>
          ) : (
            <>
              <div className="px-5 py-3 border-b flex items-center gap-3 glass" style={{ borderColor: 'var(--color-border)' }}>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-[15px]" style={{ background: 'var(--metallic)', color: '#0a0d18' }}>
                  {(selectedConv?.display_name ?? selectedConv?.tg_display_name ?? 'X')[0]?.toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[16px]">{selectedConv?.display_name ?? selectedConv?.tg_display_name ?? 'Inconnu'}</span>
                    {selectedSpender && <span className="text-[18px]">{getTier(Number(selectedSpender.total_spent ?? 0)).e}</span>}
                    {selectedSpender?.vip_score && <Chip tone="indigo">VIP {selectedSpender.vip_score}</Chip>}
                  </div>
                  <div className="text-[11.5px] font-[var(--font-mono)]" style={{ color: 'var(--color-muted)' }}>
                    {selectedModel ? `avec ${selectedModel.emoji ?? ''} ${selectedModel.name}` : '—'}
                    {selectedSpender?.total_spent ? ` · Total ${Number(selectedSpender.total_spent).toLocaleString('fr-CH')} CHF` : ''}
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto scrollbar px-8 py-6 space-y-5">
                {(messages ?? []).length === 0 && <div className="text-center text-[12px]" style={{ color: 'var(--color-muted)' }}>Aucun message</div>}
                {(messages ?? []).map((m) => {
                  const outbound = m.direction === 'outbound';
                  return (
                    <div key={m.id} className={`flex ${outbound ? 'justify-end' : ''}`}>
                      <div className="max-w-[68%]">
                        <div className="px-5 py-3.5 text-[15px]" style={{
                          background: outbound ? 'var(--grad-primary)' : 'var(--color-card-2)',
                          color: outbound ? 'white' : 'var(--color-text)',
                          borderRadius: '20px',
                          ...(outbound ? { borderBottomRightRadius: '6px' } : { borderBottomLeftRadius: '6px' }),
                          border: `1px solid ${outbound ? 'rgba(199,210,254,0.25)' : 'var(--color-border)'}`,
                          lineHeight: 1.5,
                        }}>{m.text ?? '[média]'}</div>
                        <div className={`text-[10.5px] font-[var(--font-mono)] mt-1.5 px-2 ${outbound ? 'text-right' : ''}`} style={{ color: 'var(--color-muted)' }}>
                          {m.created_at ? new Date(m.created_at).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' }) : ''}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="px-5 py-4 border-t" style={{ borderColor: 'var(--color-border)', background: 'linear-gradient(180deg,transparent,rgba(129,140,248,0.03))' }}>
                <div className="flex items-end gap-3">
                  <textarea value={msgInput} onChange={(e) => setMsgInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} rows={2} className="flex-1 py-3 text-[14px] bg-[var(--color-card-2)] border border-[var(--color-border)] rounded-[10px] text-[var(--color-text)] px-3 outline-none" placeholder="Message… (Entrée envoi · Shift+Entrée saut)" />
                  <Button variant="primary" className="!px-6 !py-3 !text-[13.5px]" onClick={handleSend} disabled={sendMsg.isPending || !msgInput.trim()}>Envoyer</Button>
                </div>
              </div>
            </>
          )}
        </Card>

        <Card variant="premium" className="overflow-hidden flex flex-col">
          {!selectedSpender ? (
            <div className="flex-1 flex items-center justify-center p-4">
              <div className="text-center">
                <div className="text-[30px] opacity-30">👤</div>
                <div className="text-[11px] mt-2" style={{ color: 'var(--color-muted)' }}>Profil spender</div>
              </div>
            </div>
          ) : (
            <>
              <div className="p-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
                <div className="mono-tag">SPENDER</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[14px] font-semibold">{selectedSpender.display_name ?? selectedSpender.first_name ?? 'Inconnu'}</span>
                  {selectedSpender.vip_score && <Chip tone="indigo">VIP {selectedSpender.vip_score}</Chip>}
                </div>
              </div>
              <div className="p-3 space-y-3 overflow-y-auto scrollbar text-[11.5px]">
                <div>
                  <div className="mono-tag">TOTAL DÉPENSÉ</div>
                  <div className="text-[18px] font-bold font-[var(--font-mono)] metallic-anim">{Number(selectedSpender.total_spent ?? 0).toLocaleString('fr-CH')} CHF</div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="p-1.5 rounded-lg bg-[var(--color-card-2)]"><div className="mono-tag" style={{ fontSize: 9 }}>AOV</div><div className="font-[var(--font-mono)] font-bold">{selectedSpender.avg_basket ? Math.round(Number(selectedSpender.avg_basket)) : '—'}</div></div>
                  <div className="p-1.5 rounded-lg bg-[var(--color-card-2)]"><div className="mono-tag" style={{ fontSize: 9 }}>Tier</div><div>{getTier(Number(selectedSpender.total_spent ?? 0)).e} {getTier(Number(selectedSpender.total_spent ?? 0)).n}</div></div>
                  <div className="p-1.5 rounded-lg bg-[var(--color-card-2)]"><div className="mono-tag" style={{ fontSize: 9 }}>Langue</div><div className="font-[var(--font-mono)] font-bold">{selectedSpender.language ?? selectedSpender.langue ?? '—'}</div></div>
                  <div className="p-1.5 rounded-lg bg-[var(--color-card-2)]"><div className="mono-tag" style={{ fontSize: 9 }}>Pays</div><div className="font-[var(--font-mono)] font-bold">{selectedSpender.country ?? '—'}</div></div>
                </div>
                {selectedSpender.chatter_notes && (
                  <>
                    <div className="h-px bg-[var(--color-border)] my-2" />
                    <div className="mono-tag">NOTES</div>
                    <div className="p-2 rounded-lg text-[10.5px] bg-[var(--color-card-2)] border border-[var(--color-border)]" style={{ color: 'var(--color-text-2)' }}>
                      {selectedSpender.chatter_notes ?? selectedSpender.notes_chatter ?? '—'}
                    </div>
                  </>
                )}
                {selectedSpender.is_scammer && (
                  <Chip tone="danger">🚨 Scammer flagué</Chip>
                )}
              </div>
            </>
          )}
        </Card>
      </div>
    </section>
  );
}
