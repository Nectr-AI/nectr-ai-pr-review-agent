'use client';
import { useState } from 'react';
import { Key, Plus, Trash2, Copy, Check, Eye, EyeOff } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import toast from 'react-hot-toast';

interface MockKey {
  id: string;
  name: string;
  preview: string;
  created_at: string;
  last_used_at: string | null;
}

// Mock data until backend implements API key endpoints
const MOCK_KEYS: MockKey[] = [];

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<MockKey[]>(MOCK_KEYS);
  const [newKeyName, setNewKeyName] = useState('');
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  const handleGenerate = () => {
    if (!newKeyName.trim()) return;
    const raw = `nk_${Array.from({ length: 40 }, () => Math.random().toString(36)[2]).join('')}`;
    const preview = `${raw.slice(0, 8)}${'•'.repeat(24)}${raw.slice(-4)}`;
    const newKey: MockKey = {
      id: Date.now().toString(),
      name: newKeyName.trim(),
      preview,
      created_at: new Date().toISOString(),
      last_used_at: null,
    };
    setGeneratedKey(raw);
    setKeys((prev) => [newKey, ...prev]);
    setNewKeyName('');
  };

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = (id: string) => {
    setKeys((prev) => prev.filter((k) => k.id !== id));
    toast.success('API key revoked');
  };

  const handleDownloadEnv = () => {
    if (!generatedKey) return;
    const blob = new Blob([`NECTR_API_KEY=${generatedKey}\n`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '.env.nectr';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h1 font-black tracking-tight">API Keys</h1>
          <p className="text-content-secondary text-body mt-1">Manage programmatic access to Nectr</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setGeneratedKey(null); setShowKey(false); } }}>
          <DialogTrigger asChild>
            <button className="btn-nectr-primary text-sm">
              <Plus size={14}/> Create New Key
            </button>
          </DialogTrigger>
          <DialogContent className="bg-surface-elevated border-surface-border text-content-primary">
            <DialogHeader>
              <DialogTitle className="text-lg font-black tracking-tight">Create API Key</DialogTitle>
            </DialogHeader>
            {!generatedKey ? (
              <div className="space-y-4">
                <div>
                  <label className="label-mono block mb-2">Key Name</label>
                  <input
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                    placeholder="e.g. CI/CD Pipeline, Mobile App"
                    className="nectr-input"
                  />
                  <p className="text-content-muted text-xs mt-1.5">Name helps you identify where this key is used.</p>
                </div>
                <button
                  onClick={handleGenerate}
                  disabled={!newKeyName.trim()}
                  className="btn-nectr-primary w-full justify-center"
                >
                  <Key size={14}/> Generate Key
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="nectr-card border-success/30 bg-success/5">
                  <p className="text-success text-sm font-bold mb-2">Key generated! Save it now.</p>
                  <p className="text-content-secondary text-xs mb-3">This key will never be shown again.</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 font-mono text-xs bg-surface-subtle border border-surface-border rounded px-3 py-2 overflow-hidden">
                      {showKey ? generatedKey : generatedKey.replace(/./g, (c, i) => i < 3 || i > generatedKey.length - 5 ? c : '•')}
                    </code>
                    <button onClick={() => setShowKey(!showKey)} className="text-content-muted hover:text-content-primary p-1.5">
                      {showKey ? <EyeOff size={14}/> : <Eye size={14}/>}
                    </button>
                    <button onClick={() => handleCopy(generatedKey, 'new')} className="text-content-muted hover:text-amber p-1.5">
                      {copiedId === 'new' ? <Check size={14} className="text-success"/> : <Copy size={14}/>}
                    </button>
                  </div>
                </div>
                <button onClick={handleDownloadEnv} className="btn-nectr-secondary w-full justify-center text-sm">
                  Download as .env.nectr
                </button>
                <button onClick={() => setOpen(false)} className="btn-nectr-primary w-full justify-center">
                  Done
                </button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Info */}
      <div className="nectr-card border-amber/20 bg-amber/5">
        <p className="text-xs text-content-secondary leading-relaxed">
          API keys grant full access to your Nectr data. Keep them secret. Keys auto-expire after 90 days of non-use.
          <br />
          <strong className="text-amber">Backend API key endpoints are coming soon</strong> — keys below are locally managed previews.
        </p>
      </div>

      {/* Keys list */}
      {keys.length === 0 ? (
        <div className="nectr-card flex flex-col items-center py-16 gap-4">
          <Key size={28} className="text-content-muted"/>
          <div className="text-center">
            <p className="text-content-primary font-semibold">No API keys yet</p>
            <p className="text-content-secondary text-sm mt-1">Create a key to access Nectr programmatically</p>
          </div>
        </div>
      ) : (
        <div className="nectr-card p-0 overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-3 border-b border-surface-border bg-surface-subtle">
            <span className="label-mono">Name & Key</span>
            <span className="label-mono hidden sm:block">Created</span>
            <span className="label-mono hidden sm:block">Last Used</span>
            <span className="label-mono">Actions</span>
          </div>
          {keys.map((k) => (
            <div key={k.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-4 border-b border-surface-border last:border-0 items-center hover:bg-surface-subtle transition-colors">
              <div>
                <p className="font-semibold text-sm">{k.name}</p>
                <code className="text-xs font-mono text-content-secondary">{k.preview}</code>
              </div>
              <span className="text-xs font-mono text-content-secondary hidden sm:block">
                {new Date(k.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <span className="text-xs font-mono text-content-muted hidden sm:block">
                {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopy(k.preview, k.id)}
                  className="text-content-muted hover:text-amber transition-colors p-1"
                  title="Copy"
                >
                  {copiedId === k.id ? <Check size={14} className="text-success"/> : <Copy size={14}/>}
                </button>
                <button
                  onClick={() => handleDelete(k.id)}
                  className="text-content-muted hover:text-danger transition-colors p-1"
                  title="Revoke"
                >
                  <Trash2 size={14}/>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
