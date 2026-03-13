'use client';
import { useState, useMemo } from 'react';
import { useRepos, useInstallRepo, useUninstallRepo, useRescanRepo, useRepoFiles } from '@/hooks/useRepos';
import { useMemories, useAddMemory, useDeleteMemory } from '@/hooks/useMemory';
import { Skeleton } from '@/components/ui/skeleton';
import {
  GitBranch, Lock, Globe, CheckCircle, Loader2, RefreshCw,
  GitPullRequest, ScanSearch, ChevronDown, ChevronUp, Plus, Trash2,
  Map, X, Flame,
} from 'lucide-react';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';
import type { Repo, RepoFile } from '@/types';
import toast from 'react-hot-toast';

/* ─── Language colour map (GitHub-inspired, tuned for dark bg) ──────────── */
const LANG_COLORS: Record<string, string> = {
  TypeScript:  '#3b82f6',
  JavaScript:  '#f59e0b',
  Python:      '#22c55e',
  Go:          '#06b6d4',
  Rust:        '#f97316',
  Java:        '#ef4444',
  Ruby:        '#ec4899',
  'C#':        '#a78bfa',
  'C++':       '#6366f1',
  C:           '#64748b',
  PHP:         '#a855f7',
  Swift:       '#fb923c',
  Kotlin:      '#7c3aed',
  Scala:       '#dc2626',
  Shell:       '#10b981',
  HTML:        '#ea580c',
  CSS:         '#0ea5e9',
  YAML:        '#84cc16',
  JSON:        '#94a3b8',
  Markdown:    '#cbd5e1',
  SQL:         '#fbbf24',
  Terraform:   '#8b5cf6',
  Other:       '#475569',
};

/* ─── Tree builder ───────────────────────────────────────────────────────── */
interface TreeNode {
  name: string;
  path?: string;
  /** bytes — used in "size" mode */
  size?: number;
  /** pr touches + 1 — used in "hotspot" mode */
  hotspot?: number;
  language?: string;
  children?: TreeNode[];
}

function buildTree(files: RepoFile[]): TreeNode[] {
  const root: TreeNode = { name: 'root', children: [] };

  for (const file of files) {
    const parts = file.path.split('/');
    let node = root;

    // Build/navigate directory nodes
    for (let i = 0; i < parts.length - 1; i++) {
      let child = node.children!.find((c) => c.name === parts[i] && c.children);
      if (!child) {
        child = { name: parts[i], children: [] };
        node.children!.push(child);
      }
      node = child;
    }

    // Leaf: individual file
    node.children!.push({
      name: parts[parts.length - 1],
      path: file.path,
      size:    Math.max(file.size, 300),  // min 300 B so tiny files stay visible
      hotspot: file.pr_count + 1,         // +1 keeps unseen files on the map
      language: file.language,
    });
  }

  return root.children ?? [];
}

/* ─── Custom treemap cell renderer ─────────────────────────────────────────*/
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TreemapCell(props: any) {
  const { x, y, width, height, name, depth, language, path } = props;
  if (!width || !height || width < 3 || height < 3) return null;

  const isFile   = !props.children && depth > 0;
  const isDir    = !!props.children && depth > 0;

  const fill = isFile
    ? (LANG_COLORS[language as string] ?? LANG_COLORS.Other)
    : isDir
    ? '#1e2435'
    : 'transparent';

  const showLabel = width > 45 && height > 18;
  const label     = name && name.length > 18 ? `${(name as string).slice(0, 16)}…` : name;

  return (
    <g>
      <rect
        x={x + 1} y={y + 1}
        width={Math.max(width - 2, 0)} height={Math.max(height - 2, 0)}
        fill={fill}
        fillOpacity={isFile ? 0.82 : 1}
        stroke={isFile ? '#0d1117' : '#0d1117'}
        strokeWidth={isFile ? 1 : 2}
        rx={isFile ? 3 : 4}
      />
      {showLabel && (
        <text
          x={x + width / 2} y={y + height / 2}
          textAnchor="middle" dominantBaseline="middle"
          fill={isFile ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.45)'}
          fontSize={Math.min(isDir ? 10 : 11, width / 7, 13)}
          fontFamily="ui-monospace, monospace"
          fontWeight={isDir ? 600 : 400}
        >
          {isDir ? label : label}
        </text>
      )}
      {isFile && (
        <title>{`${path ?? name}\n${language ?? 'Unknown'}`}</title>
      )}
    </g>
  );
}

