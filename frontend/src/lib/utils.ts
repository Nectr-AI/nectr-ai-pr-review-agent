export function formatDistanceToNow(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  // DB returns naive UTC timestamps — append Z if no timezone info so JS parses as UTC
  const normalized = dateStr.endsWith('Z') || dateStr.includes('+') || dateStr.includes('-', 10)
    ? dateStr
    : dateStr + 'Z';
  const date = new Date(normalized);
  if (isNaN(date.getTime())) return '—';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatDuration(startStr: string, endStr: string | null | undefined): string {
  if (!endStr) return '—';
  const start = new Date(startStr);
  const end = new Date(endStr);
  const secs = Math.floor((end.getTime() - start.getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}
