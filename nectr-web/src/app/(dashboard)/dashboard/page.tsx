'use client';
import { useState, useMemo, useEffect } from 'react';
import {
  useAnalyticsSummary,
  useAnalyticsTimeline,
  useAnalyticsInsights,
  useGraphAnalytics,
} from '@/hooks/useAnalytics';
import { useReviews } from '@/hooks/useReviews';
import { useRepos } from '@/hooks/useRepos';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  ChevronDown, GitPullRequest, Clock, GitBranch, Zap, Download, Users,
  CheckCircle2, XCircle, ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import type { Review, ContributorStat } from '@/types';

// ── Brand colours ─────────────────────────────────────────────────────────────
const AMBER   = '#F5C000';
const SUCCESS = '#4ADB4A';
const DANGER  = '#DB4A4A';
const BORDER  = '#232323';
const CARD    = '#141414';

// ── Contributor avatar palette (one per slot, cycles if > 10) ─────────────────
const CONTRIB_PALETTE = [
  '#4A9FDB', // blue
  '#F5C000', // amber
  '#4ADB4A', // green
  '#DB4A9F', // pink
  '#9F4ADB', // purple
  '#DB9F4A', // orange
  '#4ADBDB', // teal
  '#DB4A4A', // red
  '#888888',
  '#AAAAAA',
];

// ── Number formatter (1,234 style) ────────────────────────────────────────────
function fmtN(n: number) {
  return n.toLocaleString('en-US');
}

