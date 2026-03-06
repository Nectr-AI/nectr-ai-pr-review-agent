'use client';
import { useState, useMemo } from 'react';
import { useAnalyticsSummary, useAnalyticsTimeline, useAnalyticsInsights, useGraphAnalytics } from '@/hooks/useAnalytics';
import { useReviews } from '@/hooks/useReviews';
import { useRepos } from '@/hooks/useRepos';
import { useAuthContext } from '@/contexts/AuthContext';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import {
  GitPullRequest, CheckCircle, Clock, GitBranch, TrendingUp,
  Zap, AlertTriangle, BarChart3, ArrowRight, Flame, ShieldAlert,
  FileX2, Users, ChevronDown, Activity,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { GraphAnalytics } from '@/types';

const PIE_COLORS = ['#4ADB4A', '#DB4A4A', '#F5C000'];

// ── Language colours (consistent across renders) ──────────────────────────────
const LANG_COLORS = [
  '#F5C000', '#4ADB4A', '#4A9FDB', '#DB4A9F', '#9F4ADB',
  '#DB9F4A', '#4ADBDB', '#DB4A4A', '#888888', '#AAAAAA',
];

function shortPath(path: string, maxLen = 38) {
  if (path.length <= maxLen) return path;
  const parts = path.split('/');
  if (parts.length > 2) return `…/${parts.slice(-2).join('/')}`;
  return path.slice(-maxLen);
}

// ── Repo Intelligence ─────────────────────────────────────────────────────────
function RepoIntelligence({ data, loading }: { data: GraphAnalytics | undefined; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid lg:grid-cols-2 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-56 rounded-xl bg-surface-elevated" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const hasHotspots = data.file_hotspots.length > 0;
  const hasRisk     = data.high_risk_files.length > 0;
  const hasOwner    = data.code_ownership.length > 0;
  const hasExpert   = data.developer_expertise.length > 0;
  const maxHot      = data.file_hotspots[0]?.pr_count || 1;
  const maxRisk     = data.high_risk_files[0]?.risk_count || 1;

  return (
    <div className="grid lg:grid-cols-2 gap-6">

      {/* Language Distribution */}
      <div className="nectr-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="label-mono mb-1">Codebase</p>
            <p className="text-h3 font-black">Language Distribution</p>
          </div>
          <Activity size={18} className="text-amber" />
        </div>
        {data.languages.length === 0 ? (
          <p className="text-content-muted text-sm">No language data</p>
        ) : (
          <div className="space-y-2.5">
            {data.languages.slice(0, 8).map((lang, i) => (
              <div key={lang.name}>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-content-secondary">{lang.name}</span>
                  <span className="text-content-primary font-bold">{lang.pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-subtle overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${lang.pct}%`, backgroundColor: LANG_COLORS[i % LANG_COLORS.length] }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* File Hotspots */}
      <div className="nectr-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="label-mono mb-1">Churn</p>
            <p className="text-h3 font-black">File Hotspots</p>
          </div>
          <Flame size={18} className="text-amber" />
        </div>
        {!hasHotspots ? (
          <p className="text-content-muted text-sm">No PR data yet — hotspots appear after PRs are reviewed</p>
        ) : (
          <div className="space-y-2">
            {data.file_hotspots.slice(0, 8).map((f) => (
              <div key={f.path} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-content-primary truncate" title={f.path}>
                    {shortPath(f.path)}
                  </p>
                  <div className="h-1 mt-1 rounded-full bg-surface-subtle overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber transition-all duration-700"
                      style={{ width: `${Math.round((f.pr_count / maxHot) * 100)}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs font-bold font-mono text-amber shrink-0">{f.pr_count} PRs</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Code Ownership */}
      <div className="nectr-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="label-mono mb-1">Ownership</p>
            <p className="text-h3 font-black">Code Ownership</p>
          </div>
          <Users size={18} className="text-amber" />
        </div>
        {!hasOwner ? (
          <p className="text-content-muted text-sm">Ownership map builds after PRs are reviewed</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="text-left pb-2 text-content-muted font-normal">File</th>
                  <th className="text-left pb-2 text-content-muted font-normal">Owner</th>
                  <th className="text-right pb-2 text-content-muted font-normal">Touches</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {data.code_ownership.slice(0, 8).map((row) => (
                  <tr key={row.path} className="group">
                    <td className="py-1.5 pr-2 text-content-secondary truncate max-w-[180px]" title={row.path}>
                      {shortPath(row.path, 28)}
                    </td>
                    <td className="py-1.5 pr-2 text-amber">@{row.owner}</td>
                    <td className="py-1.5 text-right text-content-primary font-bold">{row.total_touches}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* High Risk Files */}
      <div className="nectr-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="label-mono mb-1">Quality</p>
            <p className="text-h3 font-black">High Risk Files</p>
          </div>
          <ShieldAlert size={18} className="text-danger" />
        </div>
        {!hasRisk ? (
          <p className="text-content-muted text-sm">No REQUEST_CHANGES verdicts yet — great sign! 🎉</p>
        ) : (
          <div className="space-y-2">
            {data.high_risk_files.slice(0, 8).map((f) => (
              <div key={f.path} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-content-primary truncate" title={f.path}>
                    {shortPath(f.path)}
                  </p>
                  <div className="h-1 mt-1 rounded-full bg-surface-subtle overflow-hidden">
                    <div
                      className="h-full rounded-full bg-danger transition-all duration-700"
                      style={{ width: `${Math.round((f.risk_count / maxRisk) * 100)}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs font-bold font-mono text-danger shrink-0">{f.risk_count}×</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Developer Expertise */}
      <div className="nectr-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="label-mono mb-1">Expertise</p>
            <p className="text-h3 font-black">Dev Expertise Map</p>
          </div>
          <Users size={18} className="text-amber" />
        </div>
        {!hasExpert ? (
          <p className="text-content-muted text-sm">Expertise map builds after PRs are reviewed</p>
        ) : (
          <div className="space-y-3">
            {data.developer_expertise.slice(0, 5).map((dev) => (
              <div key={dev.dev}>
                <p className="text-xs font-mono text-amber mb-1">@{dev.dev}</p>
                <div className="flex flex-wrap gap-1.5">
                  {dev.top_dirs.map((d) => (
                    <span
                      key={d.directory}
                      className="px-2 py-0.5 rounded-md text-xs font-mono bg-surface-subtle text-content-secondary border border-surface-border"
                      title={`${d.touches} touches`}
                    >
                      {d.directory}
                      <span className="text-content-muted ml-1">×{d.touches}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dead Files */}
      <div className="nectr-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="label-mono mb-1">Stale Code</p>
            <p className="text-h3 font-black">Dead Files</p>
          </div>
          <FileX2 size={18} className="text-content-muted" />
        </div>
        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-4xl font-black font-mono text-content-primary">
            {data.dead_files.count}
          </span>
          <span className="text-content-secondary text-sm">files never reviewed</span>
        </div>
        {data.dead_files.sample.length > 0 && (
          <div className="space-y-1">
            {data.dead_files.sample.slice(0, 6).map((f) => (
              <p key={f.path} className="text-xs font-mono text-content-muted truncate" title={f.path}>
                {shortPath(f.path)}
              </p>
            ))}
            {data.dead_files.count > 6 && (
              <p className="text-xs text-content-muted">
                +{data.dead_files.count - 6} more
              </p>
            )}
          </div>
        )}
        {data.dead_files.count === 0 && (
          <p className="text-content-muted text-sm">All files have been touched by at least one reviewed PR ✅</p>
        )}
      </div>

    </div>
  );
}

function TimeRangeSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1 bg-surface-subtle border border-surface-border rounded-lg p-1">
      {[7, 30, 90].map((d) => (
        <button
          key={d}
          onClick={() => onChange(d)}
          className={cn(
            'px-3 py-1 text-xs font-mono uppercase tracking-wider rounded-md transition-colors',
            value === d
              ? 'bg-amber text-surface font-bold'
              : 'text-content-secondary hover:text-content-primary',
          )}
        >
          {d}d
        </button>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [days, setDays] = useState(30);
  const { user } = useAuthContext();
  const { data: summary, isLoading: summaryLoading } = useAnalyticsSummary();
  const { data: timeline, isLoading: timelineLoading } = useAnalyticsTimeline(days);
  const { data: insights, isLoading: insightsLoading } = useAnalyticsInsights(days);
  const { data: reviews, isLoading: reviewsLoading } = useReviews({ limit: 5 });
  const { data: repos } = useRepos();

  // Auto-select first connected repo for Repo Intelligence
  const connectedRepos = useMemo(() => repos?.filter((r) => r.is_connected) ?? [], [repos]);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const activeRepo = selectedRepo ?? connectedRepos[0]?.full_name ?? null;
  const { data: graphData, isLoading: graphLoading } = useGraphAnalytics(activeRepo);

  const verdictData = insights
    ? [
        { name: 'Approve', value: insights.verdicts.APPROVE },
        { name: 'Request Changes', value: insights.verdicts.REQUEST_CHANGES },
        { name: 'Discuss', value: insights.verdicts.NEEDS_DISCUSSION },
      ]
    : [];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-h1 font-black tracking-tight">
            Good {getTimeOfDay()},{' '}
            <span className="text-amber">{user?.name?.split(' ')[0] || user?.github_username}</span>
          </h1>
          <p className="text-content-secondary text-body mt-1">
            Here&rsquo;s what&rsquo;s happening across your connected repos.
          </p>
        </div>
        <TimeRangeSelector value={days} onChange={setDays} />
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl bg-surface-elevated" />
          ))
        ) : (
          <>
            <StatsCard
              label="Total Reviews"
              value={summary?.total_reviews ?? 0}
              icon={GitPullRequest}
              sub={`${summary?.reviews_this_week ?? 0} this week`}
              trend="up"
              trendValue={`${summary?.reviews_today ?? 0} today`}
              accent
            />
            <StatsCard
              label="Success Rate"
              value={`${summary?.success_rate ?? 0}%`}
              icon={CheckCircle}
              sub="Reviews completed"
            />
            <StatsCard
              label="Avg Process Time"
              value={`${summary?.avg_processing_seconds ?? 0}s`}
              icon={Clock}
              sub="Per PR review"
            />
            <StatsCard
              label="Connected Repos"
              value={summary?.connected_repos ?? 0}
              icon={GitBranch}
              sub="Watching for PRs"
            />
          </>
        )}
      </div>

      {/* Charts row */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Timeline */}
        <div className="lg:col-span-2 nectr-card">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="label-mono mb-1">Review Activity</p>
              <p className="text-h3 font-black">Last {days} days</p>
            </div>
            <TrendingUp size={18} className="text-amber" />
          </div>
          {timelineLoading ? (
            <Skeleton className="h-48 rounded-lg bg-surface-subtle" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={timeline} margin={{ top: 5, right: 5, bottom: 5, left: -25 }}>
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#444444', fontSize: 10, fontFamily: 'Geist Mono' }}
                  tickFormatter={(d) => {
                    const dt = new Date(d);
                    return `${dt.getMonth() + 1}/${dt.getDate()}`;
                  }}
                  interval={Math.floor((timeline?.length ?? 30) / 6)}
                />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: '#444444', fontSize: 10, fontFamily: 'Geist Mono' }} />
                <Tooltip
                  contentStyle={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '8px', fontSize: '12px' }}
                  labelStyle={{ color: '#888888', fontFamily: 'Geist Mono' }}
                  itemStyle={{ color: '#FFFFFF' }}
                />
                <Line type="monotone" dataKey="total" stroke="#F5C000" strokeWidth={2} dot={false} name="Total" />
                <Line type="monotone" dataKey="completed" stroke="#4ADB4A" strokeWidth={1.5} dot={false} name="Completed" />
                <Line type="monotone" dataKey="failed" stroke="#DB4A4A" strokeWidth={1.5} dot={false} name="Failed" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Verdict pie */}
        <div className="nectr-card">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="label-mono mb-1">Verdicts</p>
              <p className="text-h3 font-black">AI Decisions</p>
            </div>
            <BarChart3 size={18} className="text-amber" />
          </div>
          {insightsLoading ? (
            <Skeleton className="h-48 rounded-lg bg-surface-subtle" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie
                    data={verdictData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {verdictData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '8px', fontSize: '12px' }}
                    itemStyle={{ color: '#FFFFFF' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {verdictData.map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i] }} />
                      <span className="text-content-secondary font-mono">{d.name}</span>
                    </div>
                    <span className="font-bold">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Past week activity */}
      {(summary?.last_week_activity?.length ?? 0) > 0 && (
        <div className="nectr-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="label-mono mb-1">This Week</p>
              <p className="text-h3 font-black">Recent PR Activity</p>
            </div>
            <Activity size={18} className="text-amber" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="text-left pb-2 text-content-muted font-normal">PR</th>
                  <th className="text-left pb-2 text-content-muted font-normal">Repo</th>
                  <th className="text-left pb-2 text-content-muted font-normal">Author</th>
                  <th className="text-right pb-2 text-content-muted font-normal">+/−</th>
                  <th className="text-right pb-2 text-content-muted font-normal">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {summary!.last_week_activity.slice(0, 8).map((pr) => (
                  <tr key={`${pr.repo_name}-${pr.pr_number}`}>
                    <td className="py-1.5 pr-3 text-content-primary truncate max-w-[200px]" title={pr.title}>
                      {pr.title?.slice(0, 40) || `#${pr.pr_number}`}
                    </td>
                    <td className="py-1.5 pr-3 text-content-secondary">{pr.repo_name?.split('/')[1] ?? pr.repo_name}</td>
                    <td className="py-1.5 pr-3 text-amber">@{pr.author}</td>
                    <td className="py-1.5 pr-3 text-right">
                      <span className="text-success">+{pr.additions}</span>
                      <span className="text-content-muted mx-0.5">/</span>
                      <span className="text-danger">-{pr.deletions}</span>
                    </td>
                    <td className="py-1.5 text-right">
                      <span className={cn(
                        'px-1.5 py-0.5 rounded text-xs',
                        pr.state === 'merged' ? 'bg-success/10 text-success' :
                        pr.state === 'closed' ? 'bg-surface-subtle text-content-muted' :
                        'bg-amber/10 text-amber'
                      )}>
                        {pr.state}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Repo Intelligence */}
      {activeRepo && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="label-mono mb-1">Graph Analytics</p>
              <p className="text-h2 font-black">Repo Intelligence</p>
            </div>
            {connectedRepos.length > 1 && (
              <div className="relative">
                <select
                  value={activeRepo}
                  onChange={(e) => setSelectedRepo(e.target.value)}
                  className="appearance-none pl-3 pr-8 py-2 text-xs font-mono bg-surface-subtle border border-surface-border rounded-lg text-content-primary focus:outline-none focus:border-amber cursor-pointer"
                >
                  {connectedRepos.map((r) => (
                    <option key={r.full_name} value={r.full_name}>{r.full_name}</option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-muted pointer-events-none" />
              </div>
            )}
          </div>
          <RepoIntelligence data={graphData} loading={graphLoading} />
        </div>
      )}

      {/* Bottom row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Issue breakdown */}
        <div className="nectr-card">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="label-mono mb-1">Issues Detected</p>
              <p className="text-h3 font-black">By Severity</p>
            </div>
            <AlertTriangle size={18} className="text-amber" />
          </div>
          {insightsLoading ? (
            <Skeleton className="h-40 rounded-lg bg-surface-subtle" />
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart
                data={[
                  { name: 'Critical', value: insights?.issue_categories.critical ?? 0, fill: '#DB4A4A' },
                  { name: 'Moderate', value: insights?.issue_categories.moderate ?? 0, fill: '#F5C000' },
                  { name: 'Minor',    value: insights?.issue_categories.minor ?? 0,    fill: '#4ADB4A' },
                ]}
                margin={{ top: 5, right: 5, bottom: 5, left: -25 }}
              >
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#888888', fontSize: 11, fontFamily: 'Geist Mono' }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: '#444444', fontSize: 10, fontFamily: 'Geist Mono' }} />
                <Tooltip
                  contentStyle={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '8px', fontSize: '12px' }}
                  itemStyle={{ color: '#FFFFFF' }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {[0, 1, 2].map((i) => (
                    <Cell key={i} fill={['#DB4A4A', '#F5C000', '#4ADB4A'][i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Recent reviews */}
        <div className="nectr-card">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="label-mono mb-1">Recent Reviews</p>
              <p className="text-h3 font-black">Latest PRs</p>
            </div>
            <Link href="/reviews" className="flex items-center gap-1.5 text-amber text-xs font-mono hover:underline">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          {reviewsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg bg-surface-subtle" />
              ))}
            </div>
          ) : reviews?.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-3">
              <Zap size={24} className="text-content-muted" />
              <p className="text-content-secondary text-sm">No reviews yet</p>
              <Link href="/repos" className="btn-nectr-primary text-xs">Connect a Repo</Link>
            </div>
          ) : (
            <div className="space-y-2">
              {reviews?.slice(0, 5).map((r) => (
                <Link
                  key={r.id}
                  href={`/reviews/${r.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-surface-subtle transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate group-hover:text-amber transition-colors">
                      {r.pr_title || `PR #${r.pr_number}`}
                    </p>
                    <p className="text-caption font-mono text-content-secondary truncate">
                      {r.repo_name} · {r.author}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
