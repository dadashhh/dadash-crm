import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'success' | 'danger' | 'warning' | 'indigo' | 'muted' | 'metallic';

export function Chip({ tone = 'indigo', className, children, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  const tones: Record<Tone, string> = {
    success: 'bg-[rgba(52,211,153,0.1)] text-[var(--color-success)] border-[rgba(52,211,153,0.22)]',
    danger: 'bg-[rgba(251,113,133,0.1)] text-[var(--color-danger)] border-[rgba(251,113,133,0.22)]',
    warning: 'bg-[rgba(251,191,36,0.1)] text-[var(--color-warning)] border-[rgba(251,191,36,0.24)]',
    indigo: 'bg-[rgba(129,140,248,0.1)] text-[var(--color-accent-l)] border-[rgba(129,140,248,0.28)]',
    muted: 'bg-[rgba(168,184,216,0.05)] text-[var(--color-text-2)] border-[rgba(168,184,216,0.1)]',
    metallic: 'bg-[var(--metallic)] text-[#0a0d18] border-[rgba(199,210,254,0.4)] font-bold',
  };
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10.5px] font-semibold tracking-wide', tones[tone], className)} {...props}>
      {children}
    </span>
  );
}
