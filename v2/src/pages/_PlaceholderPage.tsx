import { Card } from '@/components/ui/Card';

export function PlaceholderPage({ title, emoji, description }: { title: string; emoji: string; description: string }) {
  return (
    <div className="space-y-5">
      <div>
        <div className="mono-tag">{title.toUpperCase()}</div>
        <div className="text-[26px] font-bold mt-1">{emoji} {title}</div>
        <div className="text-[12px] text-[var(--color-muted)]">{description}</div>
      </div>
      <Card variant="premium" className="p-8 text-center">
        <div className="text-[40px] opacity-40">🚧</div>
        <div className="text-[14px] font-semibold mt-3">En construction</div>
        <div className="text-[11px] text-[var(--color-muted)] mt-1">
          Cette page sera portée depuis le prototype dans les prochaines PRs.
        </div>
      </Card>
    </div>
  );
}
