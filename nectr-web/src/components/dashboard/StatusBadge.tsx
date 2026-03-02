import { cn } from '@/lib/utils';
import type { ReviewStatus, PRStatus } from '@/types';

const STATUS_MAP: Record<ReviewStatus, { label: string; cls: string }> = {
  pending:    { label: 'Pending',    cls: 'badge-pending'    },
  processing: { label: 'Processing', cls: 'badge-processing' },
  completed:  { label: 'Completed',  cls: 'badge-completed'  },
  failed:     { label: 'Failed',     cls: 'badge-failed'     },
};

const PR_STATUS_MAP: Record<PRStatus, { label: string; cls: string }> = {
  open:   { label: 'Open',   cls: 'bg-amber/10 text-amber border border-amber/20' },
  merged: { label: 'Merged', cls: 'bg-success/10 text-success border border-success/20' },
  closed: { label: 'Closed', cls: 'bg-surface-border text-content-secondary border border-surface-border' },
};

const VERDICT_MAP: Record<string, { label: string; cls: string }> = {
  APPROVE:          { label: 'Approve',          cls: 'bg-success/10 text-success border border-success/20' },
  REQUEST_CHANGES:  { label: 'Request Changes',  cls: 'bg-danger/10 text-danger border border-danger/20'   },
  NEEDS_DISCUSSION: { label: 'Discuss',          cls: 'bg-amber/10 text-amber border border-amber/20'      },
};

interface StatusBadgeProps { status: ReviewStatus }
interface PRStatusBadgeProps { status: PRStatus }
interface VerdictBadgeProps { verdict?: string }

export function StatusBadge({ status }: StatusBadgeProps) {
  const { label, cls } = STATUS_MAP[status] ?? STATUS_MAP.pending;
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-caption font-mono uppercase tracking-wider', cls)}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}

export function PRStatusBadge({ status }: PRStatusBadgeProps) {
  const { label, cls } = PR_STATUS_MAP[status] ?? PR_STATUS_MAP.open;
  return (
    <span className={cn('inline-flex items-center px-2.5 py-1 rounded-full text-caption font-mono uppercase tracking-wider', cls)}>
      {label}
    </span>
  );
}

export function VerdictBadge({ verdict }: VerdictBadgeProps) {
  if (!verdict) return null;
  const { label, cls } = VERDICT_MAP[verdict] ?? { label: verdict, cls: 'bg-surface-border text-content-secondary' };
  return (
    <span className={cn('inline-flex items-center px-2.5 py-1 rounded-full text-caption font-mono uppercase tracking-wider', cls)}>
      {label}
    </span>
  );
}
