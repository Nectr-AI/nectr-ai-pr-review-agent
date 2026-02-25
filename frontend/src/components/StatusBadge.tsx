import type { ReviewStatus } from '../types';

interface Props {
  status: ReviewStatus | string;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'sm' }: Props) {
  const base = size === 'sm'
    ? 'inline-flex items-center px-2 py-0.5 text-xs font-bold uppercase tracking-wider'
    : 'inline-flex items-center px-3 py-1 text-sm font-bold uppercase tracking-wider';

  switch (status) {
    case 'completed':
      return <span className={`${base} bg-[#F5C800] text-black`}>Completed</span>;
    case 'failed':
      return <span className={`${base} bg-red-600 text-white`}>Failed</span>;
    case 'processing':
      return <span className={`${base} bg-[#333] text-[#999]`}>Processing</span>;
    case 'pending':
      return <span className={`${base} bg-[#222] text-[#999]`}>Pending</span>;
    default:
      return <span className={`${base} bg-[#222] text-[#777]`}>{status}</span>;
  }
}