// ── Top Contributors component ────────────────────────────────────────────────
function TopContributors({ repo }: { repo: string | null }) {
  const { data, isLoading } = useGraphAnalytics(repo);
  const contributors: ContributorStat[] = data?.contributors ?? [];

  return (
    <div className="mx-6 mb-6">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[11px] font-semibold tracking-widest uppercase mb-1"
            style={{ color: '#555' }}>
            Default Branch · All Time
          </p>
          <h2 className="text-lg font-bold tracking-tight">Top Contributors</h2>
        </div>
        <Users size={18} style={{ color: AMBER }} />
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4">
          {[0, 1, 2].map(i => (
            <Skeleton key={i} className="h-44 rounded-xl" style={{ backgroundColor: '#1a1a1a' }} />
          ))}
        </div>
      ) : contributors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 rounded-xl"
          style={{ border: `1px solid ${BORDER}`, backgroundColor: CARD }}>
          <Users size={28} style={{ color: '#333' }} />
          <p className="text-sm" style={{ color: '#555' }}>No contributor data yet</p>
          <p className="text-xs" style={{ color: '#444' }}>Connect a repo to see stats</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {contributors.map((c, idx) => (
            <ContributorCard key={c.login} contributor={c} rank={idx + 1} color={CONTRIB_PALETTE[idx % CONTRIB_PALETTE.length]} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Single contributor card ───────────────────────────────────────────────────
function ContributorCard({ contributor, rank, color }: {
  contributor: ContributorStat;
  rank: number;
  color: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { login, total, additions, deletions, weeks } = contributor;

  // Bar chart data: keep all 12 weeks to preserve timeline shape
  const chartData = weeks.map(w => ({ c: w.c }));
  const maxCommits = Math.max(...chartData.map(d => d.c), 1);

  const initial = login.charAt(0).toUpperCase();

  return (
    <div
      className="relative rounded-xl p-5 flex flex-col gap-4"
      style={{ backgroundColor: '#141414', border: `1px solid ${BORDER}`, transition: 'background-color 150ms ease' }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1c1c1c')}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#141414')}
    >
      {/* Rank badge */}
      <span className="absolute top-4 right-4 text-xs font-semibold tabular-nums"
        style={{ color: '#444' }}>
        #{rank}
      </span>

      {/* Avatar + name row */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-base font-bold flex-shrink-0"
          style={{ backgroundColor: `${color}22`, color, border: `1.5px solid ${color}55` }}
        >
          {initial}
        </div>
        <div>
          <p className="text-sm font-semibold font-mono" style={{ color }}>
            @{login}
          </p>
          <p className="text-xs mt-0.5 font-mono">
            <span style={{ color: '#666' }}>{fmtN(total)} commits </span>
            <span style={{ color: SUCCESS }}>+{fmtN(additions)} </span>
            <span style={{ color: DANGER }}>-{fmtN(deletions)}</span>
          </p>
        </div>
      </div>

      {/* Weekly bar chart */}
      <div className="h-16">
        {!mounted ? null : <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barCategoryGap="20%" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <YAxis domain={[0, maxCommits]} hide />
            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                if (!active || !payload?.length || !payload[0].value) return null;
                return (
                  <div className="px-2 py-1 rounded text-[11px] font-medium shadow-lg"
                    style={{ backgroundColor: '#1c1c1c', border: `1px solid ${BORDER}`, color }}>
                    {payload[0].value} commits
                  </div>
                );
              }}
            />
            <Bar dataKey="c" radius={[2, 2, 0, 0]}>
              {chartData.map((d, i) => (
                <Cell
                  key={i}
                  fill={color}
                  fillOpacity={d.c === 0 ? 0 : (d.c / maxCommits) * 0.5 + 0.5}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// ── Tiny sparkline ────────────────────────────────────────────────────────────
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-[2px] h-9">
      {data.map((v, i) => (
        <div key={i} className="flex-1 rounded-[2px]"
          style={{ height: `${Math.max(3, (v / max) * 36)}px`, backgroundColor: color, opacity: 0.9 }} />
      ))}
    </div>
  );
}

// ── Bar chart tooltip ─────────────────────────────────────────────────────────
function BarTip({ active, payload, label }: { active?: boolean; payload?: Array<{name: string; value: number; color?: string}>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="px-3 py-2 rounded-lg text-xs shadow-xl space-y-0.5"
      style={{ backgroundColor: '#1c1c1c', border: `1px solid ${BORDER}`, color: '#f0f0f0' }}>
      <p className="font-medium" style={{ color: '#777' }}>{label}</p>
      {payload.map(p => (
        <p key={p.name}>
          <span className="font-semibold" style={{ color: p.color }}>{p.value}</span>
          <span className="ml-1" style={{ color: '#555' }}>{p.name}</span>
        </p>
      ))}
    </div>
  );
}

// ── Verdict pill ──────────────────────────────────────────────────────────────
function VerdictPill({ verdict }: { verdict?: string | null }) {
  if (!verdict) return <span style={{ color: '#444' }}>—</span>;
  const map: Record<string, { color: string; bg: string; label: string }> = {
    APPROVE:          { color: SUCCESS, bg: 'rgba(74,219,74,0.1)',  label: 'Approve' },
    REQUEST_CHANGES:  { color: DANGER,  bg: 'rgba(219,74,74,0.1)',  label: 'Changes' },
    NEEDS_DISCUSSION: { color: AMBER,   bg: 'rgba(245,192,0,0.1)',  label: 'Discuss' },
  };
  const s = map[verdict] ?? { color: '#666', bg: '#1a1a1a', label: verdict };
  return (
    <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold"
      style={{ color: s.color, backgroundColor: s.bg }}>
      {s.label}
    </span>
  );
}

// ── Status dot ────────────────────────────────────────────────────────────────
function StatusDot({ status }: { status: string }) {
  const color = status === 'completed' ? SUCCESS : status === 'failed' ? DANGER : AMBER;
  return <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: color }} />;
}

// ── Inline segment bar (verdict distribution) ─────────────────────────────────
function SegmentBar({ approve, changes, discuss, total }: { approve: number; changes: number; discuss: number; total: number }) {
  if (total === 0) return <div className="h-2 rounded-full w-full" style={{ backgroundColor: BORDER }} />;
  const ap = (approve / total) * 100;
  const ch = (changes / total) * 100;
  const di = (discuss / total) * 100;
  return (
    <div className="flex h-2 rounded-full overflow-hidden gap-px">
      {ap > 0 && <div style={{ width: `${ap}%`, backgroundColor: SUCCESS }} />}
      {ch > 0 && <div style={{ width: `${ch}%`, backgroundColor: DANGER }} />}
      {di > 0 && <div style={{ width: `${di}%`, backgroundColor: AMBER }} />}
    </div>
  );
}

// ── Per-repo row ──────────────────────────────────────────────────────────────
function RepoRow({ repo, prs, mergeRate, issues, verdict, last }: {
  repo: string; prs: number; mergeRate: number; issues: number;
  verdict: string; last: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="grid items-center px-5 py-4 text-sm"
      style={{
        gridTemplateColumns: '2fr 0.8fr 1.2fr 0.8fr 1fr 0.8fr',
        borderBottom: `1px solid ${BORDER}`,
        backgroundColor: hovered ? '#1c1c1c' : 'transparent',
        transition: 'background-color 150ms ease',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-center gap-2">
        <GitBranch size={13} style={{ color: AMBER, flexShrink: 0 }} />
        <span className="font-mono font-medium" style={{ color: '#e0e0e0' }}>
          {truncate(repo.split('/')[1] ?? repo, 28)}
        </span>
      </div>
      <span style={{ color: '#aaa' }}>{prs}</span>
      <span style={{ color: mergeRate >= 80 ? SUCCESS : mergeRate >= 50 ? AMBER : DANGER }}>
        {mergeRate.toFixed(1)}%
      </span>
      <span style={{ color: issues > 0 ? DANGER : '#555' }}>{issues}</span>
      <VerdictPill verdict={verdict} />
      <span style={{ color: '#555' }}>{last}</span>
    </div>
  );
}

// ── Review row ────────────────────────────────────────────────────────────────
function ReviewRow({ review }: { review: Review }) {
  const [hovered, setHovered] = useState(false);
  const summary = review.ai_summary ?? '';
  const verdictMatch = summary.match(/\*\*([A-Z_]+)\*\*|verdict[:\s]+([A-Z_]+)/i);
  const verdict = verdictMatch?.[1] ?? verdictMatch?.[2] ?? null;

  return (
    <div
      className="grid items-center px-5 py-4 text-sm"
      style={{
        gridTemplateColumns: '2.8fr 1.4fr 1.1fr 0.9fr 1fr 1fr 0.9fr',
        borderBottom: `1px solid ${BORDER}`,
        backgroundColor: hovered ? '#1c1c1c' : 'transparent',
        transition: 'background-color 150ms ease',
        cursor: 'pointer',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-center gap-2 min-w-0">
        <StatusDot status={review.status} />
        <a
          href={review.pr_url ?? '#'}
          target="_blank"
          rel="noreferrer"
          className="font-medium truncate hover:underline"
          style={{ color: '#e0e0e0' }}
          onClick={e => e.stopPropagation()}
        >
          {review.pr_title ? truncate(review.pr_title, 42) : `PR #${review.pr_number}`}
        </a>
      </div>
      <span className="truncate font-mono text-xs" style={{ color: '#666' }}>
        {review.repo_name ? truncate(review.repo_name.split('/')[1] ?? review.repo_name, 20) : '—'}
      </span>
      <span style={{ color: '#888' }}>{review.author ?? '—'}</span>
      <span style={{ color: '#666' }}>{review.files_analyzed ?? '—'}</span>
      <VerdictPill verdict={verdict} />
      <span className="capitalize" style={{
        color: review.status === 'completed' ? SUCCESS : review.status === 'failed' ? DANGER : AMBER
      }}>
        {review.status}
      </span>
      <span style={{ color: '#555' }}>{review.created_at ? fmtAgo(review.created_at) : '—'}</span>
    </div>
  );
}

// ── Greeting ──────────────────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const TABS = [
  { label: 'Overview',  href: '/dashboard'  },
  { label: 'Reviews',   href: '/reviews'    },
  { label: 'Analytics', href: '/analytics'  },
  { label: 'Team',      href: '/team'       },
];

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuthContext();
  const { data: repos } = useRepos();
  const connectedRepos = useMemo(() => (repos ?? []).filter(r => r.is_connected), [repos]);
  const primaryRepo = connectedRepos[0]?.full_name ?? null;

  const { data: summary, isLoading: sumLoading } = useAnalyticsSummary();
  const { data: timeline, isLoading: tlLoading } = useAnalyticsTimeline(14);
  const { data: insights, isLoading: insLoading } = useAnalyticsInsights(30);
  const { data: reviews, isLoading: revLoading } = useReviews({ limit: 8 });

  // Bar-chart data: last 14 days timeline
  const chartData = useMemo(() => {
    if (!timeline) return [];
    return timeline.slice(-14).map(t => ({
      date: fmtDate(t.date),
      completed: t.completed,
      failed: t.failed,
    }));
  }, [timeline]);

  // Sparkline arrays derived from timeline
  const sparkTotal    = useMemo(() => (timeline ?? []).slice(-13).map(t => t.total), [timeline]);
  const sparkCompleted= useMemo(() => (timeline ?? []).slice(-13).map(t => t.completed), [timeline]);
  const sparkFailed   = useMemo(() => (timeline ?? []).slice(-13).map(t => t.failed), [timeline]);
  const sparkAvgTime  = useMemo(() => (timeline ?? []).slice(-13).map(() => summary?.avg_processing_seconds ?? 0), [timeline, summary]);

  // Hover state for chart
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const maxIdx = useMemo(() => {
    if (!chartData.length) return -1;
    return chartData.reduce((mi, d, i) => (d.completed > chartData[mi].completed ? i : mi), 0);
  }, [chartData]);

  // Verdict totals
  const verdicts = insights?.verdicts ?? { APPROVE: 0, REQUEST_CHANGES: 0, NEEDS_DISCUSSION: 0 };
  const totalVerdicts = verdicts.APPROVE + verdicts.REQUEST_CHANGES + verdicts.NEEDS_DISCUSSION;

  const STAT_CARDS = [
    {
      label: 'Total Reviews',
      value: sumLoading ? '…' : String(summary?.total_reviews ?? 0),
      dot: AMBER,
      data: sparkTotal,
      color: AMBER,
      icon: GitPullRequest,
    },
    {
      label: 'Success Rate',
      value: sumLoading ? '…' : `${summary?.success_rate?.toFixed(1) ?? 0}%`,
      dot: SUCCESS,
      data: sparkCompleted,
      color: SUCCESS,
      icon: CheckCircle2,
    },
    {
      label: 'Approved',
      value: insLoading ? '…' : String(verdicts.APPROVE),
      dot: SUCCESS,
      data: sparkCompleted,
      color: SUCCESS,
      icon: CheckCircle2,
    },
    {
      label: 'Changes Requested',
      value: insLoading ? '…' : String(verdicts.REQUEST_CHANGES),
      dot: DANGER,
      data: sparkFailed,
      color: DANGER,
      icon: XCircle,
    },
    {
      label: 'Avg Process Time',
      value: sumLoading ? '…' : `${summary?.avg_processing_seconds?.toFixed(1) ?? 0}s`,
      dot: AMBER,
      data: sparkAvgTime,
      color: AMBER,
      icon: Clock,
    },
  ];

  return (
    <div className="min-h-screen -m-5 lg:-m-8" style={{ backgroundColor: '#0e0e0e', color: '#f0f0f0', fontFamily: 'var(--font-sans)' }}>

      {/* ── Greeting header ── */}
      <div className="flex items-start justify-between px-6 pt-6 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: '#f0f0f0' }}>
            {getGreeting()}, {user?.name?.split(' ')[0] ?? user?.github_username ?? 'there'}
          </h1>
          <p className="text-sm mt-1" style={{ color: '#555' }}>
            {connectedRepos.length > 0
              ? `${connectedRepos.length} repo${connectedRepos.length !== 1 ? 's' : ''} connected · ${sumLoading ? '…' : (summary?.total_reviews ?? 0)} total reviews`
              : 'Connect a repo to start getting AI reviews'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href="/repos"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-[background-color,transform] duration-150 active:scale-[0.97]"
            style={{ backgroundColor: '#1a1a1a', border: `1px solid ${BORDER}`, color: '#888' }}
          >
            <GitBranch size={11} /> Repos
          </Link>
          <Link
            href="/reviews"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-[background-color,transform] duration-150 active:scale-[0.97]"
            style={{ backgroundColor: 'rgba(245,192,0,0.12)', border: `1px solid rgba(245,192,0,0.25)`, color: AMBER }}
          >
            <GitPullRequest size={11} /> Reviews <ArrowRight size={10} />
          </Link>
        </div>
      </div>

      {/* ── Section tabs ── */}
      <div className="flex items-center justify-between px-6 border-b" style={{ borderColor: BORDER }}>
        <div className="flex">
          {TABS.map((tab, i) => (
            <Link
              key={tab.label}
              href={tab.href}
              className="relative px-4 py-3 text-sm font-medium transition-colors duration-150"
              style={{ color: i === 0 ? '#f0f0f0' : '#555' }}
              onMouseEnter={e => { if (i !== 0) (e.currentTarget as HTMLElement).style.color = '#aaa'; }}
              onMouseLeave={e => { if (i !== 0) (e.currentTarget as HTMLElement).style.color = '#555'; }}
            >
              {tab.label}
              {i === 0 && (
                <span className="absolute bottom-0 inset-x-3 h-[2px] rounded-full" style={{ backgroundColor: AMBER }} />
              )}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2 py-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-[background-color,transform] duration-150 hover:brightness-125 active:scale-[0.97]"
            style={{ backgroundColor: '#1a1a1a', border: `1px solid ${BORDER}`, color: '#666' }}>
            Last 30 days <ChevronDown size={11} />
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-[background-color,transform] duration-150 hover:brightness-125 active:scale-[0.97]"
            style={{ backgroundColor: '#1a1a1a', border: `1px solid ${BORDER}`, color: '#666' }}>
            <Download size={11} /> Export
          </button>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid" style={{
        gridTemplateColumns: 'repeat(5, 1fr)',
        borderBottom: `1px solid ${BORDER}`,
      }}>
        {STAT_CARDS.map((c, i) => (
          <div key={c.label} className="px-5 py-5 flex flex-col gap-3"
            style={{
              borderRight: i < STAT_CARDS.length - 1 ? `1px solid ${BORDER}` : 'none',
              animation: `dash-card-in 380ms cubic-bezier(0.23,1,0.32,1) ${i * 55}ms both`,
            }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium tracking-wide" style={{ color: '#555' }}>{c.label}</span>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.dot }} />
            </div>
            {sumLoading || insLoading ? (
              <Skeleton className="h-7 w-24 rounded" style={{ backgroundColor: '#1e1e1e' }} />
            ) : (
              <span className="text-2xl font-semibold tracking-tight">{c.value}</span>
            )}
            {tlLoading ? (
              <Skeleton className="h-9 w-full rounded" style={{ backgroundColor: '#1e1e1e' }} />
            ) : (
              <Sparkline data={c.data.length ? c.data : Array(13).fill(0)} color={c.color} />
            )}
          </div>
        ))}
      </div>

      {/* ── Charts row ── */}
      <div className="grid gap-5 p-6" style={{ gridTemplateColumns: '3fr 2fr' }}>

        {/* PR Reviews bar chart */}
        <div className="rounded-xl p-5" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-sm font-semibold">PR Reviews</p>
              <p className="text-xs mt-0.5" style={{ color: '#555' }}>Daily activity · last 14 days</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: SUCCESS }} />
                <span className="text-xs" style={{ color: '#555' }}>Completed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: DANGER }} />
                <span className="text-xs" style={{ color: '#555' }}>Failed</span>
              </div>
            </div>
          </div>

          {tlLoading ? (
            <Skeleton className="h-48 w-full rounded-lg" style={{ backgroundColor: '#1e1e1e' }} />
          ) : (
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={chartData} barCategoryGap="30%" barGap={2}
                onMouseLeave={() => setHoveredIdx(null)}>
                <XAxis dataKey="date" axisLine={false} tickLine={false}
                  tick={{ fill: '#444', fontSize: 11, fontFamily: 'var(--font-sans)' }} />
                <Tooltip content={<BarTip />} cursor={false} />
                <Bar dataKey="completed" name="completed" radius={[3,3,0,0]}
                  onMouseEnter={(_, idx) => setHoveredIdx(idx)}>
                  {chartData.map((_, idx) => {
                    const isHot = hoveredIdx !== null ? idx === hoveredIdx : idx === maxIdx;
                    return <Cell key={idx} fill={SUCCESS} fillOpacity={isHot ? 1 : 0.25} />;
                  })}
                </Bar>
                <Bar dataKey="failed" name="failed" radius={[3,3,0,0]}
                  onMouseEnter={(_, idx) => setHoveredIdx(idx)}>
                  {chartData.map((_, idx) => {
                    const isHot = hoveredIdx !== null ? idx === hoveredIdx : idx === maxIdx;
                    return <Cell key={idx} fill={DANGER} fillOpacity={isHot ? 1 : 0.25} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Verdict distribution panel */}
        <div className="rounded-xl p-5 flex flex-col gap-5" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
          <div>
            <p className="text-sm font-semibold">Verdict Distribution</p>
            <p className="text-xs mt-0.5" style={{ color: '#555' }}>Last 30 days · {totalVerdicts} reviews</p>
          </div>

          {insLoading ? (
            <Skeleton className="flex-1 rounded-lg" style={{ backgroundColor: '#1e1e1e' }} />
          ) : (
            <>
              <SegmentBar
                approve={verdicts.APPROVE}
                changes={verdicts.REQUEST_CHANGES}
                discuss={verdicts.NEEDS_DISCUSSION}
                total={totalVerdicts}
              />

              <div className="flex flex-col gap-4 mt-1">
                {[
                  { label: 'Approved',          value: verdicts.APPROVE,          color: SUCCESS, pct: totalVerdicts ? (verdicts.APPROVE/totalVerdicts)*100 : 0 },
                  { label: 'Changes Requested', value: verdicts.REQUEST_CHANGES,  color: DANGER,  pct: totalVerdicts ? (verdicts.REQUEST_CHANGES/totalVerdicts)*100 : 0 },
                  { label: 'Needs Discussion',  value: verdicts.NEEDS_DISCUSSION, color: AMBER,   pct: totalVerdicts ? (verdicts.NEEDS_DISCUSSION/totalVerdicts)*100 : 0 },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: row.color }} />
                      <span className="text-sm" style={{ color: '#888' }}>{row.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: BORDER }}>
                        <div className="h-full rounded-full" style={{ width: `${row.pct}%`, backgroundColor: row.color }} />
                      </div>
                      <span className="text-sm font-semibold tabular-nums w-6 text-right" style={{ color: row.color }}>
                        {row.value}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Issue breakdown */}
              {insights?.issue_categories && (
                <div className="mt-auto pt-4" style={{ borderTop: `1px solid ${BORDER}` }}>
                  <p className="text-xs font-medium mb-3" style={{ color: '#555' }}>Issues flagged</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Critical', value: insights.issue_categories.critical, color: DANGER },
                      { label: 'Moderate', value: insights.issue_categories.moderate, color: AMBER },
                      { label: 'Minor',    value: insights.issue_categories.minor,    color: '#555' },
                    ].map(b => (
                      <div key={b.label} className="rounded-lg p-3 text-center"
                        style={{ backgroundColor: '#0e0e0e', border: `1px solid ${BORDER}` }}>
                        <p className="text-lg font-bold" style={{ color: b.color }}>{b.value}</p>
                        <p className="text-[11px] mt-0.5" style={{ color: '#555' }}>{b.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Top Contributors ── */}
      <TopContributors repo={primaryRepo} />

      {/* ── Per-repo table ── */}
      {(insights?.per_repo?.length ?? 0) > 0 && (
        <div className="mx-6 mb-6 rounded-xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
          <div className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: `1px solid ${BORDER}`, backgroundColor: CARD }}>
            <div className="flex items-center gap-2">
              <Zap size={14} style={{ color: AMBER }} />
              <span className="text-sm font-semibold">Repository Activity</span>
            </div>
            <span className="text-xs" style={{ color: '#555' }}>Last 30 days</span>
          </div>

          {/* Column headers */}
          <div className="grid px-5 py-3 text-xs font-medium"
            style={{ gridTemplateColumns: '2fr 0.8fr 1.2fr 0.8fr 1fr 0.8fr',
                     color: '#444', borderBottom: `1px solid ${BORDER}`, backgroundColor: '#111' }}>
            {['Repository', 'PRs', 'Merge Rate', 'Issues', 'Top Verdict', 'Last PR'].map(h => (
              <span key={h}>{h}</span>
            ))}
          </div>

          {insLoading ? (
            <div className="p-5 space-y-3">
              {Array(3).fill(0).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded" style={{ backgroundColor: '#1a1a1a' }} />
              ))}
            </div>
          ) : (
            insights?.per_repo?.slice(0, 6).map((r) => (
              <RepoRow
                key={r.repo}
                repo={r.repo}
                prs={r.prs}
                mergeRate={r.merge_rate}
                issues={r.issues}
                verdict={r.merged > r.prs * 0.7 ? 'APPROVE' : r.issues > 3 ? 'REQUEST_CHANGES' : 'NEEDS_DISCUSSION'}
                last={`${r.prs} PR${r.prs !== 1 ? 's' : ''}`}
              />
            ))
          )}
        </div>
      )}

      {/* ── Recent reviews table ── */}
      <div className="mx-6 mb-8 rounded-xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: `1px solid ${BORDER}`, backgroundColor: CARD }}>
          <div className="flex items-center gap-3">
            <GitPullRequest size={14} style={{ color: AMBER }} />
            <span className="text-sm font-semibold">Recent PR Reviews</span>
            {!revLoading && (reviews ?? []).some(r => r.status === 'processing' || r.status === 'pending') && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                style={{ backgroundColor: 'rgba(245,192,0,0.1)', border: '1px solid rgba(245,192,0,0.2)', color: AMBER }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: AMBER }} />
                {(reviews ?? []).filter(r => r.status === 'processing' || r.status === 'pending').length} active
              </span>
            )}
          </div>
          <Link href="/reviews"
            className="flex items-center gap-1 text-xs font-medium transition-colors duration-150 hover:opacity-80"
            style={{ color: AMBER }}>
            View all <ArrowRight size={11} />
          </Link>
        </div>

        {/* Column headers */}
        <div className="grid px-5 py-3 text-xs font-medium"
          style={{ gridTemplateColumns: '2.8fr 1.4fr 1.1fr 0.9fr 1fr 1fr 0.9fr',
                   color: '#444', borderBottom: `1px solid ${BORDER}`, backgroundColor: '#111' }}>
          {['Pull Request', 'Repository', 'Author', 'Files', 'Verdict', 'Status', 'Time'].map(h => (
            <span key={h}>{h}</span>
          ))}
        </div>

        {revLoading ? (
          <div className="p-5 space-y-3">
            {Array(4).fill(0).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded" style={{ backgroundColor: '#1a1a1a' }} />
            ))}
          </div>
        ) : (reviews ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(245,192,0,0.08)', border: '1px solid rgba(245,192,0,0.15)' }}>
              <GitPullRequest size={20} style={{ color: AMBER }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold" style={{ color: '#888' }}>No PR reviews yet</p>
              <p className="text-xs mt-1" style={{ color: '#444' }}>Connect a repo and open a pull request to get your first AI review</p>
            </div>
            <Link href="/repos"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-[transform] duration-150 active:scale-[0.97]"
              style={{ backgroundColor: 'rgba(245,192,0,0.12)', border: '1px solid rgba(245,192,0,0.25)', color: AMBER }}>
              <GitBranch size={12} /> Connect a Repo
            </Link>
          </div>
        ) : (
          (reviews ?? []).map(r => <ReviewRow key={r.id} review={r} />)
        )}
      </div>
    </div>
  );
}
