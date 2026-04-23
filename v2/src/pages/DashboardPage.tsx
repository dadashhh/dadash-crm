import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { KpiCard } from '@/components/ui/KpiCard';
import { PremiumChart } from '@/components/ui/Chart';

type KpiKey = 'ca' | 'tx' | 'spenders' | 'conv' | 'marge';

const PERIODS = ['Auj', '7j', '30j', '90j', 'All', 'Custom'];

const CHART_TITLES: Record<KpiKey, string> = {
  ca: 'CA cumulé — 30 derniers jours',
  tx: 'TX validées — 30 derniers jours',
  spenders: 'Spenders actifs — évolution',
  conv: 'Conversion msg→TX — 30j',
  marge: 'Marge nette — 30j',
};

const LABELS = Array.from({ length: 30 }, (_, i) => `${String(i + 1).padStart(2, '0')}/04`);

function genData(kpi: KpiKey): number[] {
  const r = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
  return Array.from({ length: 30 }, () => {
    if (kpi === 'conv') return +(r(10, 20) + Math.random()).toFixed(1);
    if (kpi === 'marge') return r(300, 900);
    if (kpi === 'spenders') return r(1200, 1500);
    if (kpi === 'tx') return r(10, 30);
    return r(800, 2400);
  });
}

export function DashboardPage() {
  const [selected, setSelected] = useState<KpiKey>('ca');
  const [data, setData] = useState<number[]>(() => genData('ca'));
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');

  const onSelect = (k: KpiKey) => {
    setSelected(k);
    setData(genData(k));
  };

  return (
    <div className="space-y-5">
      {/* HERO DIGEST */}
      <Card variant="hero" className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="mono-tag">JEUDI 23 AVRIL 2026 · 09:42 GMT-3 · BRÉSIL</div>
            <h1 className="text-[26px] font-bold mt-1">
              Bonjour <span className="metallic-anim">DADA</span>. <span className="font-[var(--font-serif)] italic font-normal text-[var(--color-text-2)]">Voici ton matin.</span>
            </h1>
          </div>
          <div className="flex items-center gap-2 bg-[var(--color-card-2)] border border-[var(--color-border)] rounded-[10px] p-0.5">
            {PERIODS.map((p, i) => (
              <button
                key={p}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold ${i === 0 ? 'text-white bg-[var(--grad-primary)] shadow-[0_2px_8px_rgba(99,102,241,0.35)]' : 'text-[var(--color-text-2)] hover:bg-[rgba(129,140,248,0.06)]'}`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <DigestTile icon="🔴" label="TX à valider" value="12" tone="danger" action="Valider" />
          <DigestTile icon="💬" label="Non répondus" value="7" tone="warning" action="Ouvrir" />
          <DigestTile icon="🟢" label="Chatters live" value="8/15" tone="success" action="Live OPS" />
          <DigestTile icon="📸" label="Cames live" value="3/9" tone="indigo" action="Cockpit" metallic />
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-3">
        <KpiCard label="CA cumulé" value="34 547" hint="CHF · mois en cours" trend={{ value: '▲ 12.4%' }} selected={selected === 'ca'} onClick={() => onSelect('ca')} metallic />
        <KpiCard label="TX validées" value="577" hint="AOV 59.87 CHF" trend={{ value: '▲ 8.1%' }} selected={selected === 'tx'} onClick={() => onSelect('tx')} />
        <KpiCard label="Actifs" value="1 421" hint="🐋 52 · 🦈 8 · 🦍 201" trend={{ value: '2 733', tone: 'indigo' }} selected={selected === 'spenders'} onClick={() => onSelect('spenders')} />
        <KpiCard label="Conv msg→TX" value="14.3%" hint="Objectif 18%" trend={{ value: '▼ 1.2%', tone: 'warning' }} selected={selected === 'conv'} onClick={() => onSelect('conv')} />
        <KpiCard label="Marge nette" value="11 842" hint="CHF · +3.2%" trend={{ value: '34.3%' }} selected={selected === 'marge'} onClick={() => onSelect('marge')} metallic />
      </div>

      {/* CHART + INSIGHTS */}
      <div className="grid grid-cols-[1fr_340px] gap-5">
        <Card variant="premium" className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="mono-tag">PERFORMANCE</div>
              <div className="text-[16px] font-semibold mt-0.5">{CHART_TITLES[selected]}</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex gap-0.5 bg-[var(--color-card-2)] border border-[var(--color-border)] rounded-[10px] p-0.5">
                {(['line', 'bar'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setChartType(t)}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold ${chartType === t ? 'text-white bg-[var(--grad-primary)]' : 'text-[var(--color-text-2)] hover:bg-[rgba(129,140,248,0.06)]'}`}
                  >
                    {t === 'line' ? 'Courbe' : 'Barres'}
                  </button>
                ))}
              </div>
              <Button variant="ghost" className="text-[11px]">⤓ Export</Button>
            </div>
          </div>
          <div className="h-[280px]">
            <PremiumChart type={chartType} labels={LABELS} data={data} unit={selected === 'conv' ? '%' : 'CHF'} />
          </div>
        </Card>

        <div className="space-y-4">
          <Card variant="default" className="p-4 border-[var(--color-border-2)] bg-[linear-gradient(135deg,rgba(129,140,248,0.08),rgba(99,102,241,0.02))]">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center font-bold text-[11px] bg-[var(--metallic)] text-[#0a0d18]">J</div>
              <span className="text-[12.5px] font-semibold">JIM · insight du jour</span>
              <Chip tone="indigo" className="text-[9px]!">OPUS 4.6</Chip>
            </div>
            <div className="text-[12.5px] text-[var(--color-text-2)] leading-[1.55]">
              Conv en baisse de 1.2% sur 7j. 3 chatters en dessous du seuil qualité (Marco, Kevin, Luca). Briefing équipe recommandé.
            </div>
          </Card>

          <Card variant="premium" className="p-4">
            <div className="mono-tag mb-2">BREAKDOWN COMMISSIONS · MOIS</div>
            <div className="space-y-3 text-[12px]">
              <ProgressRow label="DADASH · 12%" value="4 145 CHF" pct={12} metallic />
              <ProgressRow label="MC · 25%" value="8 636 CHF" pct={25} />
              <ProgressRow label="Chatters · ~11%" value="3 800 CHF" pct={11} />
              <ProgressRow label="Modèles · reversées" value="5 295 CHF" pct={15.3} />
              <div className="h-px my-2 bg-[var(--color-border)]" />
              <div className="flex justify-between pt-1 text-[13px]">
                <span className="font-semibold">Marge nette</span>
                <span className="font-[var(--font-mono)] font-bold metallic-anim">11 842 CHF</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* TX RÉCENTES */}
      <Card variant="premium" className="p-0">
        <div className="p-5 flex items-center justify-between border-b border-[var(--color-border)]">
          <div>
            <div className="mono-tag">TRANSACTIONS RÉCENTES</div>
            <div className="text-[16px] font-semibold mt-0.5">Dernière heure · 14 TX</div>
          </div>
          <div className="flex items-center gap-2">
            <Chip tone="danger" className="pulse-red">12 EN ATTENTE</Chip>
            <Button variant="primary">+ Nouvelle TX</Button>
          </div>
        </div>
        <TxTable />
      </Card>
    </div>
  );
}

