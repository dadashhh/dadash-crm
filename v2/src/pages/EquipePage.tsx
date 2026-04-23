import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { useChatters, useModels } from '@/hooks/useDadashData';

export function EquipePage() {
  const { data: chatters, isLoading } = useChatters();
  const { data: models } = useModels();
  const modelById = Object.fromEntries((models ?? []).map(m => [m.id, m]));

  const chatterList = (chatters ?? []).filter(c => c.role === 'chatter');
  const mcList = (chatters ?? []).filter(c => c.role === 'mc' || c.role === 'manager');

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <div className="mono-tag">WORKFORCE · LIVE DB</div>
          <div className="text-[26px] font-bold mt-1">Équipe · {chatterList.length} chatters · {mcList.length} MC</div>
        </div>
        <Button variant="primary">+ Recruter</Button>
      </div>
      {isLoading && <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>Chargement…</div>}
      {chatterList.length === 0 && !isLoading && (
        <Card variant="premium" className="p-8 text-center">
          <div className="text-[40px] opacity-40">👥</div>
          <div className="text-[14px] font-semibold mt-3">Aucun chatter en DB</div>
          <div className="text-[11px] mt-1" style={{ color: 'var(--color-muted)' }}>Ajoute des chatters dans la table <code>team_members</code> avec <code>role='chatter'</code></div>
        </Card>
      )}
      <div className="grid grid-cols-3 gap-4">
        {chatterList.map((c) => {
          const tier = c.commission_rate ? `${c.commission_rate}%` : '—';
          const assignedModels = (c.assigned_models ?? []) as string[];
          return (
            <Card key={c.id} variant="premium" className="p-5">
              <div className="flex items-start gap-3">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-[18px]" style={{ background: 'var(--metallic)', color: '#0a0d18' }}>{c.full_name?.[0]?.toUpperCase() ?? '?'}</div>
                <div className="flex-1">
                  <div className="text-[16px] font-bold">{c.full_name ?? c.email}</div>
                  <div className="text-[11px] font-[var(--font-mono)]" style={{ color: 'var(--color-muted)' }}>{c.email}</div>
                </div>
                <Chip tone={c.status === 'active' ? 'success' : 'muted'}>{tier}</Chip>
              </div>
              {assignedModels.length > 0 && (
                <div className="mt-3">
                  <div className="mono-tag mb-1.5">Modèles assignées</div>
                  <div className="flex flex-wrap gap-1">
                    {assignedModels.map(mId => {
                      const m = modelById[mId];
                      if (!m) return null;
                      return <Chip key={mId} tone="indigo">{m.emoji ?? ''} {m.name}</Chip>;
                    })}
                  </div>
                </div>
              )}
              <div className="mt-3 p-2.5 rounded-xl flex items-center justify-between" style={{ background: 'linear-gradient(135deg,rgba(129,140,248,0.06),transparent)', border: '1px solid var(--color-border-2)' }}>
                <span className="mono-tag">Statut</span>
                <span className="font-[var(--font-mono)] font-bold">{c.status ?? '—'}</span>
              </div>
            </Card>
          );
        })}
      </div>
      {mcList.length > 0 && (
        <>
          <div className="mt-6 mono-tag">MANAGERS CHATTERS</div>
          <div className="grid grid-cols-3 gap-4">
            {mcList.map((c) => (
              <Card key={c.id} variant="premium" className="p-5" style={{ borderColor: 'var(--color-border-2)' }}>
                <div className="flex items-start gap-3">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-[18px]" style={{ background: 'var(--metallic)', color: '#0a0d18' }}>{c.full_name?.[0]?.toUpperCase() ?? '?'}</div>
                  <div className="flex-1">
                    <div className="text-[16px] font-bold">{c.full_name ?? c.email}</div>
                    <div className="text-[11px] font-[var(--font-mono)]" style={{ color: 'var(--color-accent-l)' }}>Manager Chatter · {c.commission_rate ?? 25}%</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
