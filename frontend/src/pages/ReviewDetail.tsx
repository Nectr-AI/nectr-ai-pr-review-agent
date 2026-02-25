import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, ExternalLink, GitPullRequest,
  FileCode, Clock, User, GitBranch
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { AppLayout } from '../components/AppLayout';
import { StatusBadge } from '../components/StatusBadge';
import { useReview } from '../hooks/useReviews';
import { formatDistanceToNow, formatDuration } from '../lib/utils';

export default function ReviewDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: review, isLoading, error } = useReview(id!);

  if (isLoading) {
    return (
      <AppLayout title="Review">
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[#F5C800] border-t-transparent animate-spin" />
            <span className="text-[#555] text-xs uppercase tracking-widest">Loading review...</span>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !review) {
    return (
      <AppLayout title="Review">
        <div className="text-center py-16">
          <p className="text-[#555] uppercase tracking-wider">Review not found</p>
          <Link to="/logs" className="text-[#F5C800] text-sm mt-4 inline-block hover:underline">
            ← Back to Logs
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Review Detail">
      {/* Back */}
      <Link
        to="/logs"
        className="inline-flex items-center gap-2 text-[#555] hover:text-[#F5C800] text-sm mb-6 transition-colors uppercase tracking-wider"
      >
        <ArrowLeft size={14} /> Back to Logs
      </Link>

      {/* PR Header */}
      <div className="card-yellow mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <GitPullRequest size={16} className="text-[#F5C800] flex-shrink-0" />
              {review.pr_number && (
                <span className="text-[#F5C800] font-mono text-sm font-bold">#{review.pr_number}</span>
              )}
              <StatusBadge status={review.status} size="md" />
            </div>
            <h2 className="text-white text-xl font-bold leading-tight">
              {review.pr_title || review.event_type}
            </h2>
          </div>

          {review.pr_url && (
            <a
              href={review.pr_url}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary text-xs px-4 py-2 flex items-center gap-2 flex-shrink-0"
            >
              View on GitHub <ExternalLink size={12} />
            </a>
          )}
        </div>

        {/* Meta */}
        <div className="mt-5 pt-5 border-t border-[#222] grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-[#555] text-[10px] uppercase tracking-widest mb-1">Repository</p>
            <p className="text-white text-sm font-mono">{review.repo_name || '—'}</p>
          </div>
          <div>
            <p className="text-[#555] text-[10px] uppercase tracking-widest mb-1">Branch</p>
            <div className="flex items-center gap-1">
              <GitBranch size={12} className="text-[#F5C800]" />
              <p className="text-white text-sm font-mono">{review.branch || 'main'}</p>
            </div>
          </div>
          <div>
            <p className="text-[#555] text-[10px] uppercase tracking-widest mb-1">Author</p>
            <div className="flex items-center gap-1">
              <User size={12} className="text-[#F5C800]" />
              <p className="text-white text-sm">@{review.author || '—'}</p>
            </div>
          </div>
          <div>
            <p className="text-[#555] text-[10px] uppercase tracking-widest mb-1">Files Analyzed</p>
            <div className="flex items-center gap-1">
              <FileCode size={12} className="text-[#F5C800]" />
              <p className="text-white text-sm">{review.files_analyzed ?? '—'}</p>
            </div>
          </div>
          <div>
            <p className="text-[#555] text-[10px] uppercase tracking-widest mb-1">Received</p>
            <div className="flex items-center gap-1">
              <Clock size={12} className="text-[#F5C800]" />
              <p className="text-white text-sm">{formatDistanceToNow(review.created_at)}</p>
            </div>
          </div>
          <div>
            <p className="text-[#555] text-[10px] uppercase tracking-widest mb-1">Review Time</p>
            <p className="text-white text-sm font-mono">
              {review.processed_at ? formatDuration(review.created_at, review.processed_at) : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* AI Review */}
      {review.ai_summary ? (
        <div className="card-yellow">
          <p className="section-label mb-4">AI Review by Samosa</p>
          <div className="prose prose-invert prose-sm max-w-none
            prose-headings:text-[#F5C800] prose-headings:font-bold prose-headings:uppercase prose-headings:tracking-wide
            prose-strong:text-white prose-strong:font-bold
            prose-code:text-[#F5C800] prose-code:bg-[#1a1a1a] prose-code:px-1 prose-code:py-0.5
            prose-pre:bg-[#1a1a1a] prose-pre:border prose-pre:border-[#333]
            prose-blockquote:border-l-4 prose-blockquote:border-[#F5C800] prose-blockquote:pl-4
            prose-p:text-[#ccc] prose-li:text-[#ccc]
            prose-table:text-sm prose-th:text-[#F5C800] prose-th:font-bold prose-th:uppercase prose-th:text-xs prose-th:tracking-wider
            prose-td:text-[#ccc] prose-td:border-[#333]
            prose-a:text-[#F5C800] prose-a:no-underline hover:prose-a:underline
          ">
            <ReactMarkdown>{review.ai_summary}</ReactMarkdown>
          </div>
        </div>
      ) : (
        <div className="card text-center py-10">
          <p className="text-[#555] text-sm uppercase tracking-wider">
            {review.status === 'processing'
              ? 'AI review is in progress...'
              : 'No AI review available'}
          </p>
          {review.status === 'processing' && (
            <div className="mt-4 flex justify-center">
              <div className="w-6 h-6 border-2 border-[#F5C800] border-t-transparent animate-spin" />
            </div>
          )}
        </div>
      )}
    </AppLayout>
  );
}
