import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ScrollText,
  BarChart2,
  MessageSquarePlus,
  GitBranch,
  Plug,
  Key,
  BookOpen,
  Building2,
  Settings,
  Zap,
  ChevronDown,
} from 'lucide-react';
import { useState } from 'react';
import { useAuthContext } from '../contexts/AuthContext';

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  indent?: boolean;
}

function NavItem({ to, icon, label, indent = false }: NavItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-2.5 text-sm transition-all duration-150 ${
          indent ? 'pl-10' : 'pl-4'
        } ${
          isActive
            ? 'border-l-2 border-[#F5C800] text-[#F5C800] bg-[#111111] font-semibold'
            : 'border-l-2 border-transparent text-[#999999] hover:text-white hover:bg-[#111111]'
        }`
      }
    >
      <span className="flex-shrink-0 w-4 h-4">{icon}</span>
      <span>{label}</span>
    </NavLink>
  );
}

export function Sidebar() {
  const [reviewExpanded, setReviewExpanded] = useState(true);
  const { user } = useAuthContext();

  return (
    <aside className="w-60 min-h-screen bg-black border-r-2 border-[#222222] flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b-2 border-[#222222]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#F5C800] flex items-center justify-center">
            <Zap className="w-5 h-5 text-black" strokeWidth={2.5} />
          </div>
          <span className="text-[#F5C800] font-black text-xl tracking-widest uppercase">NECTR</span>
        </div>
      </div>

      <nav className="flex-1 py-4 overflow-y-auto">
        {/* Home */}
        <div className="mb-1">
          <NavItem to="/dashboard" icon={<LayoutDashboard size={14} />} label="Home" />
        </div>

        {/* Features */}
        <div className="mt-4 mb-1">
          <p className="px-4 pb-1 text-[#555555] text-[10px] font-bold uppercase tracking-widest">Features</p>

          {/* Code Review Agent — collapsible */}
          <button
            onClick={() => setReviewExpanded(!reviewExpanded)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-[#999999] hover:text-white hover:bg-[#111111] transition-all"
          >
            <div className="flex items-center gap-3">
              <GitBranch size={14} />
              <span>Code Review Agent</span>
            </div>
            <ChevronDown
              size={12}
              className={`transition-transform ${reviewExpanded ? 'rotate-180' : ''}`}
            />
          </button>

          {reviewExpanded && (
            <>
              <NavItem to="/logs" icon={<ScrollText size={14} />} label="Logs" indent />
              <NavItem to="/analytics" icon={<BarChart2 size={14} />} label="Analytics" indent />
              <NavItem to="/settings" icon={<Settings size={14} />} label="Settings" indent />
              <NavItem to="/context" icon={<MessageSquarePlus size={14} />} label="Custom Context" indent />
            </>
          )}
        </div>

        {/* Connections */}
        <div className="mt-4 mb-1">
          <p className="px-4 pb-1 text-[#555555] text-[10px] font-bold uppercase tracking-widest">Connections</p>
          <NavItem to="/integrations" icon={<Plug size={14} />} label="Integrations" />
          <NavItem to="/repos" icon={<GitBranch size={14} />} label="Code Providers" />
        </div>

        {/* API */}
        <div className="mt-4 mb-1">
          <p className="px-4 pb-1 text-[#555555] text-[10px] font-bold uppercase tracking-widest">API</p>
          <NavItem to="/api-keys" icon={<Key size={14} />} label="API Keys" />
          <NavItem to="/docs" icon={<BookOpen size={14} />} label="Documentation" />
        </div>

        {/* Account */}
        <div className="mt-4 mb-1">
          <p className="px-4 pb-1 text-[#555555] text-[10px] font-bold uppercase tracking-widest">Account</p>
          <NavItem to="/organization" icon={<Building2 size={14} />} label="Organization" />
        </div>
      </nav>

      {/* User footer */}
      {user && (
        <div className="border-t-2 border-[#222222] p-4">
          <div className="flex items-center gap-3">
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.github_username}
                className="w-8 h-8 object-cover border border-[#333]"
              />
            ) : (
              <div className="w-8 h-8 bg-[#F5C800] flex items-center justify-center">
                <span className="text-black font-bold text-xs">
                  {user.github_username?.[0]?.toUpperCase()}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold truncate">{user.name || user.github_username}</p>
              <p className="text-[#555] text-xs truncate">@{user.github_username}</p>
            </div>
          </div>
          <a
            href={`${BACKEND_URL}/auth/logout`}
            className="mt-3 block text-center text-xs text-[#555] hover:text-[#F5C800] transition-colors uppercase tracking-wider"
          >
            Sign out
          </a>
        </div>
      )}
    </aside>
  );
}
