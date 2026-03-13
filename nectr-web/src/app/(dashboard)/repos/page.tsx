'use client';
import { useState } from 'react';
import { useRepos, useInstallRepo, useUninstallRepo, useRescanRepo } from '@/hooks/useRepos';
import { useMemories, useAddMemory, useDeleteMemory } from '@/hooks/useMemory';
import { Skeleton } from '@/components/ui/skeleton';
import {
  GitBranch, Lock, Globe, CheckCircle, Loader2, RefreshCw,
  GitPullRequest, ScanSearch, ChevronDown, ChevronUp, Plus, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Repo } from '@/types';
import toast from 'react-hot-toast';

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
