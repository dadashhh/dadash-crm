import { Card } from './Card';
import { Chip } from './Chip';
import { cn } from '@/lib/cn';

interface Props {
  label: string;
  value: string | number;
  hint?: string;
  trend?: { value: string; tone?: 'success' | 'danger' | 'warning' | 'indigo' };
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  metallic?: boolean;
}

export function KpiCard({ label, value, hint, trend, selected, onClick, className, metallic }: Props) {
  return (
    <Card
      variant="premium"
      onClick={onClick}
      className={cn(
        'p-4 cursor-pointer transition-all duration-200',
        'hover:-translate-y-0.5 hover:border-[var(--color-border-2)] hover:shadow-[var(--shadow-premium),var(--shadow-glow)]',
        selected && 'border-[var(--color-accent)] bg-[linear-gradient(135deg,rgba(129,140,248,0.12)_0%,rgba(99,102,241,0.03)_80%)]',
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="mono-tag">{label}</div>
        {trend && <Chip tone={trend.tone ?? 'success'}>{trend.value}</Chip>}
      </div>
      <div className={cn('text-[26px] font-bold mt-2 font-[var(--font-mono)]', metallic && 'metallic-anim')}>{value}</div>
      {hint && <div className="text-[11px] text-[var(--color-muted)]">{hint}</div>}
    </Card>
  );
}
