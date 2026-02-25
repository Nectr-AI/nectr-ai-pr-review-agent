import { useState } from 'react';
import { Save, MessageSquarePlus, Settings2, Bell } from 'lucide-react';
import { AppLayout } from '../components/AppLayout';

type Tab = 'context' | 'agent' | 'notifications';

export default function Settings() {
  const [tab, setTab] = useState<Tab>('context');
  const [context, setContext] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    // TODO: call PATCH /api/v1/settings
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'context', label: 'Custom Context', icon: <MessageSquarePlus size={14} /> },
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
              Add context about your codebase. This is prepended to every AI review to help Claude understand your project's conventions and architecture.
            </p>
          </div>
          <div className="mb-4">
            <label className="section-label block mb-2">Context</label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder={`Example:\n- This is a FastAPI project using async SQLAlchemy\n- We use conventional commits\n- All API routes must have error handling\n- Never use bare except clauses`}
              rows={10}
              className="nectr-input resize-none font-mono text-xs leading-relaxed"
            />
            <p className="text-[#333] text-xs mt-1">{context.length} characters</p>
          </div>
          <button onClick={handleSave} className="btn-primary flex items-center gap-2">
            <Save size={14} />
            {saved ? 'Saved!' : 'Save Context'}
          </button>
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
