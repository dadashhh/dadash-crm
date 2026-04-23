import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';

const MODELS = ['Carla', 'Sophie', 'Bella', 'Nadia', 'Lea', 'Alice', 'Maria', 'Jade', 'Alix'];
const FLAGS = ['🇫🇷', '🇩🇪', '🇬🇧', '🇮🇹'];
const CHATTERS = ['Alex', 'Jules', 'Marco', 'Nina', 'Kevin'];

export function ModelesPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <div className="mono-tag">TALENT ROSTER</div>
          <div className="text-[26px] font-bold mt-1">Modèles · 9 actives</div>
        </div>
        <Button variant="primary">+ Ajouter modèle</Button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {MODELS.map((m, i) => (
          <Card key={m} variant="premium" className="p-5">
            <div className="flex items-start gap-3">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-[20px]" style={{ background: 'var(--metallic)', color: '#0a0d18', boxShadow: '0 4px 14px rgba(99,102,241,0.35)' }}>{m[0]}</div>
              <div className="flex-1">
                <div className="text-[17px] font-bold">{m}</div>
                <div className="text-[11px] font-[var(--font-mono)]" style={{ color: 'var(--color-muted)' }}>{FLAGS[i % 4]} · {220 + i * 25} spenders</div>
              </div>
              <Chip tone="success">LIVE</Chip>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4 text-[11px]">
              <div className="p-2 rounded-lg bg-[var(--color-card-2)]"><div className="mono-tag">CA mois</div><div className="font-[var(--font-mono)] font-bold metallic-text text-[13px]">{2200 + i * 450} CHF</div></div>
              <div className="p-2 rounded-lg bg-[var(--color-card-2)]"><div className="mono-tag">TX</div><div className="font-[var(--font-mono)] font-bold text-[13px]">{40 + i * 8}</div></div>
              <div className="p-2 rounded-lg bg-[var(--color-card-2)]"><div className="mono-tag">Top chatter</div><div className="font-semibold">{CHATTERS[i % 5]}</div></div>
              <div className="p-2 rounded-lg bg-[var(--color-card-2)]"><div className="mono-tag">AOV</div><div className="font-[var(--font-mono)]">{40 + i * 18}</div></div>
            </div>
            <div className="flex items-center gap-2 mt-4 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <Button variant="ghost" className="!text-[11px] flex-1">📋 Consignes</Button>
              <Button variant="ghost" className="!text-[11px] flex-1">💰 Paie</Button>
              <Button variant="ghost" className="!text-[11px] flex-1">📸 Cam</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
