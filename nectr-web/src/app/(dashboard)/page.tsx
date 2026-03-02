'use client';
import { useState } from 'react';
import { useAnalyticsSummary, useAnalyticsTimeline, useAnalyticsInsights } from '@/hooks/useAnalytics';
import { useReviews } from '@/hooks/useReviews';
import { useAuthContext } from '@/contexts/AuthContext';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import {
  GitPullRequest, CheckCircle, Clock, GitBranch, TrendingUp,
  Zap, AlertTriangle, BarChart3, ArrowRight,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const PIE_COLORS = ['#4ADB4A', '#DB4A4A', '#F5C000'];

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
