'use client';
import { useState } from 'react';
import { Save, MessageSquarePlus, Settings2, Brain, Plus, Trash2, RefreshCw, FileText, Loader2 } from 'lucide-react';
import { useRepos } from '@/hooks/useRepos';
import { useMemories, useProjectMap, useAddMemory, useDeleteMemory, useRescanRepo, useMemoryStats } from '@/hooks/useMemory';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

type Tab = 'context' | 'memory' | 'agent';

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'context', label: 'Custom Context', icon: <MessageSquarePlus size={14} /> },
  { key: 'memory',  label: 'Project Memory',  icon: <Brain size={14} />            },
  { key: 'agent',   label: 'Agent Config',    icon: <Settings2 size={14} />        },
];

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('context');
  const [context, setContext] = useState('');
  const [newRule, setNewRule] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);

  const { data: repos } = useRepos();
  const connected = repos?.filter((r) => r.is_connected) ?? [];
  const repo = selectedRepo ?? connected[0]?.full_name ?? null;

  const { data: memoriesData, isLoading: memoriesLoading } = useMemories(repo);
  const { data: projectMapData, refetch: refetchMap } = useProjectMap(repo);
  const { data: statsData } = useMemoryStats(repo);
  const addMemory  = useAddMemory();
  const deleteMem  = useDeleteMemory(repo);
  const rescan     = useRescanRepo();

  const handleAddContext = () => {
    if (!repo || !context.trim()) return;
    addMemory.mutate(
      { repo, content: context.trim(), memory_type: 'project_rule' },
      { onSuccess: () => { toast.success('Saved as project rule'); setContext(''); } },
    );
  };

  const handleAddRule = () => {
    if (!repo || !newRule.trim()) return;
    addMemory.mutate(
      { repo, content: newRule.trim(), memory_type: 'project_rule' },
      { onSuccess: () => { toast.success('Memory added'); setNewRule(''); } },
    );
  };

  const handleDelete = (id: string) => {
    deleteMem.mutate(id, {
      onSuccess: () => toast.success('Memory deleted'),
      onError: () => toast.error('Failed to delete memory'),
    });
  };

  const handleRescan = () => {
    if (!repo) return;
    rescan.mutate(repo, {
      onSuccess: () => toast.success('Rescan started — this may take a minute'),
      onError: () => toast.error('Rescan failed'),
    });
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-h1 font-black tracking-tight">Settings</h1>
        <p className="text-content-secondary text-body mt-1">Configure your Nectr agent</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-surface-border overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-2 px-5 py-3 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap',
              tab === t.key
                ? 'border-amber text-amber -mb-0.5'
                : 'border-transparent text-content-secondary hover:text-content-primary',
            )}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Repo selector (shared across tabs) */}
      {connected.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="label-mono">Repository</span>
          <select
            value={repo ?? ''}
            onChange={(e) => setSelectedRepo(e.target.value)}
            className="nectr-input w-72 bg-surface-subtle cursor-pointer"
          >
            {connected.map((r) => (
              <option key={r.id} value={r.full_name}>{r.full_name}</option>
            ))}
          </select>
        </div>
      )}

      {connected.length === 0 && (
        <div className="nectr-card border-amber/20 text-center py-10">
          <p className="text-content-secondary text-sm">Connect a repo first to manage settings.</p>
        </div>
      )}

      {/* Custom Context Tab */}
      {tab === 'context' && connected.length > 0 && (
        <div className="space-y-4">
          <div className="nectr-card border-amber/20 bg-amber/5">
            <p className="text-sm font-bold text-amber mb-1 uppercase tracking-wider">Custom Context</p>
            <p className="text-content-secondary text-xs leading-relaxed">
              Add project rules or architectural decisions. These are stored as memories and injected into every AI review for this repo.
            </p>
          </div>
          <div>
            <label className="label-mono block mb-2">Context / Rules</label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder={"Example:\n- All API endpoints must validate input\n- DB writes must be transactional\n- Never use bare except clauses"}
              rows={10}
              className="nectr-input resize-none font-mono text-xs leading-relaxed"
            />
            <p className="text-content-muted text-caption font-mono mt-1">{context.length} characters</p>
          </div>
          <button
            onClick={handleAddContext}
            disabled={!repo || !context.trim() || addMemory.isPending}
            className="btn-nectr-primary"
          >
            {addMemory.isPending ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>}
            Save as Project Rule
          </button>
        </div>
      )}

      {/* Memory Tab */}
      {tab === 'memory' && connected.length > 0 && (
        <div className="space-y-5">
          {/* Stats */}
          {statsData && (
            <div className="grid grid-cols-3 gap-3">
              <div className="nectr-card text-center">
                <p className="text-h2 font-black text-amber">{statsData.total}</p>
                <p className="label-mono mt-1">Total Memories</p>
              </div>
              {Object.entries(statsData.by_type).slice(0, 2).map(([type, count]) => (
                <div key={type} className="nectr-card text-center">
                  <p className="text-h2 font-black">{count}</p>
                  <p className="label-mono mt-1 truncate">{type.replace('_', ' ')}</p>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleRescan}
              disabled={!repo || rescan.isPending}
              className="btn-nectr-secondary text-xs"
            >
              <RefreshCw size={13} className={rescan.isPending ? 'animate-spin' : ''} />
              Rescan Repository
            </button>
            <button
              onClick={() => refetchMap()}
              disabled={!repo}
              className="btn-nectr-secondary text-xs"
            >
              <FileText size={13} /> Refresh Project Map
            </button>
          </div>

          {/* Project Map */}
          {(projectMapData?.memories?.length ?? 0) > 0 && (
            <div>
              <p className="label-mono mb-2">Project Map ({projectMapData?.count})</p>
              <div className="nectr-card space-y-2 max-h-48 overflow-y-auto">
                {projectMapData?.memories.map((m) => (
                  <div key={m.id} className="text-xs text-content-secondary border-b border-surface-border pb-2 last:border-0 leading-relaxed">
                    {m.memory ?? m.content}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add rule */}
          <div>
            <label className="label-mono block mb-2">Add a Memory</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newRule}
                onChange={(e) => setNewRule(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddRule()}
                placeholder="e.g. All endpoints must have rate limiting"
                className="nectr-input flex-1"
              />
              <button
                onClick={handleAddRule}
                disabled={!repo || !newRule.trim() || addMemory.isPending}
                className="btn-nectr-primary"
              >
                {addMemory.isPending ? <Loader2 size={14} className="animate-spin"/> : <Plus size={14}/>}
                Add
              </button>
            </div>
          </div>

          {/* Memories list */}
          <div>
            <p className="label-mono mb-2">All Memories ({memoriesData?.count ?? 0})</p>
            {memoriesLoading ? (
              <div className="space-y-2">
                {Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-12 rounded-lg bg-surface-elevated"/>)}
              </div>
            ) : (memoriesData?.memories?.length ?? 0) === 0 ? (
              <div className="nectr-card text-center py-8">
                <Brain size={24} className="text-content-muted mx-auto mb-2"/>
                <p className="text-content-secondary text-sm">No memories yet. Connect a repo and run PR reviews, or add rules above.</p>
              </div>
            ) : (
              <div className="nectr-card p-0 divide-y divide-surface-border">
                {memoriesData?.memories.map((m) => (
                  <div key={m.id} className="flex items-start justify-between gap-4 px-5 py-3.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-content-secondary leading-relaxed">{m.memory ?? m.content}</p>
                      {m.metadata?.memory_type && (
                        <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full bg-surface-border text-caption font-mono text-content-muted">
                          {m.metadata.memory_type}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(m.id)}
                      disabled={deleteMem.isPending}
                      className="text-content-muted hover:text-danger transition-colors p-1 flex-shrink-0 mt-0.5"
                      title="Delete memory"
                    >
                      <Trash2 size={14}/>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Agent Config Tab */}
      {tab === 'agent' && (
        <div className="space-y-4">
          <div className="nectr-card">
            <label className="label-mono block mb-3">Max Diff Size</label>
            <input type="number" defaultValue={15000} className="nectr-input w-40"/>
            <p className="text-content-muted text-xs mt-1.5">Characters. Larger diffs are truncated before sending to AI.</p>
          </div>
          <div className="nectr-card">
            <label className="label-mono block mb-3">Confidence Threshold</label>
            <select className="nectr-input w-52 bg-surface-subtle cursor-pointer" defaultValue="3">
              {[
                { v: '1', l: '1 — Very Risky' },
                { v: '2', l: '2 — Risky' },
                { v: '3', l: '3 — Neutral' },
                { v: '4', l: '4 — Safe' },
                { v: '5', l: '5 — Very Safe' },
              ].map(({v, l}) => <option key={v} value={v} className="bg-surface-subtle">{l}</option>)}
            </select>
            <p className="text-content-muted text-xs mt-1.5">Minimum confidence required for auto-approve.</p>
          </div>
          <div className="nectr-card">
            <label className="label-mono block mb-3">Review on PR Events</label>
            <div className="space-y-2">
              {['opened', 'synchronize', 'reopened'].map((action) => (
                <label key={action} className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" defaultChecked className="accent-amber w-4 h-4" />
                  <span className="text-sm font-mono">{action}</span>
                </label>
              ))}
            </div>
          </div>
          <button
            onClick={() => toast.success('Config saved (preview only — backend coming soon)')}
            className="btn-nectr-primary"
          >
            <Save size={14}/> Save Config
          </button>
        </div>
      )}
    </div>
  );
}