function DigestTile({ icon, label, value, tone, action, metallic }: { icon: string; label: string; value: string; tone: 'danger' | 'warning' | 'success' | 'indigo'; action: string; metallic?: boolean }) {
  const bg: Record<typeof tone, string> = {
    danger: 'bg-[rgba(251,113,133,0.06)] border-[rgba(251,113,133,0.2)]',
    warning: 'bg-[rgba(251,191,36,0.06)] border-[rgba(251,191,36,0.18)]',
    success: 'bg-[rgba(52,211,153,0.06)] border-[rgba(52,211,153,0.2)]',
    indigo: 'bg-[rgba(129,140,248,0.06)] border-[var(--color-border-2)]',
  };
  const text: Record<typeof tone, string> = {
    danger: 'text-[var(--color-danger)]',
    warning: 'text-[var(--color-warning)]',
    success: 'text-[var(--color-success)]',
    indigo: 'text-[var(--color-accent-l)]',
  };
  return (
    <div className={`flex items-center gap-3 p-3 rounded-2xl border ${bg[tone]}`}>
      <div className="text-[22px]">{icon}</div>
      <div className="flex-1">
        <div className="mono-tag">{label}</div>
        <div className={`text-[22px] font-bold font-[var(--font-mono)] ${metallic ? 'metallic-anim' : text[tone]}`}>{value}</div>
      </div>
      <Button variant="ghost" className="text-[11px]! py-1.5!">{action}</Button>
    </div>
  );
}

