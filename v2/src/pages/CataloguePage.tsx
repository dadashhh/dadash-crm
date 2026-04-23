import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { useProducts, useModels } from '@/hooks/useDadashData';

const CATEGORY_ICONS: Record<string, string> = {
  photo: '📸', video: '🎬', custom: '⭐', call: '📞', subscription: '💎', pack: '🎁', default: '🎊',
};

export function CataloguePage() {
  const { data: products, isLoading } = useProducts();
  const { data: models } = useModels();
  const modelById = Object.fromEntries((models ?? []).map(m => [m.id, m]));

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <div className="mono-tag">PRODUCT OFFERING · LIVE DB</div>
          <div className="text-[26px] font-bold mt-1">Catalogue · {products?.length ?? 0} produits</div>
        </div>
        <Button variant="primary">+ Nouveau produit</Button>
      </div>
      {isLoading && <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>Chargement…</div>}
      {!isLoading && (products ?? []).length === 0 && (
        <Card variant="premium" className="p-8 text-center">
          <div className="text-[40px] opacity-40">📦</div>
          <div className="text-[14px] font-semibold mt-3">Aucun produit en DB</div>
          <div className="text-[11px] mt-1" style={{ color: 'var(--color-muted)' }}>Ajoute des produits dans la table <code>products</code></div>
        </Card>
      )}
      <div className="grid grid-cols-4 gap-4">
        {(products ?? []).map((p) => {
          const icon = p.icon ?? CATEGORY_ICONS[p.category?.toLowerCase() ?? 'default'] ?? CATEGORY_ICONS.default;
          const model = p.model_id ? modelById[p.model_id] : null;
          const price = Number(p.price_chf ?? 0);
          return (
            <Card key={p.id} variant="premium" className="p-4">
              <div className="text-[34px] mb-2">{icon}</div>
              <div className="text-[13px] font-bold">{p.name}</div>
              {p.category && <div className="text-[10px] mt-0.5 mono-tag">{p.category}</div>}
              {model && <div className="text-[10px] mt-1" style={{ color: 'var(--color-accent-l)' }}>{model.emoji} {model.name}</div>}
              <div className="text-[22px] font-bold font-[var(--font-mono)] metallic-anim mt-2">{price.toLocaleString('fr-CH')} {p.currency ?? 'CHF'}</div>
              {p.duration_minutes && <div className="text-[11px] mt-1" style={{ color: 'var(--color-muted)' }}>{p.duration_minutes} min</div>}
              <div className="flex items-center justify-between mt-3 pt-3 border-t text-[11px]" style={{ borderColor: 'var(--color-border)' }}>
                <span className="mono-tag">{p.active ? 'Actif' : 'Inactif'}</span>
                <Chip tone={p.active ? 'success' : 'muted'}>{p.active ? '✓' : '—'}</Chip>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
