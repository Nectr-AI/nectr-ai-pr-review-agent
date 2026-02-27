import { useState } from 'react';
import { Save, MessageSquarePlus, Settings2, Bell, Brain, Plus, Trash2, RefreshCw, FileText } from 'lucide-react';
import { AppLayout } from '../components/AppLayout';
import { useRepos } from '../hooks/useRepos';
import {
  useMemories,
  useProjectMap,
  useAddMemory,
  useDeleteMemory,
  useRescanRepo,
} from '../hooks/useMemory';

type Tab = 'context' | 'agent' | 'notifications' | 'memory';

export default function Settings() {
  const [tab, setTab] = useState<Tab>('context');
  const [context, setContext] = useState('');
  const [saved, setSaved] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [newRule, setNewRule] = useState('');

  const { data: repos } = useRepos();
  const connectedRepos = repos?.filter((r) => r.is_connected) ?? [];
  const repoForMemory = selectedRepo || connectedRepos[0]?.full_name || null;

  const { data: memoriesData, isLoading: memoriesLoading } = useMemories(repoForMemory);
  const { data: projectMapData, refetch: refetchMap } = useProjectMap(repoForMemory);
  const addMemory = useAddMemory();
  const deleteMemory = useDeleteMemory(repoForMemory);
  const rescan = useRescanRepo();

  const handleSaveContext = () => {
    if (!repoForMemory || !context.trim()) return;
    addMemory.mutate(
      { repo: repoForMemory, content: context.trim(), memory_type: 'project_rule' },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
      }
    );
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'context', label: 'Custom Context', icon: <MessageSquarePlus size={14} /> },
    { key: 'memory', label: 'Memory', icon: <Brain size={14} /> },
    { key: 'agent', label: 'Agent Config', icon: <Settings2 size={14} /> },
    { key: 'notifications', label: 'Notifications', icon: <Bell size={14} /> },
  ];

  return (
    <AppLayout title="Settings">
      <div className="mb-6">
        <h2 className="text-2xl font-black uppercase tracking-tight text-white">Settings</h2>
        <p className="text-[#555] text-sm mt-0.5">Configure your NECTR agent</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b-2 border-[#222] mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors ${
              tab === t.key
                ? 'border-[#F5C800] text-[#F5C800] -mb-0.5'
                : 'border-transparent text-[#555] hover:text-white'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Custom Context */}
      {tab === 'context' && (
        <div className="max-w-2xl">
          <div className="card-yellow mb-6">
            <p className="text-white font-bold text-sm mb-1 uppercase tracking-wider">Custom Context</p>
            <p className="text-[#999] text-sm">
              Add project rules or context. Stored as a memory and used in AI reviews for the selected repo.
            </p>
          </div>
          {connectedRepos.length > 0 && (
            <div className="mb-4">
              <label className="section-label block mb-2">Repository</label>
              <select
                value={selectedRepo || connectedRepos[0]?.full_name || ''}
                onChange={(e) => setSelectedRepo(e.target.value || null)}
                className="nectr-input w-full max-w-md"
              >
                {connectedRepos.map((r) => (
                  <option key={r.id} value={r.full_name}>{r.full_name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="mb-4">
            <label className="section-label block mb-2">Context / Rule</label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder={`Example:\n- All endpoints must have rate limiting\n- DB writes must be transactional\n- Never use bare except clauses`}
              rows={10}
              className="nectr-input resize-none font-mono text-xs leading-relaxed"
            />
            <p className="text-[#333] text-xs mt-1">{context.length} characters</p>
          </div>
          <button
            onClick={handleSaveContext}
            disabled={!repoForMemory || !context.trim() || addMemory.isPending}
            className="btn-primary flex items-center gap-2"
          >
            <Save size={14} />
            {addMemory.isPending ? 'Saving...' : saved ? 'Saved!' : 'Save as Project Rule'}
          </button>
        </div>
      )}

      {/* Memory */}
      {tab === 'memory' && (
        <div className="max-w-2xl">
          <div className="card-yellow mb-6">
            <p className="text-white font-bold text-sm mb-1 uppercase tracking-wider">Project Memory</p>
            <p className="text-[#999] text-sm">
              View and manage AI-learned memories. Add rules manually or rescan the project to refresh.
            </p>
          </div>
          {connectedRepos.length === 0 ? (
            <p className="text-[#555] text-sm">Connect a repo first to view memories.</p>
          ) : (
            <>
              <div className="mb-4">
                <label className="section-label block mb-2">Repository</label>
                <select
                  value={repoForMemory || ''}
                  onChange={(e) => setSelectedRepo(e.target.value || null)}
                  className="nectr-input w-full max-w-md"
                >
                  {connectedRepos.map((r) => (
                    <option key={r.id} value={r.full_name}>{r.full_name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 mb-6">
                <button
                  onClick={() => repoForMemory && rescan.mutate(repoForMemory)}
                  disabled={!repoForMemory || rescan.isPending}
                  className="btn-secondary text-xs flex items-center gap-2"
                >
                  <RefreshCw size={12} className={rescan.isPending ? 'animate-spin' : ''} />
                  Rescan Project
                </button>
                <button
                  onClick={() => refetchMap()}
                  disabled={!repoForMemory}
                  className="btn-secondary text-xs flex items-center gap-2"
                >
                  <FileText size={12} />
                  Refresh Map
                </button>
              </div>
              <div className="mb-6">
                <p className="section-label mb-2">Project Map</p>
                {projectMapData?.memories?.length ? (
                  <div className="card space-y-2 max-h-48 overflow-y-auto">
                    {projectMapData.memories.map((m) => (
                      <div key={m.id} className="text-sm text-[#999] border-b border-[#222] pb-2 last:border-0">
                        {m.memory || (m as any).content}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[#555] text-sm">No project map yet. Click Rescan Project to build from the codebase.</p>
                )}
              </div>
              <div className="mb-4">
                <label className="section-label block mb-2">Add Rule</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newRule}
                    onChange={(e) => setNewRule(e.target.value)}
                    placeholder="e.g. All endpoints must have error handling"
                    className="nectr-input flex-1"
                  />
                  <button
                    onClick={() => {
                      if (repoForMemory && newRule.trim()) {
                        addMemory.mutate(
                          { repo: repoForMemory, content: newRule.trim() },
                          { onSuccess: () => setNewRule('') }
                        );
                      }
                    }}
                    disabled={!repoForMemory || !newRule.trim() || addMemory.isPending}
                    className="btn-primary flex items-center gap-1"
                  >
                    <Plus size={14} />
                    Add
                  </button>
                </div>
              </div>
              <p className="section-label mb-2">Memories ({memoriesData?.count ?? 0})</p>
              {memoriesLoading ? (
                <div className="h-24 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-[#F5C800] border-t-transparent animate-spin" />
                </div>
              ) : memoriesData?.memories?.length ? (
                <div className="card space-y-2">
                  {memoriesData.memories.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-start justify-between gap-4 py-2 border-b border-[#222] last:border-0"
                    >
                      <span className="text-sm text-[#999] flex-1 min-w-0">
                        {m.memory || (m as any).content}
                      </span>
                      <button
                        onClick={() => deleteMemory.mutate(m.id)}
                        disabled={deleteMemory.isPending}
                        className="text-red-400 hover:text-red-300 p-1"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[#555] text-sm">No memories yet. Connect a repo and run a PR review, or add a rule above.</p>
              )}
            </>
          )}
        </div>
      )}

      {/* Agent Config */}
      {tab === 'agent' && (
        <div className="max-w-2xl">
          <div className="flex flex-col gap-4">
            <div className="card">
              <label className="section-label block mb-2">Max Diff Size</label>
              <input type="number" defaultValue={15000} className="nectr-input w-32" />
              <p className="text-[#333] text-xs mt-1">Characters. Larger diffs are truncated.</p>
            </div>
            <div className="card">
              <label className="section-label block mb-2">Confidence Threshold</label>
              <select className="nectr-input w-48 bg-[#111] cursor-pointer">
                <option value="1" className="bg-[#111]">1 — Very Risky</option>
                <option value="2" className="bg-[#111]">2 — Risky</option>
                <option value="3" className="bg-[#111]" selected>3 — Neutral</option>
                <option value="4" className="bg-[#111]">4 — Safe</option>
                <option value="5" className="bg-[#111]">5 — Very Safe</option>
              </select>
              <p className="text-[#333] text-xs mt-1">Minimum confidence for auto-approve.</p>
            </div>
            <div className="card">
              <label className="section-label block mb-2">Review on</label>
              <div className="flex flex-col gap-2 mt-2">
                {['opened', 'synchronize', 'reopened'].map((action) => (
                  <label key={action} className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" defaultChecked className="accent-[#F5C800] w-4 h-4" />
                    <span className="text-white text-sm font-mono">{action}</span>
                  </label>
                ))}
              </div>
            </div>
            <button onClick={handleSave} className="btn-primary flex items-center gap-2 w-fit">
              <Save size={14} />
              {saved ? 'Saved!' : 'Save Config'}
            </button>
          </div>
        </div>
      )}

      {/* Notifications */}
      {tab === 'notifications' && (
        <div className="max-w-2xl">
          <div className="flex flex-col gap-4">
            <div className="card">
              <label className="section-label block mb-2">Slack Webhook URL</label>
              <input
                type="url"
                placeholder="https://hooks.slack.com/services/..."
                className="nectr-input"
              />
              <p className="text-[#333] text-xs mt-1">Get notified in Slack when reviews fail.</p>
            </div>
            <div className="card">
              <label className="section-label block mb-2">Email Alerts</label>
              <input type="email" placeholder="your@email.com" className="nectr-input" />
              <p className="text-[#333] text-xs mt-1">Get email on critical failures.</p>
            </div>
            <button onClick={handleSave} className="btn-primary flex items-center gap-2 w-fit">
              <Save size={14} />
              {saved ? 'Saved!' : 'Save Notifications'}
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
