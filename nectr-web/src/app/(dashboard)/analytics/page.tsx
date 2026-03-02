'use client';
import { useState } from 'react';
import { useAnalyticsSummary, useAnalyticsTimeline, useAnalyticsInsights, useContributors } from '@/hooks/useAnalytics';
import { useRepos } from '@/hooks/useRepos';
import { Skeleton } from '@/components/ui/skeleton';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie,
} from 'recharts';
import { cn } from '@/lib/utils';
import { BarChart3, TrendingUp, Users, GitMerge, Clock } from 'lucide-react';

const PIE_COLORS = ['#4ADB4A', '#DB4A4A', '#F5C000'];
const CONF_COLORS = ['#DB4A4A', '#F59E0B', '#F5C000', '#86EFAC', '#4ADB4A'];

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

function DayPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1 bg-surface-subtle border border-surface-border rounded-lg p-1">
      {[7, 30, 90].map((d) => (
        <button
          key={d}
          onClick={() => onChange(d)}
          className={cn(
            'px-3 py-1 text-xs font-mono uppercase tracking-wider rounded-md transition-colors',
            value === d ? 'bg-amber text-surface font-bold' : 'text-content-secondary hover:text-content-primary',
          )}
        >
          {d}d
        </button>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const [tab, setTab] = useState<'overview' | 'team' | 'repos' | 'insights'>('overview');
  const [days, setDays] = useState(30);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);

  const { data: summary, isLoading: sl } = useAnalyticsSummary();
  const { data: timeline, isLoading: tl } = useAnalyticsTimeline(days);
  const { data: insights, isLoading: il } = useAnalyticsInsights(days);
  const { data: repos } = useRepos();
  const connectedRepos = repos?.filter((r) => r.is_connected) ?? [];
  const repoForContrib = selectedRepo ?? connectedRepos[0]?.full_name ?? null;
  const { data: contributors, isLoading: cl } = useContributors(repoForContrib);

  const verdictData = insights
    ? [
        { name: 'Approve', value: insights.verdicts.APPROVE },
        { name: 'Request Changes', value: insights.verdicts.REQUEST_CHANGES },
        { name: 'Discussion', value: insights.verdicts.NEEDS_DISCUSSION },
      ]
    : [];

  const confData = insights
    ? Object.entries(insights.confidence_distribution).map(([k, v]) => ({ name: `${k}/5`, value: v }))
    : [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-h1 font-black tracking-tight">Analytics</h1>
          <p className="text-content-secondary text-body mt-1">
            Team performance and code quality insights
          </p>
        </div>
        <DayPicker value={days} onChange={setDays} />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-surface-border overflow-x-auto">
        {(['overview', 'team', 'repos', 'insights'] as const).map((t) => (
          <TabBtn key={t} label={t} active={tab === t} onClick={() => setTab(t)} />
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {sl ? Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-28 rounded-xl bg-surface-elevated"/>) : (
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

          {/* Timeline + Verdict */}
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 nectr-card">
              <p className="label-mono mb-1">Activity Timeline</p>
              <p className="text-h3 font-black mb-5">Reviews over time</p>
              {tl ? <Skeleton className="h-48 rounded-lg bg-surface-subtle"/> : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={timeline} margin={{top:5,right:5,bottom:5,left:-25}}>
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{fill:'#444',fontSize:10,fontFamily:'Geist Mono'}}
                      tickFormatter={(d)=>{const dt=new Date(d);return `${dt.getMonth()+1}/${dt.getDate()}`;}}
                      interval={Math.floor((timeline?.length??30)/6)}
                    />
                    <YAxis tickLine={false} axisLine={false} tick={{fill:'#444',fontSize:10,fontFamily:'Geist Mono'}}/>
                    <Tooltip contentStyle={{background:'#1A1A1A',border:'1px solid #2A2A2A',borderRadius:'8px',fontSize:'12px'}} itemStyle={{color:'#FFF'}} labelStyle={{color:'#888',fontFamily:'Geist Mono'}}/>
                    <Line type="monotone" dataKey="total" stroke="#F5C000" strokeWidth={2} dot={false} name="Total"/>
                    <Line type="monotone" dataKey="completed" stroke="#4ADB4A" strokeWidth={1.5} dot={false} name="Completed"/>
                    <Line type="monotone" dataKey="failed" stroke="#DB4A4A" strokeWidth={1.5} dot={false} name="Failed"/>
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="nectr-card">
              <p className="label-mono mb-1">Verdicts</p>
              <p className="text-h3 font-black mb-5">AI decisions</p>
              {il ? <Skeleton className="h-48 rounded-lg bg-surface-subtle"/> : (
                <>
                  <ResponsiveContainer width="100%" height={140}>
                    <PieChart>
                      <Pie data={verdictData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={4} dataKey="value">
                        {verdictData.map((_,i)=><Cell key={i} fill={PIE_COLORS[i]}/>)}
                      </Pie>
                      <Tooltip contentStyle={{background:'#1A1A1A',border:'1px solid #2A2A2A',borderRadius:'8px',fontSize:'12px'}} itemStyle={{color:'#FFF'}}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 mt-2">
                    {verdictData.map((d,i)=>(
                      <div key={d.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{backgroundColor:PIE_COLORS[i]}}/>
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

      {/* Team */}
      {tab === 'team' && (
        <div className="space-y-6">
          {connectedRepos.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="label-mono">Repository</span>
              <select
                value={repoForContrib ?? ''}
                onChange={(e) => setSelectedRepo(e.target.value)}
                className="nectr-input w-64 bg-surface-subtle cursor-pointer"
              >
                {connectedRepos.map((r) => (
                  <option key={r.id} value={r.full_name}>{r.full_name}</option>
                ))}
              </select>
            </div>
          )}
          {cl ? (
            <div className="space-y-3">
              {Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-20 rounded-xl bg-surface-elevated"/>)}
            </div>
          ) : (contributors?.contributors?.length ?? 0) === 0 ? (
            <div className="nectr-card flex flex-col items-center py-16 gap-3">
              <Users size={28} className="text-content-muted"/>
              <p className="text-content-secondary text-sm">No contributor data yet. Connect a repo and complete some reviews.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {contributors?.contributors.map((c) => (
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
                        {c.strengths.slice(0,3).map((s,i)=>(
                          <span key={i} className="px-2 py-0.5 rounded-full bg-success/10 text-success text-caption font-mono border border-success/20">
                            {s.length > 40 ? s.slice(0,40)+'…' : s}
                          </span>
                        ))}
                        {c.patterns.slice(0,2).map((p,i)=>(
                          <span key={i} className="px-2 py-0.5 rounded-full bg-amber/10 text-amber text-caption font-mono border border-amber/20">
                            {p.length > 40 ? p.slice(0,40)+'…' : p}
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

      {/* Repos */}
      {tab === 'repos' && (
        <div className="nectr-card p-0 overflow-hidden">
          <div className="grid grid-cols-4 px-5 py-3 border-b border-surface-border bg-surface-subtle">
            {['Repository','PRs','Merged','Issues'].map(h=>(
              <span key={h} className="label-mono">{h}</span>
            ))}
          </div>
          {il ? (
            <div className="divide-y divide-surface-border">
              {Array.from({length:5}).map((_,i)=><div key={i} className="px-5 py-4"><Skeleton className="h-4 w-full bg-surface-subtle"/></div>)}
            </div>
          ) : (insights?.per_repo?.length ?? 0) === 0 ? (
            <div className="flex items-center justify-center py-16 text-content-secondary text-sm">No repo data yet.</div>
          ) : (
            <div className="divide-y divide-surface-border">
              {insights?.per_repo.map((r)=>(
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

      {/* Insights */}
      {tab === 'insights' && (
        <div className="space-y-6">
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Confidence distribution */}
            <div className="nectr-card">
              <p className="label-mono mb-1">Confidence Distribution</p>
              <p className="text-h3 font-black mb-5">AI confidence scores</p>
              {il ? <Skeleton className="h-48 rounded-lg bg-surface-subtle"/> : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={confData} margin={{top:5,right:5,bottom:5,left:-25}}>
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{fill:'#888',fontSize:11,fontFamily:'Geist Mono'}}/>
                    <YAxis tickLine={false} axisLine={false} tick={{fill:'#444',fontSize:10,fontFamily:'Geist Mono'}}/>
                    <Tooltip contentStyle={{background:'#1A1A1A',border:'1px solid #2A2A2A',borderRadius:'8px',fontSize:'12px'}} itemStyle={{color:'#FFF'}}/>
                    <Bar dataKey="value" radius={[4,4,0,0]}>
                      {confData.map((_,i)=><Cell key={i} fill={CONF_COLORS[i]}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Merge time stats */}
            <div className="nectr-card">
              <p className="label-mono mb-1">Merge Time</p>
              <p className="text-h3 font-black mb-5">Time to merge stats</p>
              {il ? <Skeleton className="h-48 rounded-lg bg-surface-subtle"/> : (
                <div className="grid grid-cols-2 gap-4 mt-6">
                  {[
                    { label: 'Avg', value: insights?.merge_time.avg_hours ? `${insights.merge_time.avg_hours}h` : '—' },
                    { label: 'Median', value: insights?.merge_time.median_hours ? `${insights.merge_time.median_hours}h` : '—' },
                    { label: 'Fastest', value: insights?.merge_time.fastest_hours ? `${insights.merge_time.fastest_hours}h` : '—' },
                    { label: 'Slowest', value: insights?.merge_time.slowest_hours ? `${insights.merge_time.slowest_hours}h` : '—' },
                  ].map(({label, value}) => (
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
              {['Author','PRs','Merged','Issues','Confidence'].map(h=>(
                <span key={h} className="label-mono">{h}</span>
              ))}
            </div>
            {il ? (
              <div className="divide-y divide-surface-border">
                {Array.from({length:5}).map((_,i)=><div key={i} className="px-5 py-4"><Skeleton className="h-4 w-full bg-surface-subtle"/></div>)}
              </div>
            ) : (
              <div className="divide-y divide-surface-border">
                {insights?.per_author.map((a) => (
                  <div key={a.author} className="grid grid-cols-5 px-5 py-3.5 items-center hover:bg-surface-subtle transition-colors">
                    <span className="font-mono text-sm font-medium">@{a.author}</span>
                    <span className="text-sm">{a.prs}</span>
                    <span className="text-sm text-success">{a.merged}</span>
                    <span className="text-sm text-danger">{a.issues_flagged}</span>
                    <span className="text-sm font-mono">
                      {a.avg_confidence ? `${a.avg_confidence}/5` : '—'}
                    </span>
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
