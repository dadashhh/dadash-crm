import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'ghost' | 'icon';

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }>(
  ({ className, variant = 'ghost', ...props }, ref) => {
    const base = 'transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2';
    const v: Record<Variant, string> = {
      primary:
        'bg-[var(--grad-primary)] text-white px-4 py-2 rounded-[10px] font-semibold text-[13px] border border-[rgba(199,210,254,0.2)] shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_6px_20px_rgba(99,102,241,0.4)] hover:-translate-y-px hover:shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_8px_24px_rgba(99,102,241,0.55)]',
      ghost:
        'bg-[rgba(129,140,248,0.04)] border border-[var(--color-border)] text-[var(--color-text-2)] px-3.5 py-2 rounded-[10px] font-medium text-[12.5px] hover:border-[var(--color-border-2)] hover:text-[var(--color-text)] hover:bg-[rgba(129,140,248,0.08)]',
      icon:
        'w-[34px] h-[34px] bg-[rgba(129,140,248,0.04)] border border-[var(--color-border)] text-[var(--color-text-2)] rounded-[10px] hover:border-[var(--color-border-2)] hover:text-[var(--color-accent-l)] hover:bg-[rgba(129,140,248,0.08)]',
    };
    return <button ref={ref} className={cn(base, v[variant], className)} {...props} />;
  }
);
Button.displayName = 'Button';
