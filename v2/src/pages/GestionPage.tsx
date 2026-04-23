import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { useTransactions, useTransactionStats, useChatters, useProviders, useModels } from '@/hooks/useDadashData';

type Tab = 'compta' | 'paies' | 'factures' | 'legal';

export function GestionPage() {
  const [tab, setTab] = useState<Tab>('compta');
  const { data: txs } = useTransactions({ limit: 500, days: 30 });
  const { data: stats } = useTransactionStats();
  const { data: chatters } = useChatters();
  const { data: providers } = useProviders();
  const { data: models } = useModels();
  const chatterById = Object.fromEntries((chatters ?? []).map(c => [c.id, c]));
  const providerById = Object.fromEntries((providers ?? []).map(p => [p.id, p]));
  const modelById = Object.fromEntries((models ?? []).map(m => [m.id, m]));

  const comptaSummary = useMemo(() => {
    const validated = (txs ?? []).filter(t => t.status === 'validated');
    const ca = validated.reduce((a, t) => a + Number(t.amount_chf ?? t.amount ?? 0), 0);
    const fees = validated.reduce((a, t) => a + Number(t.provider_fee ?? 0), 0);
    const commissions = validated.reduce((a, t) => a + Number(t.chatter_commission ?? 0), 0);
    const net = validated.reduce((a, t) => a + Number(t.net_amount_chf ?? t.net_amount ?? 0), 0);
    return { ca, fees, commissions, net, validated: validated.length };
  }, [txs]);

  const paiesByChatter = useMemo(() => {
    const map: Record<string, { name: string; ca: number; commission: number; tx: number; rate: number }> = {};
    (txs ?? []).filter(t => t.status === 'validated').forEach(t => {
      if (!t.chatter_id) return;
      const ch = chatterById[t.chatter_id];
      if (!ch) return;
      if (!map[t.chatter_id]) {
        map[t.chatter_id] = { name: ch.full_name ?? ch.email ?? '—', ca: 0, commission: 0, tx: 0, rate: ch.commission_rate ?? 10 };
      }
      map[t.chatter_id].ca += Number(t.amount_chf ?? t.amount ?? 0);
      map[t.chatter_id].commission += Number(t.chatter_commission ?? 0);
      map[t.chatter_id].tx += 1;
    });
    return map;
  }, [txs, chatterById]);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <div className="mono-tag">FINANCE OPERATIONS · LIVE DB</div>
          <div className="text-[26px] font-bold mt-1">Gestion agence</div>
          <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
            Compta · paies · factures · légal · data 30 derniers jours
          </div>
        </div>
        <div className="inline-flex gap-0.5 bg-[var(--color-card-2)] border border-[var(--color-border)] rounded-[10px] p-0.5">
          {(['compta', 'paies', 'factures', 'legal'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold" style={tab === t ? { background: 'var(--grad-primary)', color: 'white', boxShadow: '0 2px 8px rgba(99,102,241,0.35)' } : { color: 'var(--color-text-2)' }}>
              {t === 'compta' ? 'Compta' : t === 'paies' ? 'Paies' : t === 'factures' ? 'Factures' : 'Légal'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'compta' && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <Card variant="premium" className="p-4"><div className="mono-tag">CA 30J</div><div className="text-[24px] font-bold font-[var(--font-mono)] mt-1 metallic-anim">{Math.round(comptaSummary.ca).toLocaleString('fr-CH')}</div><div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>CHF · {comptaSummary.validated} TX</div></Card>
            <Card variant="premium" className="p-4"><div className="mono-tag">FEES PROVIDERS</div><div className="text-[24px] font-bold font-[var(--font-mono)] mt-1" style={{ color: 'var(--color-danger)' }}>-{Math.round(comptaSummary.fees).toLocaleString('fr-CH')}</div><div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>CHF</div></Card>
            <Card variant="premium" className="p-4"><div className="mono-tag">COMMISSIONS CHATTERS</div><div className="text-[24px] font-bold font-[var(--font-mono)] mt-1" style={{ color: 'var(--color-warning)' }}>-{Math.round(comptaSummary.commissions).toLocaleString('fr-CH')}</div><div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>CHF</div></Card>
            <Card variant="premium" className="p-4"><div className="mono-tag">NET AGENCE</div><div className="text-[24px] font-bold font-[var(--font-mono)] mt-1" style={{ color: 'var(--color-success)' }}>{Math.round(comptaSummary.net).toLocaleString('fr-CH')}</div><div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>CHF · {comptaSummary.ca > 0 ? Math.round((comptaSummary.net / comptaSummary.ca) * 100) : 0}% marge</div></Card>
          </div>

          <Card variant="premium" className="overflow-hidden p-0">
            <div className="p-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <div className="text-[15px] font-semibold">Flux TX · 30 derniers jours</div>
            </div>
            <div className="overflow-x-auto" style={{ maxHeight: 480 }}>
              <table className="w-full">
                <thead className="sticky top-0 z-10" style={{ background: 'var(--color-card)' }}>
                  <tr className="text-left">
                    {['Date', 'Spender', 'Modèle', 'Chatter', 'Provider', 'Montant', 'Fees', 'Commission', 'Net', 'Statut'].map((h) => (
                      <th key={h} className={`font-[var(--font-mono)] text-[10px] uppercase tracking-wider font-semibold px-4 py-3 border-b border-[var(--color-border)] text-[var(--color-muted)] ${['Montant', 'Fees', 'Commission', 'Net'].includes(h) ? 'text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(txs ?? []).map((t) => {
                    const m = t.model_id ? modelById[t.model_id] : null;
                    const c = t.chatter_id ? chatterById[t.chatter_id] : null;
                    const p = t.provider_id ? providerById[t.provider_id] : null;
                    const amt = Number(t.amount_chf ?? t.amount ?? 0);
                    return (
                      <tr key={t.id} className="hover:bg-[rgba(129,140,248,0.03)] border-b" style={{ borderColor: 'rgba(129,140,248,0.06)' }}>
                        <td className="px-4 py-[11px] font-[var(--font-mono)] text-[11px]">{t.date ? new Date(t.date).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit' }) : '—'}</td>
                        <td className="px-4 py-[11px] text-[13px]" style={{ color: 'var(--color-accent-l)' }}>{t.spender_handle ?? '—'}</td>
                        <td className="px-4 py-[11px] text-[13px]">{m ? `${m.emoji ?? ''} ${m.name}` : '—'}</td>
                        <td className="px-4 py-[11px] text-[13px]">{c?.full_name ?? '—'}</td>
                        <td className="px-4 py-[11px] font-[var(--font-mono)] text-[11px]">{p?.name ?? '—'}</td>
                        <td className="px-4 py-[11px] text-right font-[var(--font-mono)] font-bold metallic-text text-[13px]">{amt.toLocaleString('fr-CH')}</td>
                        <td className="px-4 py-[11px] text-right font-[var(--font-mono)] text-[11px]" style={{ color: 'var(--color-danger)' }}>{t.provider_fee ? `-${Number(t.provider_fee).toFixed(2)}` : '—'}</td>
                        <td className="px-4 py-[11px] text-right font-[var(--font-mono)] text-[11px]" style={{ color: 'var(--color-warning)' }}>{t.chatter_commission ? `-${Number(t.chatter_commission).toFixed(2)}` : '—'}</td>
                        <td className="px-4 py-[11px] text-right font-[var(--font-mono)] font-bold text-[11px]" style={{ color: 'var(--color-success)' }}>{t.net_amount_chf ? Number(t.net_amount_chf).toFixed(2) : '—'}</td>
                        <td className="px-4 py-[11px]">
                          <Chip tone={t.status === 'validated' ? 'success' : t.status === 'pending' ? 'warning' : 'danger'}>{t.status ?? '—'}</Chip>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {tab === 'paies' && (
        <>
          <Card variant="premium" className="p-5">
            <div className="mono-tag">PAIES CHATTERS · 30 DERNIERS JOURS</div>
            <div className="text-[16px] font-semibold mt-1 mb-3">💰 Commissions calculées depuis TX validées</div>
            <table className="w-full">
              <thead>
                <tr className="text-left">
                  {['Chatter', 'TX validées', 'CA généré', 'Taux', 'Commission à verser'].map((h) => (
                    <th key={h} className={`font-[var(--font-mono)] text-[10px] uppercase tracking-wider font-semibold px-4 py-3 border-b border-[var(--color-border)] text-[var(--color-muted)] ${['CA généré', 'Commission à verser'].includes(h) ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(paiesByChatter).map(([cid, p]) => (
                  <tr key={cid} className="hover:bg-[rgba(129,140,248,0.03)] border-b" style={{ borderColor: 'rgba(129,140,248,0.06)' }}>
                    <td className="px-4 py-[11px] text-[13px] font-semibold">{p.name}</td>
                    <td className="px-4 py-[11px] text-[13px]">{p.tx}</td>
                    <td className="px-4 py-[11px] text-right font-[var(--font-mono)] font-bold metallic-text text-[13px]">{Math.round(p.ca).toLocaleString('fr-CH')} CHF</td>
                    <td className="px-4 py-[11px] text-right"><Chip tone="indigo">{p.rate}%</Chip></td>
                    <td className="px-4 py-[11px] text-right font-[var(--font-mono)] font-bold text-[14px]" style={{ color: 'var(--color-success)' }}>{Math.round(p.commission).toLocaleString('fr-CH')} CHF</td>
                  </tr>
                ))}
                {Object.keys(paiesByChatter).length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-[12px]" style={{ color: 'var(--color-muted)' }}>Aucune TX validée avec commission chatter sur 30j</td></tr>
                )}
              </tbody>
            </table>
            <div className="mt-4 p-3 rounded-xl flex items-center justify-between" style={{ background: 'linear-gradient(135deg,rgba(129,140,248,0.08),transparent)', border: '1px solid var(--color-border-2)' }}>
              <span className="text-[13px] font-semibold">Total à verser</span>
              <span className="text-[22px] font-bold font-[var(--font-mono)] metallic-anim">
                {Math.round(Object.values(paiesByChatter).reduce((a, p) => a + p.commission, 0)).toLocaleString('fr-CH')} CHF
              </span>
            </div>
          </Card>
        </>
      )}

      {tab === 'factures' && (
        <Card variant="premium" className="overflow-hidden p-0">
          <div className="p-5 flex items-center justify-between border-b" style={{ borderColor: 'var(--color-border)' }}>
            <div>
              <div className="text-[15px] font-semibold">Factures TX validées</div>
              <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>Auto-générées depuis les TX · libellés neutres</div>
            </div>
            <Button variant="primary">+ Générer facture</Button>
          </div>
          <div className="overflow-x-auto" style={{ maxHeight: 480 }}>
            <table className="w-full">
              <thead className="sticky top-0 z-10" style={{ background: 'var(--color-card)' }}>
                <tr className="text-left">
                  {['N°', 'Date', 'Spender', 'Libellé', 'Montant', 'Statut', 'PDF'].map((h) => (
                    <th key={h} className={`font-[var(--font-mono)] text-[10px] uppercase tracking-wider font-semibold px-4 py-3 border-b border-[var(--color-border)] text-[var(--color-muted)] ${h === 'Montant' ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(txs ?? []).filter(t => t.status === 'validated').slice(0, 50).map((t, i) => (
                  <tr key={t.id} className="hover:bg-[rgba(129,140,248,0.03)] border-b" style={{ borderColor: 'rgba(129,140,248,0.06)' }}>
                    <td className="px-4 py-[11px] font-[var(--font-mono)] text-[11px]">#F-{String(i + 1).padStart(5, '0')}</td>
                    <td className="px-4 py-[11px] font-[var(--font-mono)] text-[11px]">{t.date ? new Date(t.date).toLocaleDateString('fr-CH') : '—'}</td>
                    <td className="px-4 py-[11px] font-semibold text-[13px]">{t.spender_handle ?? '—'}</td>
                    <td className="px-4 py-[11px] text-[11px]" style={{ color: 'var(--color-muted)' }}>Programme accompagnement digital</td>
                    <td className="px-4 py-[11px] text-right font-[var(--font-mono)] font-bold metallic-text text-[13px]">{Number(t.amount_chf ?? t.amount ?? 0).toLocaleString('fr-CH')} CHF</td>
                    <td className="px-4 py-[11px]"><Chip tone="success">Payée</Chip></td>
                    <td className="px-4 py-[11px]">{t.invoice_url ? <Button variant="ghost" className="!py-1 !text-[10.5px]" onClick={() => window.open(t.invoice_url!, '_blank')}>⤓ PDF</Button> : <Chip tone="muted">—</Chip>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'legal' && (
        <div className="grid grid-cols-2 gap-4">
          <Card variant="premium" className="p-5">
            <div className="mono-tag">DOCUMENTS AGENCE</div>
            <div className="text-[15px] font-semibold mt-1 mb-3">📜 Corpus juridique</div>
            <div className="space-y-2 text-[12.5px]">
              <div className="p-3 rounded-xl flex items-center justify-between" style={{ background: 'var(--color-card-2)' }}><span>Avenant chatter · screen mirror consentement</span><Chip tone="warning">Draft</Chip></div>
              <div className="p-3 rounded-xl flex items-center justify-between" style={{ background: 'var(--color-card-2)' }}><span>Contrat type modèle</span><Chip tone="success">Signé</Chip></div>
              <div className="p-3 rounded-xl flex items-center justify-between" style={{ background: 'var(--color-card-2)' }}><span>RGPD Suisse · rétention</span><Chip tone="success">Validé</Chip></div>
              <div className="p-3 rounded-xl flex items-center justify-between" style={{ background: 'var(--color-card-2)' }}><span>CGU SaaS multi-tenant</span><Chip tone="muted">À faire</Chip></div>
            </div>
          </Card>
          <Card variant="premium" className="p-5">
            <div className="mono-tag">COMPLIANCE SUISSE</div>
            <div className="text-[15px] font-semibold mt-1 mb-3">🇨🇭 Conformité</div>
            <div className="space-y-2 text-[12.5px]">
              <div className="flex items-center justify-between p-2"><span>TVA enregistrement</span><Chip tone="success">✓</Chip></div>
              <div className="flex items-center justify-between p-2"><span>Registre du commerce</span><Chip tone="success">✓</Chip></div>
              <div className="flex items-center justify-between p-2"><span>Libellés factures neutres</span><Chip tone="success">✓</Chip></div>
              <div className="flex items-center justify-between p-2"><span>RLS Supabase</span><Chip tone="success">128/128</Chip></div>
              <div className="flex items-center justify-between p-2"><span>pgcrypto tokens</span><Chip tone="success">AES-256</Chip></div>
            </div>
          </Card>
        </div>
      )}

      <div className="text-[10px] text-right" style={{ color: 'var(--color-muted)' }}>
        Total TX DB: {stats?.total ?? 0} · validées: {stats?.validated ?? 0} · pending: {stats?.pending ?? 0} · CA global: {stats ? Math.round(stats.caBrut).toLocaleString('fr-CH') : 0} CHF
      </div>
    </div>
  );
}
