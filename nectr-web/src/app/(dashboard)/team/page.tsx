'use client';

import { useState, useMemo } from 'react';
import { useContributors } from '@/hooks/useAnalytics';
import { useGraphAnalytics } from '@/hooks/useAnalytics';
import { useRepos } from '@/hooks/useRepos';
import { Skeleton } from '@/components/ui/skeleton';
import type { Contributor, ContributorStat, DeveloperExpertise } from '@/types';
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
  Sparkles,
  Shield,
} from 'lucide-react';

/* ── merged member type ─────────────────────────────────────────────────── */
interface TeamMember {
  username: string;
  profile_summary: string | null;
  patterns: string[];
  strengths: string[];
  pr_count: number;
  commit_count: number;
  last_seen_pr: number | null;
  stat: ContributorStat | null;
  expertise: DeveloperExpertise | null;
  hasAiInsights: boolean;
}

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

/* ── AI insight badge ───────────────────────────────────────────────────── */
function AiBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber/10 text-amber text-[10px] font-mono border border-amber/20">
      <Sparkles size={10} />
      AI Analysis
    </span>
  );
}

/* ── main page ──────────────────────────────────────────────────────────── */
export default function TeamPage() {
  const { data: repos } = useRepos();
  const connected = repos?.filter((r) => r.is_connected) ?? [];
  const defaultRepo = connected[0]?.full_name ?? null;

  const { data: contributorData, isLoading: contribLoading } = useContributors(defaultRepo);
  const { data: graphData, isLoading: graphLoading } = useGraphAnalytics(defaultRepo);

  const isLoading = contribLoading || graphLoading;

  // Merge both sources: GitHub stats for baseline, Mem0 for AI insights
  const members: TeamMember[] = useMemo(() => {
    const contribs = contributorData?.contributors ?? [];
    const stats = graphData?.contributors ?? [];
    const expertise = graphData?.developer_expertise ?? [];

    // Build unified member list from both sources
    const memberMap = new Map<string, TeamMember>();

    // Seed from Mem0 contributors (AI-enriched profiles)
    for (const c of contribs) {
      const key = c.username.toLowerCase();
      const stat = stats.find((s) => s.login.toLowerCase() === key) ?? null;
      const exp = expertise.find((e) => e.dev.toLowerCase() === key) ?? null;
      memberMap.set(key, {
        ...c,
        stat,
        expertise: exp,
        hasAiInsights: !!(c.profile_summary || c.strengths.length > 0 || c.patterns.length > 0),
      });
    }

    // Add GitHub contributors not yet in Mem0
    for (const s of stats) {
      const key = s.login.toLowerCase();
      if (!memberMap.has(key)) {
        const exp = expertise.find((e) => e.dev.toLowerCase() === key) ?? null;
        memberMap.set(key, {
          username: s.login,
          profile_summary: null,
          patterns: [],
          strengths: [],
          pr_count: 0,
          commit_count: s.total,
          last_seen_pr: null,
          stat: s,
          expertise: exp,
          hasAiInsights: false,
        });
      }
    }

    // Sort: members with AI insights first, then by commit count
    return Array.from(memberMap.values()).sort((a, b) => {
      if (a.hasAiInsights && !b.hasAiInsights) return -1;
      if (!a.hasAiInsights && b.hasAiInsights) return 1;
      return (b.stat?.total ?? b.commit_count) - (a.stat?.total ?? a.commit_count);
    });
  }, [contributorData, graphData]);

  const [selectedUsername, setSelectedUsername] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const selected =
    members.find((m) => m.username === selectedUsername) ?? members[0] ?? null;

  const aiAnalyzedCount = members.filter((m) => m.hasAiInsights).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-h1 font-black tracking-tight">Team</h1>
          <p className="text-content-secondary text-body mt-1">
            AI-powered developer profiles and contribution insights
          </p>
          {aiAnalyzedCount > 0 && (
            <p className="text-amber text-xs font-mono mt-2 flex items-center gap-1.5">
              <Sparkles size={12} />
              {aiAnalyzedCount} developer{aiAnalyzedCount > 1 ? 's' : ''} with AI-generated insights
            </p>
          )}
        </div>

        {/* Member selector dropdown */}
        {members.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="nectr-input w-64 bg-surface-subtle cursor-pointer flex items-center justify-between gap-2 text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                  selected?.hasAiInsights
                    ? 'bg-amber/15 border border-amber/25 text-amber'
                    : 'bg-surface-subtle border border-border text-content-muted'
                }`}>
                  {selected?.username[0].toUpperCase()}
                </div>
                <span className="truncate text-sm font-medium">
                  @{selected?.username}
                </span>
                {selected?.hasAiInsights && <Sparkles size={10} className="text-amber flex-shrink-0" />}
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
                <div className="absolute right-0 top-full mt-1 w-80 bg-surface-elevated border border-border rounded-xl shadow-xl z-20 overflow-hidden">
                  <div className="p-2 border-b border-border">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-content-muted px-2 py-1">
                      Team Members ({members.length})
                      {aiAnalyzedCount > 0 && (
                        <span className="text-amber ml-2">· {aiAnalyzedCount} AI-analyzed</span>
                      )}
                    </p>
                  </div>
                  <div className="max-h-72 overflow-y-auto p-1">
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
                              : m.hasAiInsights
                              ? 'bg-amber/10 border border-amber/20 text-amber'
                              : 'bg-surface-subtle border border-border text-content-secondary'
                          }`}
                        >
                          {m.username[0].toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium truncate">@{m.username}</p>
                            {m.hasAiInsights && <Sparkles size={10} className="text-amber flex-shrink-0" />}
                          </div>
                          <p className="text-[11px] text-content-muted font-mono">
                            {m.pr_count > 0 ? `${m.pr_count} PRs · ` : ''}{m.stat?.total ?? m.commit_count} commits
                            {m.strengths.length > 0 && ` · ${m.strengths.length} strengths`}
                          </p>
                        </div>
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
              <Skeleton key={i} className="h-24 rounded-xl bg-surface-elevated" />
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
            <p className="text-content-primary font-semibold">No team members yet</p>
            <p className="text-content-secondary text-sm mt-1 max-w-sm">
              Connect a repo and complete some PR reviews — Nectr will
              automatically build AI-powered developer profiles from contribution data.
            </p>
          </div>
        </div>
      ) : selected ? (
        /* ── Developer profile view ──────────────────────────── */
        <div className="space-y-5">
          {/* ── Nectr AI Insights (the differentiator — shown first) ── */}
          {selected.hasAiInsights ? (
            <div className="nectr-card border-amber/20 bg-gradient-to-br from-amber/[0.03] to-transparent">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Brain size={16} className="text-amber" />
                  <span className="label-mono text-amber">Nectr AI Profile</span>
                </div>
                <AiBadge />
              </div>

              {/* AI Profile Summary */}
              {selected.profile_summary && (
                <p className="text-content-primary text-sm leading-relaxed mb-5">
                  {selected.profile_summary}
                </p>
              )}

              {/* Strengths + Patterns side by side */}
              <div className="grid md:grid-cols-2 gap-4">
                {/* Strengths */}
                {selected.strengths.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-3">
                      <Star size={12} className="text-success" />
                      <span className="text-[11px] font-mono uppercase tracking-wider text-success">
                        Strengths ({selected.strengths.length})
                      </span>
                    </div>
                    <div className="space-y-2">
                      {selected.strengths.map((s, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2 py-2 px-3 rounded-lg bg-success/5 border border-success/10"
                        >
                          <Zap size={11} className="text-success mt-0.5 flex-shrink-0" />
                          <span className="text-xs text-content-primary leading-snug">{s}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Patterns */}
                {selected.patterns.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-3">
                      <AlertTriangle size={12} className="text-amber" />
                      <span className="text-[11px] font-mono uppercase tracking-wider text-amber">
                        Recurring Patterns ({selected.patterns.length})
                      </span>
                    </div>
                    <div className="space-y-2">
                      {selected.patterns.map((p, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2 py-2 px-3 rounded-lg bg-amber/5 border border-amber/10"
                        >
                          <AlertTriangle size={11} className="text-amber mt-0.5 flex-shrink-0" />
                          <span className="text-xs text-content-primary leading-snug">{p}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {selected.pr_count > 0 && selected.pr_count < 3 && (
                <p className="text-content-muted text-[11px] mt-4 italic flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber/40 animate-pulse" />
                  Profile becomes more accurate with each review · {selected.pr_count} PR{selected.pr_count > 1 ? 's' : ''} analyzed so far
                </p>
              )}
            </div>
          ) : (
            /* ── No AI insights yet — explain why Nectr is different ── */
            <div className="nectr-card border-dashed border-amber/15 flex items-start gap-4 py-6">
              <div className="w-11 h-11 rounded-xl bg-amber/10 border border-amber/20 flex items-center justify-center flex-shrink-0">
                <Brain size={18} className="text-amber" />
              </div>
              <div>
                <p className="text-content-primary font-semibold text-sm">
                  AI insights building for @{selected.username}
                </p>
                <p className="text-content-muted text-xs mt-1 max-w-md leading-relaxed">
                  Nectr learns developer strengths, recurring patterns, and builds a
                  comprehensive profile from each PR review. This is data you can&apos;t get
                  from GitHub alone. After 2–3 reviewed PRs, insights will appear here.
                </p>
                <div className="flex items-center gap-1.5 mt-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber/40 animate-pulse" />
                  <span className="text-[11px] text-content-muted font-mono">
                    {selected.pr_count} / 3 PRs analyzed
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ── Stats + Activity (supporting context) ─────────── */}
          <div className="grid lg:grid-cols-3 gap-5">
            {/* Left column — stats cards + expertise */}
            <div className="lg:col-span-2 space-y-5">
              {/* Quick stats row */}
              <div className="grid grid-cols-2 gap-4">
                {[
                  {
                    label: 'PRs Reviewed',
                    value: selected.pr_count || '—',
                    icon: GitPullRequest,
                    color: 'text-amber',
                    note: selected.pr_count > 0 ? 'by Nectr' : null,
                  },
                  {
                    label: 'Commits',
                    value: selected.stat?.total ?? selected.commit_count,
                    icon: Code,
                    color: 'text-content-primary',
                    note: null,
                  },
                  {
                    label: 'Lines Added',
                    value: selected.stat
                      ? `+${(selected.stat.additions / 1000).toFixed(1)}k`
                      : '—',
                    icon: TrendingUp,
                    color: 'text-success',
                    note: null,
                  },
                  {
                    label: 'Lines Removed',
                    value: selected.stat
                      ? `-${(selected.stat.deletions / 1000).toFixed(1)}k`
                      : '—',
                    icon: Activity,
                    color: 'text-error',
                    note: null,
                  },
                ].map(({ label, value, icon: Icon, color, note }, i) => (
                  <div
                    key={label}
                    className="nectr-card flex flex-col gap-2"
                    style={{ animationDelay: `${i * 55}ms` }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="label-mono">{label}</span>
                      <Icon size={15} className={color} />
                    </div>
                    <p className="text-h2 font-black">{value}</p>
                    {note && (
                      <span className="text-[10px] text-amber font-mono">{note}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Expertise / top directories */}
              {selected.expertise && selected.expertise.top_dirs.length > 0 && (
                <div className="nectr-card">
                  <div className="flex items-center gap-2 mb-4">
                    <FileCode size={14} className="text-amber" />
                    <span className="label-mono">Code Ownership — Top Areas</span>
                    <AiBadge />
                  </div>
                  <div className="space-y-2.5">
                    {selected.expertise.top_dirs.slice(0, 6).map((d, i) => {
                      const pct = Math.round(
                        (d.touches / selected.expertise!.total_touches) * 100
                      );
                      return (
                        <div key={i}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-content-secondary font-mono truncate max-w-[200px]">
                              {d.directory || '/'}
                            </span>
                            <span className="text-[10px] text-content-muted font-mono">
                              {d.touches} touches · {pct}%
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
            </div>

            {/* Right column — activity + quick info */}
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

              {/* Quick info card */}
              <div className="nectr-card">
                <div className="flex items-center gap-2 mb-4">
                  <Shield size={14} className="text-content-muted" />
                  <span className="label-mono">Developer Summary</span>
                </div>
                <div className="space-y-3">
                  {selected.pr_count > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-content-muted">Nectr Reviews</span>
                      <span className="text-sm font-bold font-mono text-amber">
                        {selected.pr_count}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-content-muted">Total Commits</span>
                    <span className="text-sm font-bold font-mono">
                      {selected.stat?.total ?? selected.commit_count}
                    </span>
                  </div>
                  {selected.last_seen_pr && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-content-muted">Last Reviewed PR</span>
                      <span className="text-sm font-mono text-amber">
                        #{selected.last_seen_pr}
                      </span>
                    </div>
                  )}
                  {selected.stat && (
                    <>
                      <div className="h-px bg-border" />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-content-muted">Net Impact</span>
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
                  {selected.hasAiInsights && (
                    <>
                      <div className="h-px bg-border" />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-content-muted">AI Insights</span>
                        <span className="text-xs font-mono text-amber flex items-center gap-1">
                          <Sparkles size={10} />
                          {selected.strengths.length} strengths · {selected.patterns.length} patterns
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
