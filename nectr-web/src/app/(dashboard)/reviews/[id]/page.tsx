'use client';
import { use } from 'react';
import { useReview } from '@/hooks/useReviews';
import { StatusBadge, PRStatusBadge, VerdictBadge } from '@/components/dashboard/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, FileCode, User, GitBranch, ArrowLeft, Calendar, Clock } from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';

function formatDate(d: string) {
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function extractVerdict(summary?: string): string | undefined {
  if (!summary) return undefined;
  if (summary.includes('**APPROVE**')) return 'APPROVE';
  if (summary.includes('**REQUEST_CHANGES**')) return 'REQUEST_CHANGES';
  if (summary.includes('**NEEDS_DISCUSSION**')) return 'NEEDS_DISCUSSION';
  return undefined;
}

export default function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: review, isLoading } = useReview(id);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Skeleton className="h-8 w-64 bg-surface-elevated" />
        <div className="grid lg:grid-cols-3 gap-6">
          <Skeleton className="lg:col-span-2 h-96 rounded-xl bg-surface-elevated" />
          <Skeleton className="h-64 rounded-xl bg-surface-elevated" />
        </div>
      </div>
    );
  }

  if (!review) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-content-secondary">Review not found</p>
        <Link href="/reviews" className="btn-nectr-secondary text-xs">Back to Reviews</Link>
      </div>
    );
  }

  const verdict = extractVerdict(review.ai_summary);

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-content-secondary">
        <Link href="/reviews" className="flex items-center gap-1.5 hover:text-amber transition-colors">
          <ArrowLeft size={14} />
          Reviews
        </Link>
        <span>/</span>
        <span className="text-content-primary font-mono">#{review.pr_number}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-h1 font-black tracking-tight leading-tight">{review.pr_title || `PR #${review.pr_number}`}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <StatusBadge status={review.status} />
            {review.pr_status && <PRStatusBadge status={review.pr_status} />}
            {verdict && <VerdictBadge verdict={verdict} />}
            {review.pr_url && (
              <a
                href={review.pr_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-amber font-mono hover:underline"
              >
                View on GitHub <ExternalLink size={11} />
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* AI Review */}
        <div className="lg:col-span-2 space-y-5">
          <div className="nectr-card">
            <p className="label-mono mb-4">AI Review</p>
            {review.ai_summary ? (
              <div className="prose prose-invert prose-sm max-w-none
                prose-headings:text-content-primary prose-headings:font-black prose-headings:tracking-tight
                prose-p:text-content-secondary prose-p:leading-relaxed
                prose-li:text-content-secondary prose-li:leading-relaxed
                prose-strong:text-content-primary prose-strong:font-bold
                prose-code:text-amber prose-code:bg-surface-subtle prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:text-xs
                prose-pre:bg-surface-subtle prose-pre:border prose-pre:border-surface-border
                prose-table:text-sm prose-th:text-content-secondary prose-th:font-mono prose-th:text-xs prose-th:uppercase prose-th:tracking-wider
                prose-a:text-amber prose-a:no-underline hover:prose-a:underline
              ">
                <ReactMarkdown>{review.ai_summary}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-content-secondary text-sm">No AI summary available.</p>
            )}
          </div>
        </div>

        {/* Sidebar metadata */}
        <div className="space-y-4">
          <div className="nectr-card space-y-4">
            <p className="label-mono">PR Details</p>
            <div className="space-y-3">
              {review.author && (
                <div className="flex items-center gap-3">
                  <User size={14} className="text-content-muted flex-shrink-0" />
                  <div>
                    <p className="text-caption font-mono text-content-secondary">Author</p>
                    <p className="text-sm font-medium">{review.author}</p>
                  </div>
                </div>
              )}
              {review.repo_name && (
                <div className="flex items-center gap-3">
                  <GitBranch size={14} className="text-content-muted flex-shrink-0" />
                  <div>
                    <p className="text-caption font-mono text-content-secondary">Repository</p>
                    <p className="text-sm font-medium font-mono">{review.repo_name}</p>
                  </div>
                </div>
              )}
              {review.branch && (
                <div className="flex items-center gap-3">
                  <GitBranch size={14} className="text-content-muted flex-shrink-0" />
                  <div>
                    <p className="text-caption font-mono text-content-secondary">Branch</p>
                    <p className="text-sm font-medium font-mono truncate">{review.branch}</p>
                  </div>
                </div>
              )}
              {review.files_analyzed !== undefined && (
                <div className="flex items-center gap-3">
                  <FileCode size={14} className="text-content-muted flex-shrink-0" />
                  <div>
                    <p className="text-caption font-mono text-content-secondary">Files Analyzed</p>
                    <p className="text-sm font-medium">{review.files_analyzed}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3">
                <Calendar size={14} className="text-content-muted flex-shrink-0" />
                <div>
                  <p className="text-caption font-mono text-content-secondary">Created</p>
                  <p className="text-sm">{formatDate(review.created_at)}</p>
                </div>
              </div>
              {review.processed_at && (
                <div className="flex items-center gap-3">
                  <Clock size={14} className="text-content-muted flex-shrink-0" />
                  <div>
                    <p className="text-caption font-mono text-content-secondary">Processed</p>
                    <p className="text-sm">{formatDate(review.processed_at)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {review.pr_url && (
            <a
              href={review.pr_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-nectr-secondary w-full justify-center"
            >
              <ExternalLink size={14} />
              Open GitHub PR
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
