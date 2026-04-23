import { type HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'premium' | 'hero' }>(
  ({ className, variant = 'default', ...props }, ref) => {
    const base = 'relative rounded-[18px] border';
    const variants = {
      default: 'bg-[var(--color-card)] border-[var(--color-border)] shadow-[0_12px_28px_rgba(0,0,0,0.32)]',
      premium: 'border-[var(--color-border)] overflow-hidden bg-[linear-gradient(180deg,rgba(129,140,248,0.04)_0%,rgba(15,20,35,1)_40%),var(--color-card)] before:content-[""] before:absolute before:top-0 before:left-0 before:right-0 before:h-px before:bg-[linear-gradient(90deg,transparent_0%,rgba(199,210,254,0.35)_30%,rgba(129,140,248,0.5)_50%,rgba(199,210,254,0.35)_70%,transparent_100%)] shadow-[var(--shadow-premium)]',
      hero: 'rounded-[20px] border-[var(--color-border-2)] overflow-hidden bg-[radial-gradient(600px_250px_at_20%_0%,rgba(129,140,248,0.12),transparent_60%),linear-gradient(180deg,rgba(129,140,248,0.03)_0%,var(--color-card)_50%)] shadow-[var(--shadow-deep)] before:content-[""] before:absolute before:top-0 before:left-5 before:right-5 before:h-px before:bg-[linear-gradient(90deg,transparent,var(--color-accent-xl),transparent)] before:opacity-60',
    };
    return <div ref={ref} className={cn(base, variants[variant], className)} {...props} />;
  }
);
Card.displayName = 'Card';
