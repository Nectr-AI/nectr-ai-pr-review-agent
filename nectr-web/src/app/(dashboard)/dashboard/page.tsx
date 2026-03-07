'use client';
import { useState, useMemo } from 'react';
import { useGraphAnalytics } from '@/hooks/useAnalytics';
import { useRepos } from '@/hooks/useRepos';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  GitBranch, Flame, ShieldAlert,
  FileX2, Users, ChevronDown, Activity,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { GraphAnalytics } from '@/types';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from 'recharts';

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

      {/* Top Contributors — full-width donut */}
      {(() => {
        const contribs = data.contributors ?? [];
        const total = contribs.reduce((s, x) => s + x.contributions, 0);
        return (
          <div className="nectr-card lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="label-mono mb-1">Commits</p>
                <p className="text-h3 font-black">Top Contributors</p>
              </div>
              <Users size={18} className="text-amber" />
            </div>
            {contribs.length === 0 ? (
              <p className="text-content-muted text-sm">No contributor data available yet.</p>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <ResponsiveContainer width={220} height={220}>
                  <PieChart>
                    <Pie
                      data={contribs}
                      dataKey="contributions"
                      nameKey="login"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                    >
                      {contribs.map((_, i) => (
                        <Cell key={i} fill={LANG_COLORS[i % LANG_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val, name) => [`${val ?? 0} commits`, `@${name ?? ''}`] as [string, string]}
                      contentStyle={{
                        background: 'var(--color-surface-elevated)',
                        border: '1px solid var(--color-surface-border)',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2 w-full">
                  {contribs.map((c, i) => {
                    const pct = total > 0 ? Math.round((c.contributions / total) * 100) : 0;
                    return (
                      <div key={c.login} className="flex items-center gap-3">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: LANG_COLORS[i % LANG_COLORS.length] }}
                        />
                        <span className="text-xs font-mono text-amber flex-1">@{c.login}</span>
                        <div className="w-28 h-1 rounded-full bg-surface-subtle overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, backgroundColor: LANG_COLORS[i % LANG_COLORS.length] }}
                          />
                        </div>
                        <span className="text-xs font-mono font-bold text-content-primary w-16 text-right shrink-0">
                          {c.contributions} <span className="text-content-muted font-normal">({pct}%)</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuthContext();
  const { data: repos, isLoading: reposLoading } = useRepos();

  const connectedRepos = useMemo(() => repos?.filter((r) => r.is_connected) ?? [], [repos]);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const activeRepo = selectedRepo ?? connectedRepos[0]?.full_name ?? null;
  const { data: graphData, isLoading: graphLoading } = useGraphAnalytics(activeRepo);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-h1 font-black tracking-tight">
          Good {getTimeOfDay()},{' '}
          <span className="text-amber">{user?.name?.split(' ')[0] || user?.github_username}</span>
        </h1>
        <p className="text-content-secondary text-body mt-1">
          Here&rsquo;s what&rsquo;s happening across your connected repos.
        </p>
      </div>

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

      {!activeRepo && !reposLoading && (
        <div className="nectr-card flex flex-col items-center justify-center py-16 gap-4">
          <GitBranch size={32} className="text-content-muted" />
          <p className="text-content-secondary text-sm">Connect a repo to see Repo Intelligence</p>
          <a href="/repos" className="btn-nectr-primary text-xs">Connect a Repo</a>
        </div>
      )}
    </div>
  );
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
