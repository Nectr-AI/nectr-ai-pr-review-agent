'use client';
import { useState, useMemo } from 'react';
import { useAnalyticsSummary, useAnalyticsTimeline, useAnalyticsInsights, useContributors } from '@/hooks/useAnalytics';
import { useRepos } from '@/hooks/useRepos';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie,
} from 'recharts';
import { cn } from '@/lib/utils';
import { BarChart3, TrendingUp, Users, GitMerge, Clock, ChevronDown, GitBranch, Calendar, GitPullRequest } from 'lucide-react';

const PIE_COLORS = ['#4ADB4A', '#DB4A4A', '#F5C000'];
const CONF_COLORS = ['#DB4A4A', '#F59E0B', '#F5C000', '#86EFAC', '#4ADB4A'];

const TIMEFRAME_OPTIONS = [
  { label: 'This week', value: 7 },
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 90 days', value: 90 },
];

// ── Filter Dropdown ───────────────────────────────────────────────────────────
function FilterDropdown({
  icon: Icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-lg border transition-all text-sm font-medium',
          open
            ? 'bg-surface-elevated border-amber/40 text-content-primary'
            : 'bg-surface-elevated border-surface-border text-content-secondary hover:border-amber/30 hover:text-content-primary',
        )}
      >
        <Icon size={14} className="text-content-muted flex-shrink-0" />
        <span className="font-mono text-xs uppercase tracking-wider text-content-muted mr-1">{label}</span>
        <span className="text-content-primary">{selected?.label ?? label}</span>
        <ChevronDown size={13} className={cn('text-content-muted transition-transform ml-1', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1.5 left-0 z-20 min-w-[180px] bg-surface-elevated border border-surface-border rounded-xl shadow-xl overflow-hidden animate-fade-in">
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={cn(
                  'w-full text-left px-4 py-2.5 text-sm transition-colors',
                  opt.value === value
                    ? 'bg-amber/10 text-amber font-semibold'
                    : 'text-content-secondary hover:bg-surface-subtle hover:text-content-primary',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Tab Button ────────────────────────────────────────────────────────────────
function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-5 py-3 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors',
        active
          ? 'border-amber text-amber -mb-0.5'
          : 'border-transparent text-content-secondary hover:text-content-primary',
      )}
    >
      {label}
    </button>
  );
}

