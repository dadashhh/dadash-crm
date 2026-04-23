import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { useModels } from '@/hooks/useDadashData';

export function ModelesPage() {
  const { data: models, isLoading } = useModels();

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <div className="mono-tag">TALENT ROSTER · LIVE DB</div>
          <div className="text-[26px] font-bold mt-1">Modèles · {models?.length ?? 0} actives</div>
        </div>
        <Button variant="primary">+ Ajouter modèle</Button>
      </div>
      {isLoading && <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>Chargement…</div>}
      <div className="grid grid-cols-3 gap-4">
        {(models ?? []).map((m) => {
          const color = m.color ?? '#818cf8';
          return (
            <Card key={m.id} variant="premium" className="p-5">
              <div className="flex items-start gap-3">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-[20px]" style={{ background: m.color ? `linear-gradient(135deg, ${color}, ${color}dd)` : 'var(--metallic)', color: '#0a0d18', boxShadow: `0 4px 14px ${color}55` }}>{m.emoji ?? m.name[0]}</div>
                <div className="flex-1">
                  <div className="text-[17px] font-bold">{m.name}</div>
                  <div className="text-[11px] font-[var(--font-mono)]" style={{ color: 'var(--color-muted)' }}>
                    {m.platform?.toUpperCase() ?? '—'}{m.age ? ` · ${m.age}a` : ''}{m.nationality ? ` · ${m.nationality.split(' ')[0]}` : ''}
                  </div>
                </div>
                <Chip tone={m.account_status === 'hot' ? 'success' : m.account_status === 'cold' ? 'muted' : 'indigo'}>
                  {m.account_status ?? 'active'}
                </Chip>
              </div>
              {m.bio && <div className="text-[11.5px] mt-3" style={{ color: 'var(--color-text-2)', lineHeight: 1.4 }}>{m.bio.slice(0, 140)}{m.bio.length > 140 ? '…' : ''}</div>}
              {m.languages && Array.isArray(m.languages) && m.languages.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {(m.languages as string[]).slice(0, 3).map((lang) => (
                    <Chip key={lang} tone="muted">{lang.split(' ')[0]}</Chip>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 mt-4 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <Button variant="ghost" className="!text-[11px] flex-1">📋 Consignes</Button>
                <Button variant="ghost" className="!text-[11px] flex-1">💰 Paie</Button>
                <Button variant="ghost" className="!text-[11px] flex-1">📸 Cam</Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
