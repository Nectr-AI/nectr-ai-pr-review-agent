'use client';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRepos, useInstallRepo, useUninstallRepo, useRescanRepo, useRepoFiles, useRepoGraph } from '@/hooks/useRepos';
import { useMemories, useAddMemory, useDeleteMemory } from '@/hooks/useMemory';
import { Skeleton } from '@/components/ui/skeleton';
import {
  GitBranch, Lock, Globe, CheckCircle, Loader2, RefreshCw,
  GitPullRequest, ScanSearch, ChevronDown, ChevronUp, Plus, Trash2,
  X, Flame, Network, LayoutGrid,
} from 'lucide-react';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';
import type { Repo, RepoFile } from '@/types';
import toast from 'react-hot-toast';

/* ─── Force graph — loaded client-side only (uses Canvas APIs) ───────────── */
import type { ComponentType } from 'react';
type AnyProps = Record<string, unknown>;
const ForceGraph2D = dynamic<AnyProps>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  () => import('react-force-graph-2d').then((m) => m.default as ComponentType<AnyProps>),
  { ssr: false },
);

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

/* ─── Tree builder (for treemap view) ───────────────────────────────────── */
interface TreeNode {
  name: string;
  path?: string;
  size?: number;
  hotspot?: number;
  language?: string;
  children?: TreeNode[];
  [key: string]: unknown;
}

function buildTree(files: RepoFile[]): TreeNode[] {
  const root: TreeNode = { name: 'root', children: [] };
  for (const file of files) {
    const parts = file.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      let child = node.children!.find((c) => c.name === parts[i] && c.children);
      if (!child) { child = { name: parts[i], children: [] }; node.children!.push(child); }
      node = child;
    }
    node.children!.push({
      name: parts[parts.length - 1],
      path: file.path,
      size:    Math.max(file.size, 300),
      hotspot: file.pr_count + 1,
      language: file.language,
    });
  }
  return root.children ?? [];
}

