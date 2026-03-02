'use client';
import { useState } from 'react';
import { useContributors } from '@/hooks/useAnalytics';
import { useRepos } from '@/hooks/useRepos';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, TrendingUp, Code, AlertTriangle, Star } from 'lucide-react';

export default function TeamPage() {
  const { data: repos } = useRepos();
  const connected = repos?.filter((r) => r.is_connected) ?? [];
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const repo = selectedRepo ?? connected[0]?.full_name ?? null;
  const { data: contributors, isLoading } = useContributors(repo);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-h1 font-black tracking-tight">Team</h1>
          <p className="text-content-secondary text-body mt-1">
            Developer profiles and contribution insights
          </p>
        </div>
        {connected.length > 0 && (
          <select
            value={repo ?? ''}
            onChange={(e) => setSelectedRepo(e.target.value)}
            className="nectr-input w-64 bg-surface-subtle cursor-pointer"
          >
            {connected.map((r) => (
              <option key={r.id} value={r.full_name}>{r.full_name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Summary bar */}
      {contributors && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Contributors', value: contributors.contributor_count, icon: Users },
            { label: 'Total PRs', value: contributors.contributors.reduce((a, c) => a + c.pr_count, 0), icon: Code },
            { label: 'Avg PR Count', value: contributors.contributor_count > 0
              ? Math.round(contributors.contributors.reduce((a,c)=>a+c.pr_count,0)/contributors.contributor_count)
              : 0, icon: TrendingUp },
            { label: 'Active This Month', value: contributors.contributors.filter(c => c.last_seen_pr).length, icon: Star },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="nectr-card flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="label-mono">{label}</span>
                <Icon size={15} className="text-content-muted"/>
              </div>
              <p className="text-h2 font-black">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Contributor cards */}
      {isLoading ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {Array.from({length:6}).map((_,i)=>(
            <Skeleton key={i} className="h-48 rounded-xl bg-surface-elevated"/>
          ))}
        </div>
      ) : (contributors?.contributors?.length ?? 0) === 0 ? (
        <div className="nectr-card flex flex-col items-center py-20 gap-4">
          <Users size={32} className="text-content-muted"/>
          <div className="text-center">
            <p className="text-content-primary font-semibold">No contributor data yet</p>
            <p className="text-content-secondary text-sm mt-1">
              Connect a repo and complete some PR reviews to build contributor profiles.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {contributors?.contributors.map((c) => (
            <div key={c.username} className="nectr-card hover:border-amber/20 transition-all group">
              {/* Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-amber/10 border border-amber/20 flex items-center justify-center text-amber font-black text-lg flex-shrink-0 group-hover:bg-amber/20 transition-colors">
                  {c.username[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-bold">@{c.username}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-2 py-0.5 rounded-full bg-amber/10 text-amber text-caption font-mono border border-amber/20">
                      {c.pr_count} PRs
                    </span>
                    {c.last_seen_pr && (
                      <span className="text-content-muted text-caption font-mono">
                        Last PR #{c.last_seen_pr}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Profile summary */}
              {c.profile_summary && (
                <p className="text-content-secondary text-xs leading-relaxed mb-4 line-clamp-3">
                  {c.profile_summary}
                </p>
              )}

              {/* Strengths */}
              {c.strengths.length > 0 && (
                <div className="mb-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Star size={11} className="text-success"/>
                    <span className="label-mono text-success">Strengths</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {c.strengths.slice(0,3).map((s,i)=>(
                      <span key={i} className="px-2 py-0.5 rounded-full bg-success/10 text-success text-caption font-mono border border-success/20 line-clamp-1" style={{maxWidth:'200px'}}>
                        {s.length > 35 ? s.slice(0,35)+'…' : s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Patterns */}
              {c.patterns.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <AlertTriangle size={11} className="text-amber"/>
                    <span className="label-mono text-amber">Patterns</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {c.patterns.slice(0,2).map((p,i)=>(
                      <span key={i} className="px-2 py-0.5 rounded-full bg-amber/10 text-amber text-caption font-mono border border-amber/20" style={{maxWidth:'200px'}}>
                        {p.length > 35 ? p.slice(0,35)+'…' : p}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
