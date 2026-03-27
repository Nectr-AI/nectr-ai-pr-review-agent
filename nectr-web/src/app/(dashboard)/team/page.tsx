'use client';

import { useState, useMemo } from 'react';
import { useContributors } from '@/hooks/useAnalytics';
import { useGraphAnalytics } from '@/hooks/useAnalytics';
import { useRepos } from '@/hooks/useRepos';
import { Skeleton } from '@/components/ui/skeleton';
import type { Contributor, ContributorStat } from '@/types';
import {
  Users,
  Code,
  Star,
  AlertTriangle,
  GitPullRequest,
  TrendingUp,
  ChevronDown,
  Activity,
  Zap,
  FileCode,
  Brain,
} from 'lucide-react';

/* ── tiny 12-week sparkline ─────────────────────────────────────────────── */
function WeeklySparkline({ weeks }: { weeks: { w: number; c: number }[] }) {
  const last12 = weeks.slice(-12);
  const max = Math.max(...last12.map((w) => w.c), 1);
  return (
    <div className="flex items-end gap-[3px] h-8">
      {last12.map((w, i) => (
        <div
          key={i}
          className="w-[6px] rounded-sm bg-amber/60 transition-all hover:bg-amber"
          style={{ height: `${Math.max(8, (w.c / max) * 100)}%` }}
          title={`${w.c} commits`}
        />
      ))}
    </div>
  );
}

/* ── data readiness helpers ─────────────────────────────────────────────── */
function hasEnoughData(c: Contributor): boolean {
  return c.pr_count >= 2; // need ≥2 PRs before patterns are meaningful
}