/* ─── Treemap cell renderer ─────────────────────────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TreemapCell(props: any) {
  const { x, y, width, height, name, depth, language, path } = props;
  if (!width || !height || width < 3 || height < 3) return null;
  const isFile = !props.children && depth > 0;
  const isDir  = !!props.children && depth > 0;
  const fill   = isFile ? (LANG_COLORS[language as string] ?? LANG_COLORS.Other) : isDir ? '#1e2435' : 'transparent';
  const showLabel = width > 45 && height > 18;
  const label     = name && (name as string).length > 18 ? `${(name as string).slice(0, 16)}…` : name;
  return (
    <g>
      <rect x={x+1} y={y+1} width={Math.max(width-2,0)} height={Math.max(height-2,0)}
        fill={fill} fillOpacity={isFile ? 0.82 : 1}
        stroke="#0d1117" strokeWidth={isFile ? 1 : 2} rx={isFile ? 3 : 4} />
      {showLabel && (
        <text x={x+width/2} y={y+height/2} textAnchor="middle" dominantBaseline="middle"
          fill={isFile ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.45)'}
          fontSize={Math.min(isDir ? 10 : 11, width/7, 13)}
          fontFamily="ui-monospace,monospace" fontWeight={isDir ? 600 : 400}>
          {label}
        </text>
      )}
      {isFile && <title>{`${path ?? name}\n${language ?? 'Unknown'}`}</title>}
    </g>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MapTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload ?? {};
  if (!d.path) return null;
  const sizeLabel = d.size >= 1024 ? `${(d.size / 1024).toFixed(1)} KB` : `${d.size} B`;
  return (
    <div className="bg-surface border border-surface-border rounded-lg px-3 py-2 shadow-xl text-xs font-mono max-w-xs">
      <p className="text-content-primary font-semibold truncate">{d.path}</p>
      <div className="flex items-center gap-3 mt-1 text-content-muted">
        <span style={{ color: LANG_COLORS[d.language] ?? LANG_COLORS.Other }}>● {d.language ?? 'Unknown'}</span>
        <span>{sizeLabel}</span>
        {d.hotspot > 1 && <span className="text-amber">🔥 {d.hotspot - 1} PR{d.hotspot > 2 ? 's' : ''}</span>}
      </div>
    </div>
  );
}

/* ─── Force-directed graph view ─────────────────────────────────────────── */
function RepoGraphView({ owner, name }: { owner: string; name: string }) {
  const { data, isLoading } = useRepoGraph(owner, name);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setDims({ width: el.clientWidth, height: el.clientHeight }));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Stable graph data object — deep-copy so force simulation can mutate
  const graphData = useMemo(() => {
    if (!data?.nodes?.length) return { nodes: [], links: [] };
    return {
      nodes: data.nodes.map((n) => ({ ...n })),
      links: data.links.map((l) => ({ ...l })),
    };
  }, [data]);

  const hotCount = useMemo(() => data?.nodes.filter((n) => n.pr_count > 0).length ?? 0, [data]);

  /* Custom Canvas node renderer */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const prCount = (node.pr_count as number) ?? 0;
    const lang    = (node.language as string) ?? 'Other';
    const isHot   = prCount > 0;
    const size    = Math.max(2.5, Math.min(10, 2.5 + prCount * 1.4));
    const nx = node.x as number;
    const ny = node.y as number;

    // Amber radial glow for PR-touched files
    if (isHot) {
      const grd = ctx.createRadialGradient(nx, ny, size * 0.3, nx, ny, size * 4);
      grd.addColorStop(0, 'rgba(245,158,11,0.40)');
      grd.addColorStop(1, 'rgba(245,158,11,0)');
      ctx.beginPath();
      ctx.arc(nx, ny, size * 4, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();
    }

    // Node circle
    ctx.beginPath();
    ctx.arc(nx, ny, size, 0, Math.PI * 2);
    ctx.fillStyle = isHot ? '#f59e0b' : `${LANG_COLORS[lang] ?? LANG_COLORS.Other}bb`;
    ctx.fill();

    // Subtle ring on hot nodes
    if (isHot) {
      ctx.strokeStyle = 'rgba(245,158,11,0.55)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    // Label: always for big nodes, or when zoomed in
    if (globalScale >= 2.5 || (isHot && size >= 6)) {
      const fs = Math.min(12, Math.max(5, 9 / globalScale));
      const filename = (node.id as string).split('/').pop() ?? '';
      ctx.font = `${fs}px ui-monospace,monospace`;
      ctx.fillStyle = 'rgba(255,255,255,0.78)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(filename, nx, ny + size + 1.5);
    }
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paintNodeArea = useCallback((node: any, color: string, ctx: CanvasRenderingContext2D) => {
    const size = Math.max(2.5, Math.min(10, 2.5 + ((node.pr_count as number) ?? 0) * 1.4));
    ctx.beginPath();
    ctx.arc(node.x as number, node.y as number, size + 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full bg-[#0b0d14] rounded-lg overflow-hidden relative">
      {isLoading ? (
        <div className="flex items-center justify-center h-full gap-3">
          <Loader2 size={20} className="animate-spin text-amber" />
          <span className="text-content-secondary text-sm font-mono">Building graph…</span>
        </div>
      ) : !data || data.nodes.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
          <Network size={36} className="text-content-muted" />
          <p className="text-content-secondary text-sm font-semibold">No graph data yet</p>
          <p className="text-content-muted text-xs font-mono leading-relaxed">
            Rescan the repo to index files, then review a PR to see co-change edges appear.
          </p>
        </div>
      ) : dims ? (
        <>
          <ForceGraph2D
            graphData={graphData}
            width={dims.width}
            height={dims.height}
            backgroundColor="#0b0d14"
            nodeCanvasObject={paintNode}
            nodePointerAreaPaint={paintNodeArea}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            nodeLabel={(n: any) => `${n.id as string}\n${n.language as string} · ${n.pr_count as number} PR${(n.pr_count as number) !== 1 ? 's' : ''}`}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            linkColor={(l: any) => {
              const edgeType = (l.type as string) ?? 'co_change';
              const weight   = (l.weight as number) ?? 1;
              if (edgeType === 'import') return 'rgba(99,102,241,0.30)'; // indigo — static import
              return `rgba(245,158,11,${Math.min(0.55, 0.10 + weight * 0.06)})`; // amber — co-change
            }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            linkWidth={(l: any) => {
              const edgeType = (l.type as string) ?? 'co_change';
              if (edgeType === 'import') return 0.5;
              return Math.min(2.5, 0.6 + ((l.weight as number) ?? 1) * 0.14);
            }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            linkDirectionalParticles={(l: any) => {
              const edgeType = (l.type as string) ?? 'co_change';
              if (edgeType === 'import') return 0; // no particles on import edges
              return ((l.weight as number) ?? 0) >= 2 ? 2 : 0;
            }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            linkDirectionalArrowLength={(l: any) => (l.type as string) === 'import' ? 3 : 0}
            linkDirectionalArrowRelPos={1}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            linkDirectionalArrowColor={(l: any) => (l.type as string) === 'import' ? 'rgba(99,102,241,0.60)' : '#f59e0b'}
            linkDirectionalParticleWidth={1.5}
            linkDirectionalParticleColor={() => '#f59e0b'}
            linkDirectionalParticleSpeed={0.004}
            cooldownTicks={150}
            d3AlphaDecay={0.020}
            d3VelocityDecay={0.36}
            minZoom={0.15}
            maxZoom={10}
          />

          {/* Legend overlay */}
          <div className="absolute bottom-4 left-4 flex flex-wrap items-center gap-4 bg-surface/85 backdrop-blur-sm border border-surface-border rounded-lg px-3 py-2 pointer-events-none">
            {/* Node types */}
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-amber shadow-[0_0_6px_rgba(245,158,11,0.7)]" />
              <span className="text-xs font-mono text-content-secondary">PR hotspot</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#3b82f6bb' }} />
              <span className="text-xs font-mono text-content-secondary">File (language)</span>
            </div>
            {/* Edge types */}
            <div className="flex items-center gap-1.5">
              <svg width="22" height="8" className="overflow-visible">
                <line x1="0" y1="4" x2="18" y2="4" stroke="rgba(99,102,241,0.7)" strokeWidth="1.5" />
                <polygon points="18,1 22,4 18,7" fill="rgba(99,102,241,0.7)" />
              </svg>
              <span className="text-xs font-mono text-content-secondary">Import</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-[2px]" style={{ backgroundColor: 'rgba(245,158,11,0.7)' }} />
              <span className="text-xs font-mono text-content-secondary">Co-change</span>
            </div>
            <span className="text-content-muted text-xs font-mono border-l border-surface-border pl-3">
              {data.nodes.length} nodes · {data.links.length} edges · {hotCount} hotspots
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ─── Combined modal — Graph + Map tabs ─────────────────────────────────── */
function RepoMapModal({ repo, onClose }: { repo: Repo; onClose: () => void }) {
  const [owner, name] = repo.full_name.split('/');
  const [view, setView] = useState<'graph' | 'map'>('graph');
  const [mode, setMode] = useState<'size' | 'hotspot'>('size');

  /* Map-view data (only fetched when Map tab is active) */
  const { data: mapData, isLoading: mapLoading } = useRepoFiles(owner, name, view === 'map');

  const treeData = useMemo(() => {
    if (!mapData?.files?.length) return [];
    return buildTree(mapData.files);
  }, [mapData]);

  const langLegend = useMemo(() => {
    if (!mapData?.files) return [];
    const totals: Record<string, number> = {};
    for (const f of mapData.files) totals[f.language] = (totals[f.language] ?? 0) + Math.max(f.size, 300);
    return Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [mapData]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0d14]">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-surface-border bg-surface/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-2.5">
          {view === 'graph'
            ? <Network size={15} className="text-amber" />
            : <LayoutGrid size={15} className="text-amber" />
          }
          <span className="font-mono font-bold text-sm">{repo.full_name}</span>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-0.5 bg-surface-subtle border border-surface-border rounded-lg p-1">
          <button
            onClick={() => setView('graph')}
            className={cn(
              'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-mono transition-all',
              view === 'graph' ? 'bg-amber text-black font-bold' : 'text-content-muted hover:text-content-secondary',
            )}
          >
            <Network size={11} /> Graph
          </button>
          <button
            onClick={() => setView('map')}
            className={cn(
              'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-mono transition-all',
              view === 'map' ? 'bg-surface-elevated text-content-primary' : 'text-content-muted hover:text-content-secondary',
            )}
          >
            <LayoutGrid size={11} /> Map
          </button>
        </div>

        {/* Map sub-mode (only in map view) */}
        {view === 'map' && (
          <div className="flex items-center gap-0.5 bg-surface-subtle border border-surface-border rounded-lg p-1">
            <button
              onClick={() => setMode('size')}
              className={cn(
                'text-xs px-3 py-1.5 rounded-md font-mono transition-all',
                mode === 'size' ? 'bg-surface-elevated text-content-primary' : 'text-content-muted hover:text-content-secondary',
              )}
            >
              By size
            </button>
            <button
              onClick={() => setMode('hotspot')}
              className={cn(
                'flex items-center gap-1 text-xs px-3 py-1.5 rounded-md font-mono transition-all',
                mode === 'hotspot' ? 'bg-surface-elevated text-amber' : 'text-content-muted hover:text-content-secondary',
              )}
            >
              <Flame size={10} /> Hotspots
            </button>
          </div>
        )}

        <button onClick={onClose} className="btn-nectr-secondary text-xs flex-shrink-0">
          <X size={13} /> Close
        </button>
      </div>

      {/* ── Language legend (map view only) ── */}
      {view === 'map' && langLegend.length > 0 && (
        <div className="flex items-center gap-4 px-5 py-2 border-b border-surface-border bg-surface/60 overflow-x-auto flex-shrink-0">
          {langLegend.map(([lang]) => (
            <div key={lang} className="flex items-center gap-1.5 flex-shrink-0">
              <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: LANG_COLORS[lang] ?? LANG_COLORS.Other }} />
              <span className="text-xs font-mono text-content-secondary">{lang}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Content ── */}
      <div className="flex-1 p-3 min-h-0">
        {view === 'graph' ? (
          <RepoGraphView owner={owner} name={name} />
        ) : mapLoading ? (
          <div className="flex items-center justify-center h-full gap-3">
            <Loader2 size={20} className="animate-spin text-amber" />
            <span className="text-content-secondary text-sm font-mono">Loading file map…</span>
          </div>
        ) : !mapData || mapData.count === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <ScanSearch size={36} className="text-content-muted" />
            <p className="text-content-secondary text-sm font-semibold">No files indexed yet</p>
            <p className="text-content-muted text-xs font-mono">
              Use the <span className="text-amber">Rescan</span> button to index this repo into Neo4j.
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

      {/* ── Footer ── */}
      <div className="px-5 py-2 border-t border-surface-border bg-surface/60 flex-shrink-0">
        <p className="text-content-muted text-caption font-mono">
          {view === 'graph'
            ? 'Nodes = files · indigo arrows = import edges · amber lines = co-change edges · glow = PR hotspot · Rescan to rebuild import graph'
            : mode === 'size'
            ? 'Cell size = file size in bytes · colour = language'
            : 'Cell size = number of PRs that touched the file · larger = more activity'}
        </p>
      </div>
    </div>
  );
}

/* ─── Repo context panel ─────────────────────────────────────────────────── */
function RepoContextPanel({ repoFullName }: { repoFullName: string }) {
  const [newRule, setNewRule] = useState('');
  const { data, isLoading } = useMemories(repoFullName);
  const addMemory = useAddMemory();
  const deleteMemory = useDeleteMemory(repoFullName);

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

      {isLoading ? (
        <Skeleton className="h-10 rounded-lg bg-surface-elevated" />
      ) : rules.length > 0 ? (
        <div className="space-y-1.5">
          {rules.map((m) => (
            <div key={m.id} className="flex items-start gap-2 bg-surface-subtle rounded-lg px-3 py-2">
              <p className="flex-1 text-xs text-content-secondary font-mono leading-relaxed">{m.memory ?? m.content}</p>
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
        toast.success(`Connected ${repo.full_name}! Scanning repo…`);
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
    <div className={cn('nectr-card transition-all hover:border-amber/30', repo.is_connected && 'border-amber/20 shadow-amber-glow')}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', repo.is_connected ? 'bg-amber/10' : 'bg-surface-subtle')}>
            <GitBranch size={16} className={repo.is_connected ? 'text-amber' : 'text-content-muted'} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold truncate">{repo.full_name}</span>
              {repo.private
                ? <Lock size={11} className="text-content-muted flex-shrink-0" />
                : <Globe size={11} className="text-content-muted flex-shrink-0" />
              }
            </div>
            {repo.description && <p className="text-content-secondary text-xs mt-0.5 truncate">{repo.description}</p>}
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
              {rescan.isPending ? <Loader2 size={13} className="animate-spin" /> : <ScanSearch size={13} />}
              {rescan.isPending ? 'Scanning...' : 'Rescan'}
            </button>
          )}
          {repo.is_connected && (
            <button
              onClick={() => setMapOpen(true)}
              className="btn-nectr-secondary text-xs px-3 py-2"
              title="View codebase graph"
            >
              <Network size={13} />
              Graph
            </button>
          )}
          {repo.is_connected && (
            <button
              onClick={() => setContextOpen((o) => !o)}
              className={cn('btn-nectr-secondary text-xs px-3 py-2', contextOpen && 'border-amber/40 text-amber')}
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
            {isPending ? <Loader2 size={13} className="animate-spin" /> : repo.is_connected ? 'Disconnect' : 'Connect'}
          </button>
        </div>
      </div>

      {repo.is_connected && contextOpen && <RepoContextPanel repoFullName={repo.full_name} />}
      {repo.is_connected && mapOpen && <RepoMapModal repo={repo} onClose={() => setMapOpen(false)} />}
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
        <button onClick={() => refetch()} disabled={isFetching} className="btn-nectr-secondary text-xs">
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="nectr-card border-amber/20 bg-amber/5">
        <div className="flex items-start gap-3">
          <GitPullRequest size={16} className="text-amber mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-amber mb-1">How it works</p>
            <p className="text-xs text-content-secondary leading-relaxed">
              Connect a repo to install a GitHub webhook. Nectr will automatically review every PR opened on that repo,
              post AI feedback, and build a knowledge graph of your codebase. Use the{' '}
              <span className="text-amber font-bold">Graph</span> button to explore the force-directed file graph, or{' '}
              <span className="text-amber font-bold">Context</span> to add project rules that guide every review.
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl bg-surface-elevated" />)}
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
