import { useNavigate } from 'react-router-dom';
import { StatusBadge } from './StatusBadge';
import type { Review } from '../types';
import { formatDistanceToNow } from '../lib/utils';

interface Props {
  reviews: Review[];
  isLoading?: boolean;
}

export function ReviewTable({ reviews, isLoading }: Props) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="border-2 border-[#222222]">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-14 bg-[#111111] border-b border-[#222] animate-pulse" />
        ))}
      </div>
    );
  }

  if (!reviews.length) {
    return (
      <div className="border-2 border-[#222222] p-12 text-center">
        <p className="text-[#555] text-sm uppercase tracking-wider">No reviews yet</p>
        <p className="text-[#333] text-xs mt-1">Connect a repo to start getting AI reviews</p>
      </div>
    );
  }

  return (
    <div className="border-2 border-[#222222] overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-[#222222] bg-[#111111]">
            <th className="text-left px-4 py-3 text-[#555] font-bold uppercase text-xs tracking-wider w-12">#</th>
            <th className="text-left px-4 py-3 text-[#555] font-bold uppercase text-xs tracking-wider">Name</th>
            <th className="text-left px-4 py-3 text-[#555] font-bold uppercase text-xs tracking-wider hidden md:table-cell">Repository</th>
            <th className="text-left px-4 py-3 text-[#555] font-bold uppercase text-xs tracking-wider hidden lg:table-cell">Branch</th>
            <th className="text-left px-4 py-3 text-[#555] font-bold uppercase text-xs tracking-wider">Status</th>
            <th className="text-left px-4 py-3 text-[#555] font-bold uppercase text-xs tracking-wider hidden sm:table-cell">Last Updated</th>
          </tr>
        </thead>
        <tbody>
          {reviews.map((review) => (
            <tr
              key={review.id}
              onClick={() => navigate(`/logs/${review.id}`)}
              className="border-b border-[#1a1a1a] hover:bg-[#111111] cursor-pointer transition-colors group"
            >
              <td className="px-4 py-3.5 text-[#555] font-mono text-xs">{review.pr_number || review.id}</td>
              <td className="px-4 py-3.5">
                <span className="text-white group-hover:text-[#F5C800] transition-colors font-medium truncate block max-w-[280px]">
                  {review.pr_title || review.event_type}
                </span>
              </td>
              <td className="px-4 py-3.5 text-[#999] font-mono text-xs hidden md:table-cell">
                {review.repo_name || '—'}
              </td>
              <td className="px-4 py-3.5 text-[#999] font-mono text-xs hidden lg:table-cell">
                {review.branch || 'main'}
              </td>
              <td className="px-4 py-3.5">
                <StatusBadge status={review.pr_status || review.status} />
              </td>
              <td className="px-4 py-3.5 text-[#555] text-xs hidden sm:table-cell">
                {formatDistanceToNow(review.processed_at || review.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
