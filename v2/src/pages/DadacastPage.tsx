import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';

const MODELS = ['Carla', 'Sophie', 'Bella', 'Nadia', 'Lea', 'Alice', 'Maria', 'Jade', 'Alix'];

const CAMPAIGNS = [
  { t: 'Reactivation silencieux 30j+', m: 'Carla → audience Sophie', s: 842, ca: 624, conv: '14.2%', st: 'En cours' as const },
  { t: 'Push custom baleines DE', m: 'Bella + Sophie → 🇩🇪 🐋+', s: 42, ca: 2840, conv: '68%', st: 'Terminée' as const },
  { t: 'Pack anniversaire Lea', m: 'Lea → Lea audience', s: 318, ca: 1240, conv: '12%', st: 'Terminée' as const },
  { t: 'Cross-promo Maria → Alix', m: 'Maria → audience Alix', s: 204, ca: 182, conv: '4.1%', st: 'Terminée' as const },
  { t: 'Recap hebdo 🇫🇷', m: 'Toutes → 🇫🇷 🦍+', s: 488, ca: 1420, conv: '9.8%', st: 'Programmée' as const },
  { t: 'Boost custom Jade', m: 'Jade → audience Jade', s: 128, ca: 0, conv: '—', st: 'Programmée' as const },
];

export function DadacastPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <div className="mono-tag">CRM DANS LE CRM · BROADCAST DESK</div>
          <div className="text-[26px] font-bold mt-1">Dadacast</div>
          <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>Segmentation chirurgicale · cross-audience · mixage · envois ciblés</div>
        </div>
        <Button variant="primary">+ Nouvelle campagne</Button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { l: 'CAMPAGNES · MOIS', v: '42', h: '▲ +18%' },
          { l: 'CA GÉNÉRÉ', v: '8 240', h: 'CHF · ROI 6.2x', metallic: true },
          { l: 'CONV MOYENNE', v: '11.8%', h: '▲ +2.1%' },
          { l: 'SPENDERS TOUCHÉS', v: '8 942', h: '3.3x pop totale' },
        ].map((k) => (
          <Card key={k.l} variant="premium" className="p-4">
            <div className="mono-tag">{k.l}</div>
            <div className={`text-[24px] font-bold font-[var(--font-mono)] mt-1 ${k.metallic ? 'metallic-anim' : ''}`}>{k.v}</div>
            <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>{k.h}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card variant="premium" className="p-5">
          <div className="mono-tag">BUILDER D'AUDIENCE</div>
          <div className="text-[16px] font-semibold mt-1 mb-4">🎯 Segmentation chirurgicale</div>
          <div className="space-y-4">
            <div>
              <div className="mono-tag mb-2">MODÈLES SOURCES (MULTI)</div>
              <div className="flex flex-wrap gap-1.5">
                {MODELS.slice(0, 2).map((m) => <Chip key={m} tone="indigo">✓ {m}</Chip>)}
                {MODELS.slice(2).map((m) => <Chip key={m} tone="muted">{m}</Chip>)}
              </div>
            </div>
            <div>
              <div className="mono-tag mb-2">CROSS-AUDIENCE CIBLE</div>
              <select className="w-full px-3 py-2 text-[13px] bg-[var(--color-card-2)] border border-[var(--color-border)] rounded-[10px] text-[var(--color-text)]">
                <option>Audience Bella (cross-promo)</option>
                <option>Audience Sophie</option>
                <option>Fusion Carla + Bella</option>
                <option>Nouvelle audience (vide)</option>
              </select>
            </div>
            <div>
              <div className="mono-tag mb-2">SEGMENTS</div>
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                {[
                  { l: 'Silencieux 30j+', c: true }, { l: 'Répondeurs actifs', c: true },
                  { l: 'Tier 🦍+', c: false }, { l: 'Langue 🇩🇪', c: false },
                  { l: 'AOV > 200', c: false }, { l: 'TX < 7j', c: false },
                ].map((s) => (
                  <label key={s.l} className="flex items-center gap-2 p-2.5 rounded-lg cursor-pointer"
                         style={{ background: 'var(--color-card-2)', border: `1px solid ${s.c ? 'var(--color-border-2)' : 'var(--color-border)'}` }}>
                    <input type="checkbox" defaultChecked={s.c} /> {s.l}
                  </label>
                ))}
              </div>
            </div>
            <Card className="p-3 relative overflow-hidden" style={{ background: 'linear-gradient(135deg,rgba(129,140,248,0.08),rgba(99,102,241,0.02))', borderColor: 'var(--color-border-2)' }}>
              <div className="absolute top-0 left-0 w-[3px] h-full" style={{ background: 'var(--metallic)' }} />
              <div className="flex items-center justify-between">
                <div>
                  <div className="mono-tag">RÉSULTAT ESTIMÉ</div>
                  <div className="text-[26px] font-bold font-[var(--font-mono)] metallic-anim">1 284</div>
                  <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>spenders ciblés · conv 12% attendue</div>
                </div>
                <div className="text-right">
                  <div className="mono-tag">CA ESTIMÉ</div>
                  <div className="text-[20px] font-bold font-[var(--font-mono)]">~820 CHF</div>
                  <div className="text-[11px]" style={{ color: 'var(--color-success)' }}>ROI 8.4x</div>
                </div>
              </div>
            </Card>
            <Button variant="primary" className="w-full">▶ Lancer la campagne</Button>
          </div>
        </Card>

        <Card variant="premium" className="p-5">
          <div className="mono-tag">PORTFOLIO</div>
          <div className="text-[16px] font-semibold mt-1 mb-4">📡 Campagnes récentes</div>
          <div className="space-y-2">
            {CAMPAIGNS.map((c, i) => (
              <div key={i} className="p-3 rounded-xl cursor-pointer"
                   style={{
                     background: 'var(--color-card-2)',
                     border: '1px solid var(--color-border)',
                     borderLeft: `2px solid ${c.st === 'En cours' ? 'var(--color-warning)' : c.st === 'Terminée' ? 'var(--color-success)' : 'var(--color-accent)'}`,
                   }}>
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold truncate">{c.t}</div>
                    <div className="text-[11px] mt-0.5 font-[var(--font-mono)]" style={{ color: 'var(--color-muted)' }}>{c.m}</div>
                  </div>
                  <Chip tone={c.st === 'En cours' ? 'warning' : c.st === 'Terminée' ? 'success' : 'indigo'}>{c.st}</Chip>
                </div>
                <div className="flex items-center gap-4 mt-2 text-[11px] font-[var(--font-mono)]">
                  <span style={{ color: 'var(--color-muted)' }}>👥 {c.s}</span>
                  <span className="metallic-text font-bold">{c.ca} CHF</span>
                  <span style={{ color: 'var(--color-success)' }}>{c.conv}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
