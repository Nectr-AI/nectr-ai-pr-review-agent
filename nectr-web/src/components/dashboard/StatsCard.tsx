import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon?: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  accent?: boolean;
  className?: string;
}

export function StatsCard({
  label,
  value,
  sub,
  icon: Icon,
  trend,
  trendValue,
  accent,
  className,
}: StatsCardProps) {
  return (
    <div
      className={cn(
        'nectr-card flex flex-col gap-3 transition-all hover:border-amber/20',
        accent && 'border-amber/30 shadow-amber-glow',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="label-mono">{label}</span>
        {Icon && (
          <div className={cn('p-2 rounded-lg', accent ? 'bg-amber/10' : 'bg-surface-subtle')}>
            <Icon size={15} className={accent ? 'text-amber' : 'text-content-secondary'} />
          </div>
        )}
      </div>
      <div>
        <p className={cn('text-h1 font-black tracking-tight', accent ? 'text-amber' : 'text-content-primary')}>
          {value}
        </p>
        {sub && <p className="text-body-sm text-content-secondary mt-0.5">{sub}</p>}
      </div>
      {trend && trendValue && (
        <div
          className={cn(
            'flex items-center gap-1 text-caption font-mono',
            trend === 'up' && 'text-success',
            trend === 'down' && 'text-danger',
            trend === 'neutral' && 'text-content-secondary',
          )}
        >
          <span>{trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}</span>
          <span>{trendValue}</span>
        </div>
      )}
    </div>
  );
}
