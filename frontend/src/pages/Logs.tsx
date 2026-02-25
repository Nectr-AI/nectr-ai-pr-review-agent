import { useState } from 'react';
import { Search, Filter } from 'lucide-react';
import { AppLayout } from '../components/AppLayout';
import { ReviewTable } from '../components/ReviewTable';
import { useReviews } from '../hooks/useReviews';

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'processing', label: 'Processing' },
];

export default function Logs() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [limit, setLimit] = useState(20);

  const { data: reviews, isLoading } = useReviews({ limit, status: status || undefined, search: search || undefined });

  return (
    <AppLayout title="Logs">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tight text-white">Review Logs</h2>
          <p className="text-[#555] text-sm mt-0.5">{reviews?.length ?? 0} reviews loaded</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        {/* Search */}
        <div className="flex items-center gap-2 bg-[#111111] border-2 border-[#222222] px-4 py-2.5 flex-1 focus-within:border-[#F5C800] transition-colors">
          <Search size={14} className="text-[#555] flex-shrink-0" />
          <input
            type="text"
            placeholder="Search by repo, PR title, number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-white text-sm placeholder-[#555] outline-none w-full"
          />
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-2 bg-[#111111] border-2 border-[#222222] px-4 py-2.5 min-w-[160px] focus-within:border-[#F5C800] transition-colors">
          <Filter size={14} className="text-[#555]" />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="bg-transparent text-white text-sm outline-none w-full cursor-pointer"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className="bg-[#111111]">
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <ReviewTable reviews={reviews || []} isLoading={isLoading} />

      {/* Load more */}
      {reviews && reviews.length >= limit && (
        <div className="mt-4 text-center">
          <button
            onClick={() => setLimit((l) => l + 20)}
            className="btn-secondary text-xs px-6 py-2"
          >
            Load more
          </button>
        </div>
      )}
    </AppLayout>
  );
}
