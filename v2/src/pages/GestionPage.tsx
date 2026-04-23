import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';

const ENTRIES = [
  { d: '23/04', t: 'Réception', lib: 'TX Stripe validées', amt: '+2 840', cur: 'CHF' },
  { d: '22/04', t: 'Salaire', lib: 'Paie chatters P2 avril', amt: '-3 890', cur: 'CHF' },
  { d: '22/04', t: 'Marketing', lib: 'Boost Twitter 7j', amt: '-280', cur: 'CHF' },
  { d: '21/04', t: 'Autre', lib: 'Abo Vercel Pro', amt: '-42', cur: 'CHF' },
  { d: '20/04', t: 'Réception', lib: 'TX PayPal', amt: '+1 420', cur: 'EUR' },
  { d: '19/04', t: 'Marketing', lib: 'Pub Reddit', amt: '-180', cur: 'CHF' },
  { d: '18/04', t: 'Salaire', lib: 'Paie MC Alex P1', amt: '-1 240', cur: 'CHF' },
  { d: '17/04', t: 'Autre', lib: 'Railway hosting', amt: '-28', cur: 'CHF' },
];

const CHATTERS = ['Alex', 'Jules', 'Marco', 'Yann', 'Nina', 'Kevin', 'Luca', 'Sam'];
const FACS = [
  { n: '2026-042', d: '22/04/2026', dest: 'Karl M.', lib: 'Programme accompagnement digital', amt: '520' },
  { n: '2026-041', d: '21/04/2026', dest: 'Hans F.', lib: 'Programme accompagnement digital', amt: '300' },
  { n: '2026-040', d: '20/04/2026', dest: 'Paul O.', lib: 'Services numériques', amt: '180' },
  { n: '2026-039', d: '18/04/2026', dest: 'Dimitri V.', lib: 'Programme accompagnement digital', amt: '1 200' },
  { n: '2026-038', d: '15/04/2026', dest: 'Luca R.', lib: 'Abonnement VIP mensuel', amt: '120' },
];

type Tab = 'compta' | 'paies' | 'factures' | 'legal';