// ── PR Size Area Chart ────────────────────────────────────────────────────────
function PRSizeChart({ data, isLoading }: {
  data: { additions: number; deletions: number; date: string }[];
  isLoading: boolean;
}) {
  const avgAdditions = data.length ? Math.round(data.reduce((s, d) => s + d.additions, 0) / data.length) : 0;
  const avgDeletions = data.length ? Math.round(data.reduce((s, d) => s + d.deletions, 0) / data.length) : 0;

  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(2)}k` : String(n);

  return (
    <div className="nectr-card">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <GitPullRequest size={14} className="text-content-muted" />
        <p className="label-mono">Average PR Size</p>
      </div>

      {isLoading ? (
        <Skeleton className="h-56 rounded-lg bg-surface-subtle mt-4" />
      ) : (
        <>
          {/* Chart */}
          <div className="mt-4 mb-0">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
                <defs>
                  <linearGradient id="gradAdditions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F5C000" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#F5C000" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gradDeletions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4ADB4A" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#4ADB4A" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gradDiff" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#DB4A4A" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#DB4A4A" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#555', fontSize: 10, fontFamily: 'Geist Mono' }}
                  tickFormatter={(d) => {
                    const dt = new Date(d);
                    return `${dt.getMonth() + 1}/${dt.getDate()}`;
                  }}
                  interval={Math.max(0, Math.floor(data.length / 5) - 1)}
                  label={{ value: 'DATE', position: 'insideBottom', offset: -2, fill: '#444', fontSize: 9, fontFamily: 'Geist Mono' }}
                />
                <YAxis
                  yAxisId="lines"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#555', fontSize: 10, fontFamily: 'Geist Mono' }}
                  tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                  label={{ value: 'LINES', angle: -90, position: 'insideLeft', offset: 16, fill: '#444', fontSize: 9, fontFamily: 'Geist Mono' }}
                />
                <Tooltip
                  contentStyle={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '8px', fontSize: '12px' }}
                  itemStyle={{ color: '#FFF' }}
                  labelStyle={{ color: '#888', fontFamily: 'Geist Mono', fontSize: '10px' }}
                  formatter={(value: number, name: string) => [value.toLocaleString(), name]}
                />
                {/* Additions — amber area */}
                <Area
                  yAxisId="lines"
                  type="monotone"
                  dataKey="additions"
                  stroke="#F5C000"
                  strokeWidth={1.5}
                  fill="url(#gradAdditions)"
                  name="Additions"
                  dot={false}
                />
                {/* Deletions — green area */}
                <Area
                  yAxisId="lines"
                  type="monotone"
                  dataKey="deletions"
                  stroke="#4ADB4A"
                  strokeWidth={1.5}
                  fill="url(#gradDeletions)"
                  name="Deletions"
                  dot={false}
                />
                {/* Net diff — red spike area */}
                <Area
                  yAxisId="lines"
                  type="monotone"
                  dataKey="net"
                  stroke="#DB4A4A"
                  strokeWidth={1.5}
                  fill="url(#gradDiff)"
                  name="Net change"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Stat strips — matches the image bottom bar */}
          <div className="grid grid-cols-3 border-t border-surface-border mt-1 divide-x divide-surface-border">
            <div className="px-5 py-4">
              <p className="label-mono mb-1">Average Additions</p>
              <p className="text-2xl font-black text-content-primary">{fmt(avgAdditions)}</p>
            </div>
            <div className="px-5 py-4">
              <p className="label-mono mb-1">Average Deletions</p>
              <p className="text-2xl font-black text-content-primary">{fmt(avgDeletions)}</p>
            </div>
            <div className="px-5 py-4">
              <p className="label-mono mb-1">Total PRs</p>
              <p className="text-2xl font-black text-content-primary">{data.length}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const [tab, setTab] = useState<'overview' | 'team' | 'repos' | 'insights'>('overview');
  const [days, setDays] = useState(30);
  const [selectedRepo, setSelectedRepo] = useState<string>('all');
  const [selectedAuthor, setSelectedAuthor] = useState<string>('all');

  const { data: summary, isLoading: sl } = useAnalyticsSummary();
  const { data: timeline, isLoading: tl } = useAnalyticsTimeline(days);
  const { data: insights, isLoading: il } = useAnalyticsInsights(days);
  const { data: repos } = useRepos();

  const connectedRepos = repos?.filter((r) => r.is_connected) ?? [];

  const repoOptions = useMemo(() => [
    { label: 'All repositories', value: 'all' },
    ...connectedRepos.map((r) => ({ label: r.full_name, value: r.full_name })),
  ], [connectedRepos]);

  const authorOptions = useMemo(() => [
    { label: 'All authors', value: 'all' },
    ...(insights?.per_author ?? []).map((a) => ({ label: `@${a.author}`, value: a.author })),
  ], [insights]);

  const repoForContrib = selectedRepo !== 'all' ? selectedRepo : (connectedRepos[0]?.full_name ?? null);
  const { data: contributors, isLoading: cl } = useContributors(repoForContrib);

  // ── PR Size chart data — built from last_week_activity ────────────────────
  const prSizeData = useMemo(() => {
    if (!summary?.last_week_activity) return [];
    return summary.last_week_activity
      .filter((pr) => selectedRepo === 'all' || pr.repo_name === selectedRepo)
      .filter((pr) => selectedAuthor === 'all' || pr.author === selectedAuthor)
      .map((pr, i) => ({
        date: pr.repo_name ? `PR #${pr.pr_number}` : `PR ${i + 1}`,
        additions: pr.additions,
        deletions: pr.deletions,
        net: Math.abs(pr.additions - pr.deletions),
      }));
  }, [summary, selectedRepo, selectedAuthor]);

  // ── Filtered data ─────────────────────────────────────────────────────────
  const filteredPerRepo = useMemo(() => {
    if (!insights) return [];
    if (selectedRepo === 'all') return insights.per_repo;
    return insights.per_repo.filter((r) => r.repo === selectedRepo);
  }, [insights, selectedRepo]);

  const filteredPerAuthor = useMemo(() => {
    if (!insights) return [];
    if (selectedAuthor === 'all') return insights.per_author;
    return insights.per_author.filter((a) => a.author === selectedAuthor);
  }, [insights, selectedAuthor]);

  const filteredContributors = useMemo(() => {
    if (!contributors) return [];
    if (selectedAuthor === 'all') return contributors.contributors;
    return contributors.contributors.filter((c) => c.username === selectedAuthor);
  }, [contributors, selectedAuthor]);

  const verdictData = useMemo(() => {
    if (!insights) return [];
    if (selectedAuthor === 'all' && selectedRepo === 'all') {
      return [
        { name: 'Approve', value: insights.verdicts.APPROVE },
        { name: 'Request Changes', value: insights.verdicts.REQUEST_CHANGES },
        { name: 'Discussion', value: insights.verdicts.NEEDS_DISCUSSION },
      ];
    }
    const total = filteredPerAuthor.reduce((s, a) => s + a.prs, 0);
    const merged = filteredPerAuthor.reduce((s, a) => s + a.merged, 0);
    return [
      { name: 'Approve', value: merged },
      { name: 'Request Changes', value: filteredPerAuthor.reduce((s, a) => s + a.issues_flagged, 0) },
      { name: 'Discussion', value: Math.max(0, total - merged) },
    ];
  }, [insights, selectedAuthor, selectedRepo, filteredPerAuthor]);

  const confData = insights
    ? Object.entries(insights.confidence_distribution).map(([k, v]) => ({ name: `${k}/5`, value: v }))
    : [];

  const timeframeLabel = TIMEFRAME_OPTIONS.find((o) => o.value === days)?.label ?? `${days}d`;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-h1 font-black tracking-tight">Analytics</h1>
          <p className="text-content-secondary text-body mt-1">
            Team performance and code quality insights
          </p>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-2">
          <FilterDropdown icon={GitBranch} label="Repo" value={selectedRepo} options={repoOptions} onChange={setSelectedRepo} />
          <FilterDropdown icon={Users} label="Author" value={selectedAuthor} options={authorOptions} onChange={setSelectedAuthor} />
          <FilterDropdown
            icon={Calendar}
            label="Time"
            value={String(days)}
            options={TIMEFRAME_OPTIONS.map((o) => ({ ...o, value: String(o.value) }))}
            onChange={(v) => setDays(Number(v))}
          />

          {(selectedRepo !== 'all' || selectedAuthor !== 'all') && (
            <div className="flex items-center gap-2 ml-1">
              {selectedRepo !== 'all' && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber/10 border border-amber/20 text-amber text-xs font-mono">
                  {selectedRepo}
                  <button onClick={() => setSelectedRepo('all')} className="hover:text-white transition-colors">✕</button>
                </span>
              )}
              {selectedAuthor !== 'all' && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber/10 border border-amber/20 text-amber text-xs font-mono">
                  @{selectedAuthor}
                  <button onClick={() => setSelectedAuthor('all')} className="hover:text-white transition-colors">✕</button>
                </span>
              )}
              <button
                onClick={() => { setSelectedRepo('all'); setSelectedAuthor('all'); }}
                className="text-xs text-content-muted hover:text-content-secondary transition-colors underline underline-offset-2"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-surface-border overflow-x-auto">
        {(['overview', 'team', 'repos', 'insights'] as const).map((t) => (
          <TabBtn key={t} label={t} active={tab === t} onClick={() => setTab(t)} />
        ))}
      </div>

      {/* ── Overview Tab ─────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {sl ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl bg-surface-elevated" />
            )) : (
              <>
                {[
                  { label: 'Total PRs', value: summary?.total_reviews ?? 0, icon: BarChart3 },
                  { label: 'Success Rate', value: `${summary?.success_rate ?? 0}%`, icon: TrendingUp },
                  { label: 'Avg Merge Time', value: summary?.avg_merge_hours ? `${summary.avg_merge_hours}h` : '—', icon: Clock },
                  { label: 'Avg PR Size', value: summary?.avg_pr_size ? `${summary.avg_pr_size} LOC` : '—', icon: GitMerge },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="nectr-card flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="label-mono">{label}</span>
                      <Icon size={15} className="text-content-muted" />
                    </div>
                    <p className="text-h2 font-black">{value}</p>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* PR Size Area Chart — full width */}
          <PRSizeChart data={prSizeData} isLoading={sl} />

          {/* Timeline + Verdict */}
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 nectr-card">
              <div className="flex items-center justify-between mb-1">
                <p className="label-mono">Activity Timeline</p>
                <span className="text-xs text-content-muted font-mono">{timeframeLabel}</span>
              </div>
              <p className="text-h3 font-black mb-5">Reviews over time</p>
              {tl ? <Skeleton className="h-48 rounded-lg bg-surface-subtle" /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={timeline} margin={{ top: 5, right: 5, bottom: 5, left: -25 }}>
                    <XAxis dataKey="date" tickLine={false} axisLine={false}
                      tick={{ fill: '#444', fontSize: 10, fontFamily: 'Geist Mono' }}
                      tickFormatter={(d) => { const dt = new Date(d); return `${dt.getMonth() + 1}/${dt.getDate()}`; }}
                      interval={Math.floor((timeline?.length ?? 30) / 6)}
                    />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: '#444', fontSize: 10, fontFamily: 'Geist Mono' }} />
                    <Tooltip
                      contentStyle={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '8px', fontSize: '12px' }}
                      itemStyle={{ color: '#FFF' }}
                      labelStyle={{ color: '#888', fontFamily: 'Geist Mono' }}
                    />
                    <Line type="monotone" dataKey="total" stroke="#F5C000" strokeWidth={2} dot={false} name="Total" />
                    <Line type="monotone" dataKey="completed" stroke="#4ADB4A" strokeWidth={1.5} dot={false} name="Completed" />
                    <Line type="monotone" dataKey="failed" stroke="#DB4A4A" strokeWidth={1.5} dot={false} name="Failed" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="nectr-card">
              <p className="label-mono mb-1">Verdicts</p>
              <p className="text-h3 font-black mb-5">AI decisions</p>
              {il ? <Skeleton className="h-48 rounded-lg bg-surface-subtle" /> : (
                <>
                  <ResponsiveContainer width="100%" height={140}>
                    <PieChart>
                      <Pie data={verdictData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={4} dataKey="value">
                        {verdictData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '8px', fontSize: '12px' }}
                        itemStyle={{ color: '#FFF' }}
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
        </div>
      )}

      {/* ── Team Tab ─────────────────────────────────────────────────────── */}
      {tab === 'team' && (
        <div className="space-y-6">
          {cl ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl bg-surface-elevated" />
              ))}
            </div>
          ) : filteredContributors.length === 0 ? (
            <div className="nectr-card flex flex-col items-center py-16 gap-3">
              <Users size={28} className="text-content-muted" />
              <p className="text-content-secondary text-sm">
                {selectedAuthor !== 'all'
                  ? `No contributor data for @${selectedAuthor} yet.`
                  : 'No contributor data yet. Connect a repo and complete some reviews.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredContributors.map((c) => (
                <div key={c.username} className="nectr-card hover:border-amber/20 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-amber/10 flex items-center justify-center text-amber font-black text-sm flex-shrink-0">
                      {c.username[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <p className="font-bold text-sm">@{c.username}</p>
                        <span className="badge-completed text-xs">{c.pr_count} PRs</span>
                      </div>
                      {c.profile_summary && (
                        <p className="text-content-secondary text-xs leading-relaxed mb-3 line-clamp-2">{c.profile_summary}</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {c.strengths.slice(0, 3).map((s, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-full bg-success/10 text-success text-caption font-mono border border-success/20">
                            {s.length > 40 ? s.slice(0, 40) + '…' : s}
                          </span>
                        ))}
                        {c.patterns.slice(0, 2).map((p, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-full bg-amber/10 text-amber text-caption font-mono border border-amber/20">
                            {p.length > 40 ? p.slice(0, 40) + '…' : p}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Repos Tab ────────────────────────────────────────────────────── */}
      {tab === 'repos' && (
        <div className="nectr-card p-0 overflow-hidden">
          <div className="grid grid-cols-4 px-5 py-3 border-b border-surface-border bg-surface-subtle">
            {['Repository', 'PRs', 'Merged', 'Issues'].map((h) => (
              <span key={h} className="label-mono">{h}</span>
            ))}
          </div>
          {il ? (
            <div className="divide-y divide-surface-border">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="px-5 py-4"><Skeleton className="h-4 w-full bg-surface-subtle" /></div>
              ))}
            </div>
          ) : filteredPerRepo.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-content-secondary text-sm">
              {selectedRepo !== 'all' ? `No data for ${selectedRepo}.` : 'No repo data yet.'}
            </div>
          ) : (
            <div className="divide-y divide-surface-border">
              {filteredPerRepo.map((r) => (
                <div key={r.repo} className="grid grid-cols-4 px-5 py-4 items-center hover:bg-surface-subtle transition-colors">
                  <span className="font-mono text-sm font-medium truncate">{r.repo}</span>
                  <span className="text-sm">{r.prs}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{r.merged}</span>
                    <span className="text-xs text-content-secondary">({r.merge_rate}%)</span>
                  </div>
                  <span className="text-sm text-danger">{r.issues}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Insights Tab ─────────────────────────────────────────────────── */}
      {tab === 'insights' && (
        <div className="space-y-6">
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Confidence distribution */}
            <div className="nectr-card">
              <p className="label-mono mb-1">Confidence Distribution</p>
              <p className="text-h3 font-black mb-5">AI confidence scores</p>
              {il ? <Skeleton className="h-48 rounded-lg bg-surface-subtle" /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={confData} margin={{ top: 5, right: 5, bottom: 5, left: -25 }}>
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#888', fontSize: 11, fontFamily: 'Geist Mono' }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: '#444', fontSize: 10, fontFamily: 'Geist Mono' }} />
                    <Tooltip
                      contentStyle={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '8px', fontSize: '12px' }}
                      itemStyle={{ color: '#FFF' }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {confData.map((_, i) => <Cell key={i} fill={CONF_COLORS[i]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Merge time stats */}
            <div className="nectr-card">
              <p className="label-mono mb-1">Merge Time</p>
              <p className="text-h3 font-black mb-5">Time to merge stats</p>
              {il ? <Skeleton className="h-48 rounded-lg bg-surface-subtle" /> : (
                <div className="grid grid-cols-2 gap-4 mt-6">
                  {[
                    { label: 'Avg', value: insights?.merge_time.avg_hours ? `${insights.merge_time.avg_hours}h` : '—' },
                    { label: 'Median', value: insights?.merge_time.median_hours ? `${insights.merge_time.median_hours}h` : '—' },
                    { label: 'Fastest', value: insights?.merge_time.fastest_hours ? `${insights.merge_time.fastest_hours}h` : '—' },
                    { label: 'Slowest', value: insights?.merge_time.slowest_hours ? `${insights.merge_time.slowest_hours}h` : '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-surface-subtle rounded-lg p-4">
                      <p className="label-mono mb-2">{label}</p>
                      <p className="text-h2 font-black text-amber">{value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Per author table */}
          <div className="nectr-card p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-border">
              <p className="label-mono mb-1">Author Performance</p>
              <p className="text-h3 font-black">Per-developer breakdown</p>
            </div>
            <div className="grid grid-cols-5 px-5 py-3 border-b border-surface-border bg-surface-subtle">
              {['Author', 'PRs', 'Merged', 'Issues', 'Confidence'].map((h) => (
                <span key={h} className="label-mono">{h}</span>
              ))}
            </div>
            {il ? (
              <div className="divide-y divide-surface-border">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="px-5 py-4"><Skeleton className="h-4 w-full bg-surface-subtle" /></div>
                ))}
              </div>
            ) : filteredPerAuthor.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-content-secondary text-sm">
                No author data for current filters.
              </div>
            ) : (
              <div className="divide-y divide-surface-border">
                {filteredPerAuthor.map((a) => (
                  <div key={a.author} className="grid grid-cols-5 px-5 py-3.5 items-center hover:bg-surface-subtle transition-colors">
                    <span className="font-mono text-sm font-medium">@{a.author}</span>
                    <span className="text-sm">{a.prs}</span>
                    <span className="text-sm text-success">{a.merged}</span>
                    <span className="text-sm text-danger">{a.issues_flagged}</span>
                    <span className="text-sm font-mono">{a.avg_confidence ? `${a.avg_confidence}/5` : '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