/* ── main page ──────────────────────────────────────────────────────────── */
export default function TeamPage() {
  const { data: repos } = useRepos();
  const connected = repos?.filter((r) => r.is_connected) ?? [];
  const defaultRepo = connected[0]?.full_name ?? null;

  // Fetch all contributor data from all connected repos (use first repo for now)
  const { data: contributorData, isLoading: contribLoading } = useContributors(defaultRepo);
  const { data: graphData, isLoading: graphLoading } = useGraphAnalytics(defaultRepo);

  const isLoading = contribLoading || graphLoading;

  // Merge Mem0 contributor profiles with GitHub contributor stats
  const members = useMemo(() => {
    const contribs = contributorData?.contributors ?? [];
    const stats = graphData?.contributors ?? [];
    const expertise = graphData?.developer_expertise ?? [];

    return contribs.map((c) => {
      const stat = stats.find(
        (s) => s.login.toLowerCase() === c.username.toLowerCase()
      );
      const exp = expertise.find(
        (e) => e.dev.toLowerCase() === c.username.toLowerCase()
      );
      return { ...c, stat: stat ?? null, expertise: exp ?? null };
    });
  }, [contributorData, graphData]);

  const [selectedUsername, setSelectedUsername] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Auto-select first member
  const selected =
    members.find((m) => m.username === selectedUsername) ?? members[0] ?? null;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-h1 font-black tracking-tight">Team</h1>
          <p className="text-content-secondary text-body mt-1">
            Developer profiles and contribution insights
          </p>
        </div>

        {/* Member selector dropdown */}
        {members.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="nectr-input w-64 bg-surface-subtle cursor-pointer flex items-center justify-between gap-2 text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-full bg-amber/15 border border-amber/25 flex items-center justify-center text-amber text-[10px] font-bold flex-shrink-0">
                  {selected?.username[0].toUpperCase()}
                </div>
                <span className="truncate text-sm font-medium">
                  @{selected?.username}
                </span>
              </div>
              <ChevronDown
                size={14}
                className={`text-content-muted transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {dropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setDropdownOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1 w-72 bg-surface-elevated border border-border rounded-xl shadow-xl z-20 overflow-hidden">
                  <div className="p-2 border-b border-border">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-content-muted px-2 py-1">
                      Team Members ({members.length})
                    </p>
                  </div>
                  <div className="max-h-64 overflow-y-auto p-1">
                    {members.map((m) => (
                      <button
                        key={m.username}
                        onClick={() => {
                          setSelectedUsername(m.username);
                          setDropdownOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                          selected?.username === m.username
                            ? 'bg-amber/10 text-amber'
                            : 'hover:bg-surface-subtle text-content-primary'
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                            selected?.username === m.username
                              ? 'bg-amber/20 border border-amber/30 text-amber'
                              : 'bg-surface-subtle border border-border text-content-secondary'
                          }`}
                        >
                          {m.username[0].toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            @{m.username}
                          </p>
                          <p className="text-[11px] text-content-muted font-mono">
                            {m.pr_count} PRs · {m.stat?.total ?? m.commit_count}{' '}
                            commits
                          </p>
                        </div>
                        {m.strengths.length > 0 && (
                          <Star
                            size={12}
                            className="text-success flex-shrink-0"
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Loading state ──────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-24 rounded-xl bg-surface-elevated"
              />
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl bg-surface-elevated" />
        </div>
      ) : members.length === 0 ? (
        /* ── Empty state ─────────────────────────────────────── */
        <div className="nectr-card flex flex-col items-center py-20 gap-4">
          <div className="w-14 h-14 rounded-2xl bg-amber/10 border border-amber/20 flex items-center justify-center">
            <Users size={24} className="text-amber" />
          </div>
          <div className="text-center">
            <p className="text-content-primary font-semibold">
              No team members yet
            </p>
            <p className="text-content-secondary text-sm mt-1 max-w-sm">
              Connect a repo and complete some PR reviews — Nectr will
              automatically build developer profiles from contribution data.
            </p>
          </div>
        </div>
      ) : selected ? (
        /* ── Developer profile view ──────────────────────────── */
        <div className="space-y-5">
          {/* ── Quick stats row ──────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: 'Pull Requests',
                value: selected.pr_count,
                icon: GitPullRequest,
                color: 'text-amber',
              },
              {
                label: 'Commits',
                value: selected.stat?.total ?? selected.commit_count,
                icon: Code,
                color: 'text-content-primary',
              },
              {
                label: 'Lines Added',
                value: selected.stat
                  ? `+${(selected.stat.additions / 1000).toFixed(1)}k`
                  : '—',
                icon: TrendingUp,
                color: 'text-success',
              },
              {
                label: 'Lines Removed',
                value: selected.stat
                  ? `-${(selected.stat.deletions / 1000).toFixed(1)}k`
                  : '—',
                icon: Activity,
                color: 'text-error',
              },
            ].map(({ label, value, icon: Icon, color }, i) => (
              <div
                key={label}
                className="nectr-card flex flex-col gap-3"
                style={{ animationDelay: `${i * 55}ms` }}
              >
                <div className="flex items-center justify-between">
                  <span className="label-mono">{label}</span>
                  <Icon size={15} className={color} />
                </div>
                <p className="text-h2 font-black">{value}</p>
              </div>
            ))}
          </div>

          {/* ── Main content grid ────────────────────────── */}
          <div className="grid lg:grid-cols-3 gap-5">
            {/* Left column — profile + strengths + patterns */}
            <div className="lg:col-span-2 space-y-5">
              {/* Profile summary */}
              {selected.profile_summary && (
                <div className="nectr-card">
                  <div className="flex items-center gap-2 mb-3">
                    <Brain size={14} className="text-amber" />
                    <span className="label-mono">AI Profile Summary</span>
                  </div>
                  <p className="text-content-secondary text-sm leading-relaxed">
                    {selected.profile_summary}
                  </p>
                  {!hasEnoughData(selected) && (
                    <p className="text-content-muted text-xs mt-3 italic">
                      Profile will become more accurate after more PR reviews.
                    </p>
                  )}
                </div>
              )}

              {/* Strengths */}
              {selected.strengths.length > 0 && (
                <div className="nectr-card">
                  <div className="flex items-center gap-2 mb-4">
                    <Star size={14} className="text-success" />
                    <span className="label-mono text-success">
                      Developer Strengths
                    </span>
                    {!hasEnoughData(selected) && (
                      <span className="text-[10px] text-content-muted font-mono ml-auto">
                        building…
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {selected.strengths.map((s, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2.5 py-2 px-3 rounded-lg bg-success/5 border border-success/10"
                      >
                        <Zap
                          size={12}
                          className="text-success mt-0.5 flex-shrink-0"
                        />
                        <span className="text-sm text-content-primary leading-snug">
                          {s}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Patterns */}
              {selected.patterns.length > 0 && (
                <div className="nectr-card">
                  <div className="flex items-center gap-2 mb-4">
                    <AlertTriangle size={14} className="text-amber" />
                    <span className="label-mono text-amber">
                      Recurring Patterns
                    </span>
                    {!hasEnoughData(selected) && (
                      <span className="text-[10px] text-content-muted font-mono ml-auto">
                        needs more data
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {selected.patterns.map((p, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2.5 py-2 px-3 rounded-lg bg-amber/5 border border-amber/10"
                      >
                        <AlertTriangle
                          size={12}
                          className="text-amber mt-0.5 flex-shrink-0"
                        />
                        <span className="text-sm text-content-primary leading-snug">
                          {p}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Not enough data notice */}
              {!selected.profile_summary &&
                selected.strengths.length === 0 &&
                selected.patterns.length === 0 && (
                  <div className="nectr-card flex flex-col items-center py-12 gap-3">
                    <div className="w-12 h-12 rounded-xl bg-surface-subtle border border-border flex items-center justify-center">
                      <Brain size={20} className="text-content-muted" />
                    </div>
                    <div className="text-center">
                      <p className="text-content-primary font-semibold text-sm">
                        Building profile for @{selected.username}
                      </p>
                      <p className="text-content-muted text-xs mt-1 max-w-xs">
                        Nectr learns developer strengths and patterns from PR
                        reviews. After 2–3 reviewed PRs, insights will appear
                        here automatically.
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber/40 animate-pulse" />
                      <span className="text-[11px] text-content-muted font-mono">
                        {selected.pr_count} / 3 PRs analyzed
                      </span>
                    </div>
                  </div>
                )}
            </div>

            {/* Right column — activity + expertise */}
            <div className="space-y-5">
              {/* Weekly activity sparkline */}
              {selected.stat && selected.stat.weeks.length > 0 && (
                <div className="nectr-card">
                  <div className="flex items-center gap-2 mb-4">
                    <Activity size={14} className="text-content-muted" />
                    <span className="label-mono">Weekly Activity</span>
                  </div>
                  <WeeklySparkline weeks={selected.stat.weeks} />
                  <p className="text-[10px] text-content-muted font-mono mt-2">
                    Last 12 weeks · commits to default branch
                  </p>
                </div>
              )}

              {/* Expertise / top directories */}
              {selected.expertise &&
                selected.expertise.top_dirs.length > 0 && (
                  <div className="nectr-card">
                    <div className="flex items-center gap-2 mb-4">
                      <FileCode size={14} className="text-amber" />
                      <span className="label-mono">Top Areas</span>
                    </div>
                    <div className="space-y-2.5">
                      {selected.expertise.top_dirs
                        .slice(0, 6)
                        .map((d, i) => {
                          const pct = Math.round(
                            (d.touches / selected.expertise!.total_touches) *
                              100
                          );
                          return (
                            <div key={i}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-content-secondary font-mono truncate max-w-[160px]">
                                  {d.directory || '/'}
                                </span>
                                <span className="text-[10px] text-content-muted font-mono">
                                  {pct}%
                                </span>
                              </div>
                              <div className="h-1.5 rounded-full bg-surface-subtle overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-amber/60"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

              {/* Quick info card */}
              <div className="nectr-card">
                <div className="flex items-center gap-2 mb-4">
                  <GitPullRequest size={14} className="text-content-muted" />
                  <span className="label-mono">Quick Info</span>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-content-muted">
                      Total PRs
                    </span>
                    <span className="text-sm font-bold font-mono">
                      {selected.pr_count}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-content-muted">
                      Total Commits
                    </span>
                    <span className="text-sm font-bold font-mono">
                      {selected.stat?.total ?? selected.commit_count}
                    </span>
                  </div>
                  {selected.last_seen_pr && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-content-muted">
                        Last PR
                      </span>
                      <span className="text-sm font-mono text-amber">
                        #{selected.last_seen_pr}
                      </span>
                    </div>
                  )}
                  {selected.stat && (
                    <>
                      <div className="h-px bg-border" />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-content-muted">
                          Net Impact
                        </span>
                        <span className="text-sm font-mono">
                          <span className="text-success">
                            +{selected.stat.additions.toLocaleString()}
                          </span>{' '}
                          /{' '}
                          <span className="text-error">
                            -{selected.stat.deletions.toLocaleString()}
                          </span>
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