function ProgressRow({ label, value, pct, metallic }: { label: string; value: string; pct: number; metallic?: boolean }) {
  return (
    <div>
      <div className="flex justify-between">
        <span className="text-[var(--color-muted)]">{label}</span>
        <span className={`font-[var(--font-mono)] font-bold ${metallic ? 'metallic-text' : ''}`}>{value}</span>
      </div>
      <div className="h-1.5 mt-1 rounded bg-[var(--color-card-2)] overflow-hidden">
        <div className="h-full bg-[var(--grad-primary)]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const TX_SAMPLE = Array.from({ length: 14 }, (_, i) => {
  const names = ['Karl M.', 'Hans F.', 'Dimitri V.', 'Paul O.', 'Luca R.', 'Max W.', 'Antoine L.', 'Miguel S.', 'Oleg R.', 'Jamal K.', 'Franz B.', 'Sebastian Z.', 'Pierre G.', 'Tomas K.'];
  const models = ['Sophie', 'Carla', 'Bella', 'Nadia', 'Lea', 'Alice'];
  const chatters = ['Alex', 'Jules', 'Marco', 'Nina', 'Kevin'];
  const providers = ['Stripe', 'PayPal', 'Revolut', 'Wise', 'Binance', 'Twint'];
  const statuses: Array<'validated' | 'pending' | 'refused'> = ['validated', 'validated', 'pending', 'validated', 'pending'];
  return {
    id: 14500 - i,
    time: `23/04 ${String(9 + Math.floor(i / 3)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}`,
    spender: names[i % names.length],
    model: models[i % models.length],
    chatter: chatters[i % chatters.length],
    provider: providers[i % providers.length],
    amount: 50 + Math.floor(Math.random() * 1150),
    currency: Math.random() > 0.6 ? 'EUR' : 'CHF',
    status: statuses[i % statuses.length],
  };
});

function TxTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead className="text-[var(--color-muted)] border-b border-[var(--color-border)] font-[var(--font-mono)] text-[10px] uppercase tracking-wider">
          <tr className="text-left">
            <th className="px-4 py-3 font-semibold">ID</th>
            <th className="font-semibold">Date</th>
            <th className="font-semibold">Spender</th>
            <th className="font-semibold">Modèle</th>
            <th className="font-semibold">Chatter</th>
            <th className="font-semibold">Provider</th>
            <th className="text-right font-semibold">Montant</th>
            <th className="text-center font-semibold">Statut</th>
            <th className="text-right font-semibold pr-4">Actions</th>
          </tr>
        </thead>
        <tbody>
          {TX_SAMPLE.map((t) => (
            <tr key={t.id} className="hover:bg-[rgba(129,140,248,0.03)] border-b border-[rgba(129,140,248,0.06)]">
              <td className="px-4 py-2.5 font-[var(--font-mono)] text-[10px] text-[var(--color-muted)]">#{t.id}</td>
              <td className="font-[var(--font-mono)] text-[11px]">{t.time}</td>
              <td className="text-[var(--color-accent-l)] cursor-pointer">{t.spender}</td>
              <td>✨ {t.model}</td>
              <td>{t.chatter}</td>
              <td className="font-[var(--font-mono)] text-[11px]">{t.provider}</td>
              <td className="text-right font-[var(--font-mono)] font-bold metallic-text">{t.amount} {t.currency}</td>
              <td className="text-center">
                {t.status === 'pending' ? <Chip tone="warning">En attente</Chip> : t.status === 'refused' ? <Chip tone="danger">Refusée</Chip> : <Chip tone="success">Validée</Chip>}
              </td>
              <td className="text-right pr-4">
                {t.status === 'pending' ? (
                  <>
                    <button className="text-[10px] px-2 py-1 rounded bg-[rgba(52,211,153,0.08)] text-[var(--color-success)] border border-[rgba(52,211,153,0.22)] mr-1">✓</button>
                    <button className="text-[10px] px-2 py-1 rounded bg-[rgba(251,113,133,0.08)] text-[var(--color-danger)] border border-[rgba(251,113,133,0.22)]">✗</button>
                  </>
                ) : (
                  <button className="text-[10px] px-2 py-1 rounded bg-[rgba(129,140,248,0.04)] border border-[var(--color-border)] text-[var(--color-text-2)]">Détail</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
