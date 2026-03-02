'use client';
import { useState } from 'react';
import { useReviews } from '@/hooks/useReviews';
import { StatusBadge, PRStatusBadge, VerdictBadge } from '@/components/dashboard/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, GitPullRequest, ExternalLink, ChevronRight, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import type { Review } from '@/types';

function extractVerdict(summary?: string): string | undefined {
  if (!summary) return undefined;
  if (summary.includes('**APPROVE**')) return 'APPROVE';
  if (summary.includes('**REQUEST_CHANGES**')) return 'REQUEST_CHANGES';
  if (summary.includes('**NEEDS_DISCUSSION**')) return 'NEEDS_DISCUSSION';
  return undefined;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function ReviewRow({ r }: { r: Review }) {
  const verdict = extractVerdict(r.ai_summary);
  return (
    <Link
      href={`/reviews/${r.id}`}
      className="flex items-center gap-4 px-5 py-4 hover:bg-surface-subtle transition-colors group border-b border-surface-border last:border-0"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-xs text-content-secondary">#{r.pr_number}</span>
          <span className="text-sm font-semibold text-content-primary group-hover:text-amber transition-colors truncate">
            {r.pr_title || 'Untitled PR'}
          </span>
          {r.pr_url && (
            <a
              href={r.pr_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-content-muted hover:text-amber transition-colors flex-shrink-0"
            >
              <ExternalLink size={12} />
            </a>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-content-secondary font-mono">
          <span className="truncate">{r.repo_name}</span>
          <span>·</span>
          <span>{r.author}</span>
          {r.files_analyzed && (
            <>
              <span>·</span>
              <span>{r.files_analyzed} files</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {r.pr_status && <PRStatusBadge status={r.pr_status} />}
        <StatusBadge status={r.status} />
        {verdict && <VerdictBadge verdict={verdict} />}
        <span className="text-xs text-content-muted font-mono hidden lg:block">
          {formatDate(r.created_at)}
        </span>
        <ChevronRight size={14} className="text-content-muted group-hover:text-amber transition-colors" />
      </div>
    </Link>
  );
}

export default function ReviewsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [limit, setLimit] = useState(20);

  const { data: reviews, isLoading, refetch, isFetching } = useReviews({ limit, status: status || undefined, search: search || undefined });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-h1 font-black tracking-tight">PR Reviews</h1>
          <p className="text-content-secondary text-body mt-1">
            {isLoading ? 'Loading...' : `${reviews?.length ?? 0} reviews`}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="btn-nectr-secondary text-xs"
        >
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by PR title, repo, author..."
            className="nectr-input pl-9"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="nectr-input w-full sm:w-44 bg-surface-subtle cursor-pointer"
        >
          <option value="">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="processing">Processing</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="nectr-input w-full sm:w-28 bg-surface-subtle cursor-pointer"
        >
          <option value={20}>20</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </div>

      {/* Table */}
      <div className="nectr-card p-0 overflow-hidden">
        {/* Header */}
        <div className="hidden lg:grid grid-cols-[1fr_auto] px-5 py-3 border-b border-surface-border bg-surface-subtle">
          <span className="label-mono">Pull Request</span>
          <span className="label-mono">Status</span>
        </div>

        {isLoading ? (
          <div className="divide-y divide-surface-border">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="px-5 py-4">
                <Skeleton className="h-4 w-48 mb-2 bg-surface-subtle" />
                <Skeleton className="h-3 w-72 bg-surface-subtle" />
              </div>
            ))}
          </div>
        ) : reviews?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <GitPullRequest size={32} className="text-content-muted" />
            <div className="text-center">
              <p className="text-content-primary font-semibold">No reviews yet</p>
              <p className="text-content-secondary text-sm mt-1">Connect a repo to start getting AI reviews</p>
            </div>
            <Link href="/repos" className="btn-nectr-primary text-xs">Connect a Repo</Link>
          </div>
        ) : (
          <div>
            {reviews?.map((r) => <ReviewRow key={r.id} r={r} />)}
          </div>
        )}
      </div>
    </div>
  );
}