/* ─── Custom tooltip ──────────────────────────────────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MapTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload ?? {};
  if (!d.path) return null;           // skip directory nodes

  const sizeLabel = d.size >= 1024
    ? `${(d.size / 1024).toFixed(1)} KB`
    : `${d.size} B`;

  return (
    <div className="bg-surface border border-surface-border rounded-lg px-3 py-2 shadow-xl text-xs font-mono max-w-xs">
      <p className="text-content-primary font-semibold truncate">{d.path}</p>
      <div className="flex items-center gap-3 mt-1 text-content-muted">
        <span style={{ color: LANG_COLORS[d.language] ?? LANG_COLORS.Other }}>
          ● {d.language ?? 'Unknown'}
        </span>
        <span>{sizeLabel}</span>
        {d.hotspot > 1 && (
          <span className="text-amber">🔥 {d.hotspot - 1} PR{d.hotspot > 2 ? 's' : ''}</span>
        )}
      </div>
    </div>
  );
}

/* ─── Repo map modal ─────────────────────────────────────────────────────── */
function RepoMapModal({ repo, onClose }: { repo: Repo; onClose: () => void }) {
  const [owner, name] = repo.full_name.split('/');
  const [mode, setMode] = useState<'size' | 'hotspot'>('size');
  const { data, isLoading } = useRepoFiles(owner, name);

  const treeData = useMemo(() => {
    if (!data?.files?.length) return [];
    return buildTree(data.files);
  }, [data]);

  // Language legend — top 8 languages by total bytes
  const langLegend = useMemo(() => {
    if (!data?.files) return [];
    const totals: Record<string, number> = {};
    for (const f of data.files) {
      totals[f.language] = (totals[f.language] ?? 0) + Math.max(f.size, 300);
    }
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [data]);

  const hotFiles = useMemo(() => {
    if (!data?.files) return 0;
    return data.files.filter((f) => f.pr_count > 0).length;
  }, [data]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 px-6 py-3 border-b border-surface-border bg-surface flex-shrink-0">
        <div className="flex items-center gap-3">
          <Map size={16} className="text-amber" />
          <span className="font-mono font-bold text-sm">{repo.full_name}</span>
          {data && (
            <span className="text-content-muted text-xs font-mono">
              {data.count.toLocaleString()} files · {hotFiles} hotspots
            </span>
          )}
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-1 bg-surface-subtle rounded-lg p-1">
          <button
            onClick={() => setMode('size')}
            className={cn(
              'text-xs px-3 py-1 rounded-md font-mono transition-all',
              mode === 'size'
                ? 'bg-surface-elevated text-content-primary'
                : 'text-content-muted hover:text-content-secondary',
            )}
          >
            By size
          </button>
          <button
            onClick={() => setMode('hotspot')}
            className={cn(
              'flex items-center gap-1 text-xs px-3 py-1 rounded-md font-mono transition-all',
              mode === 'hotspot'
                ? 'bg-surface-elevated text-amber'
                : 'text-content-muted hover:text-content-secondary',
            )}
          >
            <Flame size={11} />
            Hotspots
          </button>
        </div>

        <button onClick={onClose} className="btn-nectr-secondary text-xs flex-shrink-0">
          <X size={13} /> Close
        </button>
      </div>

      {/* ── Language legend ── */}
      {langLegend.length > 0 && (
        <div className="flex items-center gap-4 px-6 py-2 border-b border-surface-border bg-surface-elevated overflow-x-auto flex-shrink-0">
          {langLegend.map(([lang]) => (
            <div key={lang} className="flex items-center gap-1.5 flex-shrink-0">
              <div
                className="w-2 h-2 rounded-sm"
                style={{ backgroundColor: LANG_COLORS[lang] ?? LANG_COLORS.Other }}
              />
              <span className="text-xs font-mono text-content-secondary">{lang}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Treemap ── */}
      <div className="flex-1 p-3 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full gap-3">
            <Loader2 size={20} className="animate-spin text-amber" />
            <span className="text-content-secondary text-sm font-mono">Loading file map…</span>
          </div>
        ) : !data || data.count === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <ScanSearch size={36} className="text-content-muted" />
            <p className="text-content-secondary text-sm font-semibold">No files indexed yet</p>
            <p className="text-content-muted text-xs font-mono">
              Use the <span className="text-amber">Rescan</span> button on the repo card to index this repo into Neo4j.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={treeData}
              dataKey={mode === 'size' ? 'size' : 'hotspot'}
              aspectRatio={16 / 9}
              content={<TreemapCell />}
              isAnimationActive={false}
            >
              <Tooltip content={<MapTooltip />} />
            </Treemap>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Footer hint ── */}
      <div className="px-6 py-2 border-t border-surface-border bg-surface flex-shrink-0">
        <p className="text-content-muted text-caption font-mono">
          {mode === 'size'
            ? 'Cell size = file size in bytes · colour = language'
            : 'Cell size = number of PRs that touched the file · larger = more activity'}
        </p>
      </div>
    </div>
  );
}

/* ─── Repo context panel (shown when expanded) ─────────────────────────── */
function RepoContextPanel({ repoFullName }: { repoFullName: string }) {
  const [newRule, setNewRule] = useState('');
  const { data, isLoading } = useMemories(repoFullName);
  const addMemory = useAddMemory();
  const deleteMemory = useDeleteMemory(repoFullName);

  // Only show project_rule type memories in this panel
  const rules = data?.memories.filter(
    (m) => !m.metadata?.memory_type || m.metadata.memory_type === 'project_rule',
  ) ?? [];

  const handleAdd = () => {
    if (!newRule.trim()) return;
    addMemory.mutate(
      { repo: repoFullName, content: newRule.trim(), memory_type: 'project_rule' },
      {
        onSuccess: () => { toast.success('Context rule saved'); setNewRule(''); },
        onError:   () => toast.error('Failed to save rule'),
      },
    );
  };

  const handleDelete = (id: string) => {
    deleteMemory.mutate(id, {
      onSuccess: () => toast.success('Rule deleted'),
      onError:   () => toast.error('Failed to delete rule'),
    });
  };

  return (
    <div className="mt-4 pt-4 border-t border-surface-border space-y-3">
      <p className="label-mono text-amber">Repo Context</p>
      <p className="text-xs text-content-secondary leading-relaxed">
        Add project rules or architectural decisions. These are injected into every AI review for this repo.
      </p>

      {/* Existing rules */}
      {isLoading ? (
        <Skeleton className="h-10 rounded-lg bg-surface-elevated" />
      ) : rules.length > 0 ? (
        <div className="space-y-1.5">
          {rules.map((m) => (
            <div key={m.id} className="flex items-start gap-2 bg-surface-subtle rounded-lg px-3 py-2">
              <p className="flex-1 text-xs text-content-secondary font-mono leading-relaxed">
                {m.memory ?? m.content}
              </p>
              <button
                onClick={() => handleDelete(m.id)}
                disabled={deleteMemory.isPending}
                className="text-content-muted hover:text-danger transition-colors flex-shrink-0 mt-0.5"
                title="Delete rule"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-content-muted font-mono italic">No context rules yet.</p>
      )}

      {/* Add new rule */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newRule}
          onChange={(e) => setNewRule(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="e.g. All API endpoints must validate input"
          className="nectr-input flex-1 text-xs"
        />
        <button
          onClick={handleAdd}
          disabled={!newRule.trim() || addMemory.isPending}
          className="btn-nectr-primary text-xs px-3 py-2"
        >
          {addMemory.isPending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          Add
        </button>
      </div>
    </div>
  );
}

/* ─── Repo card ─────────────────────────────────────────────────────────── */
function RepoCard({ repo }: { repo: Repo }) {
  const install   = useInstallRepo();
  const uninstall = useUninstallRepo();
  const rescan    = useRescanRepo();
  const [contextOpen, setContextOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [owner, name] = repo.full_name.split('/');
  const isPending = install.isPending || uninstall.isPending;

  const handleToggle = async () => {
    try {
      if (repo.is_connected) {
        await uninstall.mutateAsync({ owner, repo: name });
        toast.success(`Disconnected ${repo.full_name}`);
      } else {
        await install.mutateAsync({ owner, repo: name });
        toast.success(`Connected ${repo.full_name}! Scanning repo...`);
      }
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
        : 'Operation failed';
      toast.error(msg || 'Operation failed');
    }
  };

  const handleRescan = async () => {
    try {
      const result = await rescan.mutateAsync({ owner, repo: name });
      toast.success(`Graph built — ${result.files_indexed} files indexed into Neo4j.`);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
        : 'Rescan failed';
      toast.error(msg || 'Rescan failed');
    }
  };

  return (
    <div
      className={cn(
        'nectr-card transition-all hover:border-amber/30',
        repo.is_connected && 'border-amber/20 shadow-amber-glow',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
            repo.is_connected ? 'bg-amber/10' : 'bg-surface-subtle',
          )}>
            <GitBranch size={16} className={repo.is_connected ? 'text-amber' : 'text-content-muted'} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold truncate">{repo.full_name}</span>
              {repo.private ? (
                <Lock size={11} className="text-content-muted flex-shrink-0" />
              ) : (
                <Globe size={11} className="text-content-muted flex-shrink-0" />
              )}
            </div>
            {repo.description && (
              <p className="text-content-secondary text-xs mt-0.5 truncate">{repo.description}</p>
            )}
            {repo.updated_at && (
              <p className="text-content-muted text-caption font-mono mt-1">
                Updated {new Date(repo.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {repo.is_connected && (
            <span className="hidden sm:flex items-center gap-1.5 text-success text-caption font-mono uppercase tracking-wider">
              <CheckCircle size={11} /> Connected
            </span>
          )}
          {repo.is_connected && (
            <button
              onClick={handleRescan}
              disabled={rescan.isPending}
              title="Rescan repo into Neo4j graph"
              className="btn-nectr-secondary text-xs px-3 py-2"
            >
              {rescan.isPending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <ScanSearch size={13} />
              )}
              {rescan.isPending ? 'Scanning...' : 'Rescan'}
            </button>
          )}
          {repo.is_connected && (
            <button
              onClick={() => setMapOpen(true)}
              className="btn-nectr-secondary text-xs px-3 py-2"
              title="View codebase map"
            >
              <Map size={13} />
              Map
            </button>
          )}
          {repo.is_connected && (
            <button
              onClick={() => setContextOpen((o) => !o)}
              className={cn(
                'btn-nectr-secondary text-xs px-3 py-2',
                contextOpen && 'border-amber/40 text-amber',
              )}
              title="Add repo context rules"
            >
              {contextOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              Context
            </button>
          )}
          <button
            onClick={handleToggle}
            disabled={isPending}
            className={cn(
              'text-xs px-4 py-2 rounded-md font-bold transition-all',
              repo.is_connected
                ? 'btn-nectr-secondary border-danger/30 text-danger hover:border-danger hover:bg-danger/5'
                : 'btn-nectr-primary',
            )}
          >
            {isPending ? (
              <Loader2 size={13} className="animate-spin" />
            ) : repo.is_connected ? 'Disconnect' : 'Connect'}
          </button>
        </div>
      </div>

      {/* Context panel */}
      {repo.is_connected && contextOpen && (
        <RepoContextPanel repoFullName={repo.full_name} />
      )}

      {/* Repo map modal — full-screen overlay */}
      {repo.is_connected && mapOpen && (
        <RepoMapModal repo={repo} onClose={() => setMapOpen(false)} />
      )}
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────────── */
export default function ReposPage() {
  const { data: repos, isLoading, error, refetch, isFetching } = useRepos();
  const connected = repos?.filter((r) => r.is_connected) ?? [];
  const available = repos?.filter((r) => !r.is_connected) ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h1 font-black tracking-tight">Code Providers</h1>
          <p className="text-content-secondary text-body mt-1">
            {connected.length} connected · {repos?.length ?? 0} total repositories
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="btn-nectr-secondary text-xs"
        >
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Info banner */}
      <div className="nectr-card border-amber/20 bg-amber/5">
        <div className="flex items-start gap-3">
          <GitPullRequest size={16} className="text-amber mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-amber mb-1">How it works</p>
            <p className="text-xs text-content-secondary leading-relaxed">
              Connect a repo to install a GitHub webhook. Nectr will automatically review every PR opened on that repo, post AI feedback, and build a knowledge graph of your codebase. Use the <span className="text-amber font-bold">Context</span> button on connected repos to add project rules that guide every review.
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl bg-surface-elevated" />
          ))}
        </div>
      ) : error ? (
        <div className="nectr-card border-danger/20 bg-danger/5 flex flex-col gap-2">
          <p className="text-sm font-bold text-danger">Failed to load repositories</p>
          <p className="text-xs text-content-secondary font-mono">
            {(error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
              ?? (error as Error)?.message
              ?? 'Unknown error — check Railway logs'}
          </p>
          <button onClick={() => refetch()} className="btn-nectr-secondary text-xs w-fit mt-1">
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      ) : (
        <>
          {connected.length > 0 && (
            <section>
              <p className="label-mono mb-3">Connected ({connected.length})</p>
              <div className="space-y-3">
                {connected.map((r) => <RepoCard key={r.id} repo={r} />)}
              </div>
            </section>
          )}

          <section>
            <p className="label-mono mb-3">Available ({available.length})</p>
            {available.length === 0 ? (
              <div className="nectr-card text-center py-10">
                <CheckCircle size={24} className="text-success mx-auto mb-3" />
                <p className="text-content-secondary text-sm">All your repos are connected.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {available.map((r) => <RepoCard key={r.id} repo={r} />)}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