export function GestionPage() {
  const [tab, setTab] = useState<Tab>('compta');
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <div className="mono-tag">FINANCE OPERATIONS</div>
          <div className="text-[26px] font-bold mt-1">Gestion agence</div>
          <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>Compta 2-clics · paies auto tous les 10j · factures PDF neutres · légal</div>
        </div>
        <div className="inline-flex gap-0.5 bg-[var(--color-card-2)] border border-[var(--color-border)] rounded-[10px] p-0.5">
          {(['compta', 'paies', 'factures', 'legal'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold ${tab === t ? 'text-white shadow-[0_2px_8px_rgba(99,102,241,0.35)]' : 'text-[var(--color-text-2)]'}`}
                    style={tab === t ? { background: 'var(--grad-primary)' } : undefined}>
              {t === 'compta' ? 'Compta' : t === 'paies' ? 'Paies' : t === 'factures' ? 'Factures' : 'Légal'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'compta' && (
        <>
          <div className="grid grid-cols-4 gap-3">
            {[
              { ico: '📢', l: 'Dépense marketing' }, { ico: '💰', l: 'Salaire payé' },
              { ico: '📥', l: 'Réception' }, { ico: '📦', l: 'Autre' },
            ].map((a) => (
              <Card key={a.l} variant="premium" className="p-4 cursor-pointer hover:-translate-y-0.5 transition-transform">
                <div className="text-[32px]">{a.ico}</div>
                <div className="text-[14px] font-semibold mt-2">{a.l}</div>
                <div className="mono-tag mt-1">2 clics</div>
              </Card>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Card variant="premium" className="p-4"><div className="mono-tag">CA MOIS</div><div className="text-[24px] font-bold font-[var(--font-mono)] mt-1 metallic-anim">34 547</div><div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>CHF</div></Card>
            <Card variant="premium" className="p-4"><div className="mono-tag">DÉPENSES</div><div className="text-[24px] font-bold font-[var(--font-mono)] mt-1" style={{ color: 'var(--color-danger)' }}>-22 705</div><div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>CHF</div></Card>
            <Card variant="premium" className="p-4"><div className="mono-tag">MARGE NETTE</div><div className="text-[24px] font-bold font-[var(--font-mono)] mt-1" style={{ color: 'var(--color-success)' }}>+11 842</div><div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>34.3%</div></Card>
          </div>
          <Card variant="premium" className="overflow-hidden p-0">
            <div className="p-5 flex items-center justify-between border-b" style={{ borderColor: 'var(--color-border)' }}>
              <div className="text-[15px] font-semibold">Écritures récentes</div>
              <Button variant="ghost" className="!text-[11px]">⤓ Export XLSX</Button>
            </div>
            <table className="w-full">
              <thead>
                <tr className="text-left">
                  {['Date', 'Type', 'Libellé', 'Montant', 'Devise', 'Statut'].map((h) => (
                    <th key={h} className={`font-[var(--font-mono)] text-[10px] uppercase tracking-wider font-semibold px-4 py-3 border-b border-[var(--color-border)] text-[var(--color-muted)] ${h === 'Montant' ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ENTRIES.map((e, i) => (
                  <tr key={i} className="hover:bg-[rgba(129,140,248,0.03)] border-b" style={{ borderColor: 'rgba(129,140,248,0.06)' }}>
                    <td className="px-4 py-[11px] font-[var(--font-mono)] text-[13px]">{e.d}</td>
                    <td className="px-4 py-[11px] text-[13px]"><Chip tone={e.t === 'Réception' ? 'success' : e.t === 'Salaire' ? 'indigo' : 'muted'}>{e.t}</Chip></td>
                    <td className="px-4 py-[11px] text-[13px]">{e.lib}</td>
                    <td className="px-4 py-[11px] text-right font-[var(--font-mono)] font-bold text-[13px]" style={{ color: e.amt.startsWith('+') ? 'var(--color-success)' : 'var(--color-danger)' }}>{e.amt}</td>
                    <td className="px-4 py-[11px] font-[var(--font-mono)] text-[13px]">{e.cur}</td>
                    <td className="px-4 py-[11px]"><Chip tone="success">✓</Chip></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {tab === 'paies' && (
        <>
          <Card variant="premium" className="p-5">
            <div className="mono-tag">PAYROLL SCHEDULE</div>
            <div className="text-[16px] font-semibold mt-1 mb-3">📅 Calendrier paies · tous les 10 jours</div>
            <div className="grid grid-cols-3 gap-4">
              {[
                { l: 'P1 · J1-J10', d: 'Paie le 11', amt: '4 284 CHF', st: '✓ 2026-04-11', tone: 'success' as const },
                { l: 'P2 · J11-J20', d: 'Paie le 21', amt: '3 890 CHF', st: '✓ 2026-04-21', tone: 'success' as const },
                { l: 'P3 · J21-J30', d: 'Paie le 1er mai', amt: '2 148 CHF', st: '⏳ 8j restants', tone: 'warning' as const, highlight: true },
              ].map((p) => (
                <div key={p.l} className="p-4 rounded-2xl"
                     style={{
                       background: p.highlight ? 'linear-gradient(135deg,rgba(129,140,248,0.08),transparent)' : 'var(--color-card-2)',
                       border: `1px solid ${p.highlight ? 'var(--color-border-2)' : 'var(--color-border)'}`,
                     }}>
                  <div className="mono-tag" style={p.highlight ? { color: 'var(--color-accent-l)' } : undefined}>{p.l}</div>
                  <div className="text-[16px] font-bold mt-1">{p.d}</div>
                  <div className={`text-[22px] font-bold font-[var(--font-mono)] mt-2 ${p.highlight ? 'metallic-anim' : 'metallic-text'}`}>{p.amt}</div>
                  <Chip tone={p.tone} className="mt-2 inline-block">{p.st}</Chip>
                </div>
              ))}
            </div>
          </Card>
          <Card variant="premium" className="overflow-hidden p-0">
            <div className="p-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <div className="text-[14px] font-semibold">Détail · période en cours</div>
            </div>
            <table className="w-full">
              <thead>
                <tr className="text-left">
                  {['Chatter', 'MC', 'CA', 'Commission', 'Tier', 'Statut'].map((h) => (
                    <th key={h} className="font-[var(--font-mono)] text-[10px] uppercase tracking-wider font-semibold px-4 py-3 border-b border-[var(--color-border)] text-[var(--color-muted)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CHATTERS.map((c, i) => {
                  const ca = 1400 + i * 450;
                  const rate = [0.08, 0.12, 0.20][i % 3];
                  return (
                    <tr key={c} className="hover:bg-[rgba(129,140,248,0.03)] border-b" style={{ borderColor: 'rgba(129,140,248,0.06)' }}>
                      <td className="px-4 py-[11px] text-[13px]">{c}</td>
                      <td className="px-4 py-[11px] text-[11px]">Alex (MC)</td>
                      <td className="px-4 py-[11px] text-right font-[var(--font-mono)] text-[13px]">{ca}</td>
                      <td className="px-4 py-[11px] text-right font-[var(--font-mono)] font-bold metallic-text text-[13px]">{Math.round(ca * rate)}</td>
                      <td className="px-4 py-[11px] text-right"><Chip tone="indigo">T{(i % 3) + 1} {Math.round(rate * 100)}%</Chip></td>
                      <td className="px-4 py-[11px]"><Chip tone="warning">En cours</Chip></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {tab === 'factures' && (
        <Card variant="premium" className="overflow-hidden p-0">
          <div className="p-5 flex items-center justify-between border-b" style={{ borderColor: 'var(--color-border)' }}>
            <div>
              <div className="text-[15px] font-semibold">Factures PDF auto</div>
              <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>Compliance Suisse · libellés neutres · "Programme accompagnement digital"</div>
            </div>
            <Button variant="primary">+ Générer facture</Button>
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-left">
                {['N°', 'Émise', 'Destinataire', 'Libellé', 'Montant', 'Statut', ''].map((h) => (
                  <th key={h} className={`font-[var(--font-mono)] text-[10px] uppercase tracking-wider font-semibold px-4 py-3 border-b border-[var(--color-border)] text-[var(--color-muted)] ${h === 'Montant' ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FACS.map((f) => (
                <tr key={f.n} className="hover:bg-[rgba(129,140,248,0.03)] border-b" style={{ borderColor: 'rgba(129,140,248,0.06)' }}>
                  <td className="px-4 py-[11px] font-[var(--font-mono)] text-[13px]">#{f.n}</td>
                  <td className="px-4 py-[11px] font-[var(--font-mono)] text-[11px]">{f.d}</td>
                  <td className="px-4 py-[11px] font-semibold text-[13px]">{f.dest}</td>
                  <td className="px-4 py-[11px] text-[11px]" style={{ color: 'var(--color-muted)' }}>{f.lib}</td>
                  <td className="px-4 py-[11px] text-right font-[var(--font-mono)] font-bold metallic-text text-[13px]">{f.amt} CHF</td>
                  <td className="px-4 py-[11px]"><Chip tone="success">Payée</Chip></td>
                  <td className="px-4 py-[11px]"><Button variant="ghost" className="!py-1 !text-[10.5px]">⤓ PDF</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === 'legal' && (
        <div className="grid grid-cols-2 gap-4">
          <Card variant="premium" className="p-5">
            <div className="mono-tag">DOCUMENTS AGENCE</div>
            <div className="text-[15px] font-semibold mt-1 mb-3">📜 Corpus juridique</div>
            <div className="space-y-2 text-[12.5px]">
              {[
                { l: 'Avenant chatter · screen mirror consentement', tone: 'warning' as const, st: 'Draft' },
                { l: 'Contrat type modèle', tone: 'success' as const, st: 'Signé' },
                { l: 'RGPD Suisse · rétention', tone: 'success' as const, st: 'Validé' },
                { l: 'CGU SaaS multi-tenant', tone: 'muted' as const, st: 'À faire' },
              ].map((d) => (
                <div key={d.l} className="p-3 rounded-xl flex items-center justify-between" style={{ background: 'var(--color-card-2)' }}>
                  <span>{d.l}</span>
                  <Chip tone={d.tone}>{d.st}</Chip>
                </div>
              ))}
            </div>
          </Card>
          <Card variant="premium" className="p-5">
            <div className="mono-tag">COMPLIANCE SUISSE</div>
            <div className="text-[15px] font-semibold mt-1 mb-3">🇨🇭 Conformité</div>
            <div className="space-y-2 text-[12.5px]">
              {[
                ['TVA enregistrement', 'success', '✓'],
                ['Registre du commerce', 'success', '✓'],
                ['Libellés factures neutres', 'success', '✓'],
                ['FX CHF/EUR sync live', 'success', '✓'],
                ['RGPD consent spender', 'warning', 'partiel'],
              ].map(([l, tone, st]) => (
                <div key={l} className="flex items-center justify-between p-2">
                  <span>{l}</span>
                  <Chip tone={tone as 'success' | 'warning'}>{st}</Chip>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
