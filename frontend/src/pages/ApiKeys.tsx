import { useState } from 'react';
import { Key, Plus, Trash2, Copy, Check } from 'lucide-react';
import { AppLayout } from '../components/AppLayout';
import { formatDistanceToNow } from '../lib/utils';
import type { ApiKey } from '../types';

// Mock data — will be replaced with real API calls
const MOCK_KEYS: ApiKey[] = [];

export default function ApiKeys() {
  const [keys] = useState<ApiKey[]>(MOCK_KEYS);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showNewKeyModal, setShowNewKeyModal] = useState(false);
  const [keyName, setKeyName] = useState('');

  const handleGenerate = () => {
    // TODO: POST /api/v1/api-keys
    const generated = `nk_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    setNewKey(generated);
    setShowNewKeyModal(false);
  };

  const handleCopy = () => {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <AppLayout title="API Keys">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tight text-white">API Keys</h2>
          <p className="text-[#555] text-sm mt-0.5">Manage programmatic access to NECTR</p>
        </div>
        <button
          onClick={() => setShowNewKeyModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={14} />
          Generate Key
        </button>
      </div>

      {/* New key reveal */}
      {newKey && (
        <div className="card-yellow mb-6">
          <p className="text-[#F5C800] font-bold text-xs uppercase tracking-wider mb-3">
            ⚠ Copy this key now. It won't be shown again.
          </p>
          <div className="flex items-center gap-3 bg-black border border-[#333] px-4 py-3">
            <code className="text-[#F5C800] font-mono text-sm flex-1 break-all">{newKey}</code>
            <button onClick={handleCopy} className="text-[#555] hover:text-[#F5C800] flex-shrink-0 transition-colors">
              {copied ? <Check size={16} className="text-[#F5C800]" /> : <Copy size={16} />}
            </button>
          </div>
          <button
            onClick={() => setNewKey(null)}
            className="mt-3 text-[#555] text-xs uppercase tracking-wider hover:text-white transition-colors"
          >
            I've saved it — dismiss
          </button>
        </div>
      )}

      {/* Generate modal */}
      {showNewKeyModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="card-yellow w-full max-w-md">
            <h3 className="text-white font-bold text-lg uppercase tracking-wide mb-4">New API Key</h3>
            <label className="section-label block mb-2">Key Name</label>
            <input
              type="text"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="e.g. CI Pipeline, Production"
              className="nectr-input mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <button onClick={handleGenerate} className="btn-primary flex-1" disabled={!keyName.trim()}>
                Generate
              </button>
              <button onClick={() => setShowNewKeyModal(false)} className="btn-secondary flex-1">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keys table */}
      {keys.length > 0 ? (
        <div className="border-2 border-[#222]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-[#222] bg-[#111]">
                <th className="text-left px-4 py-3 text-[#555] font-bold uppercase text-xs tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-[#555] font-bold uppercase text-xs tracking-wider">Key</th>
                <th className="text-left px-4 py-3 text-[#555] font-bold uppercase text-xs tracking-wider hidden md:table-cell">Created</th>
                <th className="text-left px-4 py-3 text-[#555] font-bold uppercase text-xs tracking-wider hidden md:table-cell">Last Used</th>
                <th className="px-4 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id} className="border-b border-[#1a1a1a] hover:bg-[#111]">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <Key size={12} className="text-[#F5C800]" />
                      <span className="text-white font-medium">{key.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <code className="text-[#555] font-mono text-xs">{key.key_preview}</code>
                  </td>
                  <td className="px-4 py-3.5 text-[#555] text-xs hidden md:table-cell">
                    {formatDistanceToNow(key.created_at)}
                  </td>
                  <td className="px-4 py-3.5 text-[#555] text-xs hidden md:table-cell">
                    {key.last_used_at ? formatDistanceToNow(key.last_used_at) : 'Never'}
                  </td>
                  <td className="px-4 py-3.5">
                    <button className="text-[#333] hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card text-center py-16">
          <Key size={24} className="text-[#333] mx-auto mb-3" />
          <p className="text-[#555] text-sm uppercase tracking-wider">No API keys yet</p>
          <p className="text-[#333] text-xs mt-1">Generate a key to use NECTR programmatically</p>
        </div>
      )}
    </AppLayout>
  );
}
