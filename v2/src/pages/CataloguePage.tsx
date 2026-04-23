import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';

const PRODS = [
  { n: 'Pack photo starter', p: 50, t: '📸', sales: 184 },
  { n: 'Pack video premium', p: 150, t: '🎬', sales: 98 },
  { n: 'Custom photo', p: 200, t: '⭐', sales: 142 },
  { n: 'Custom video 5min', p: 500, t: '🎥', sales: 42 },
  { n: 'Abonnement VIP mensuel', p: 120, t: '💎', sales: 68 },
  { n: 'Abonnement VIP annuel', p: 1200, t: '👑', sales: 12 },
  { n: 'Call privé 30min', p: 400, t: '📞', sales: 28 },
  { n: 'Call privé 1h', p: 700, t: '📱', sales: 14 },
  { n: 'Pack couple', p: 350, t: '💑', sales: 22 },
  { n: 'Fetish customs', p: 600, t: '✨', sales: 18 },
  { n: 'Starter pack découverte', p: 30, t: '🎁', sales: 428 },
  { n: 'Bundle best-of', p: 250, t: '🎊', sales: 64 },
];

export function CataloguePage() {
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <div className="mono-tag">PRODUCT OFFERING</div>
          <div className="text-[26px] font-bold mt-1">Catalogue · 17 produits</div>
        </div>
        <Button variant="primary">+ Nouveau produit</Button>
      </div>
      <div className="grid grid-cols-4 gap-4">
        {PRODS.map((p) => (
          <Card key={p.n} variant="premium" className="p-4">
            <div className="text-[34px] mb-2">{p.t}</div>
            <div className="text-[13px] font-bold">{p.n}</div>
            <div className="text-[22px] font-bold font-[var(--font-mono)] metallic-anim mt-2">{p.p} CHF</div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t text-[11px]" style={{ borderColor: 'var(--color-border)' }}>
              <span className="mono-tag">{p.sales} ventes</span>
              <Chip tone="success">Actif</Chip>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
