'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import {
  LayoutDashboard, GitPullRequest, BarChart3, GitBranch,
  Settings, Key, Users, LogOut, X, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthContext } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

const NAV = [
  { href: '/dashboard',   label: 'Dashboard',  icon: LayoutDashboard },
  { href: '/reviews',     label: 'PR Reviews',  icon: GitPullRequest  },
  { href: '/analytics',   label: 'Analytics',   icon: BarChart3       },
  { href: '/repos',       label: 'Repos',       icon: GitBranch       },
  { href: '/team',        label: 'Team',        icon: Users           },
];

const BOTTOM_NAV = [
  { href: '/settings',  label: 'Settings',  icon: Settings },
  { href: '/api-keys',  label: 'API Keys',  icon: Key      },
];

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open = true, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuthContext();
  const qc = useQueryClient();

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
      qc.clear();
      window.location.href = '/';
    } catch {
      toast.error('Logout failed');
    }
  };

  return (
    <>
      {/* Mobile overlay */}
      {open && onClose && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-40 w-64 flex flex-col',
          'bg-surface-elevated border-r border-surface-border',
          'transition-transform duration-300',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-5 border-b border-surface-border flex-shrink-0">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <Image
              src="/assets/nectr-logo-dark.svg"
              alt="Nectr"
              width={88}
              height={28}
              priority
            />
          </Link>
          {onClose && (
            <button onClick={onClose} className="lg:hidden text-content-secondary hover:text-content-primary p-1">
              <X size={16} />
            </button>
          )}
        </div>

        {/* Main nav */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          <p className="label-mono px-2 mb-3">Navigation</p>
          <ul className="space-y-0.5">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/');
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onClose}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                      active
                        ? 'bg-amber/10 text-amber border border-amber/20'
                        : 'text-content-secondary hover:text-content-primary hover:bg-surface-subtle',
                    )}
                  >
                    <Icon size={16} className={active ? 'text-amber' : ''} />
                    {label}
                    {active && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="my-4 border-t border-surface-border" />
          <p className="label-mono px-2 mb-3">Account</p>
          <ul className="space-y-0.5">
            {BOTTOM_NAV.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onClose}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                      active
                        ? 'bg-amber/10 text-amber border border-amber/20'
                        : 'text-content-secondary hover:text-content-primary hover:bg-surface-subtle',
                    )}
                  >
                    <Icon size={16} className={active ? 'text-amber' : ''} />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User footer */}
        <div className="px-3 py-4 border-t border-surface-border flex-shrink-0">
          {user && (
            <div className="flex items-center gap-3 px-2 py-2 rounded-lg">
              {user.avatar_url ? (
                <Image
                  src={user.avatar_url}
                  alt={user.github_username}
                  width={32}
                  height={32}
                  className="rounded-full border border-surface-border"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-amber/20 flex items-center justify-center text-amber font-bold text-xs">
                  {user.github_username[0].toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-content-primary truncate">
                  {user.name || user.github_username}
                </p>
                <p className="text-caption font-mono text-content-secondary truncate">
                  @{user.github_username}
                </p>
              </div>
              <button
                onClick={() => { window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/auth/github/reconnect`; }}
                className="text-content-muted hover:text-amber transition-colors p-1"
                title="Reconnect GitHub (grant org access)"
              >
                <RefreshCw size={15} />
              </button>
              <button
                onClick={handleLogout}
                className="text-content-muted hover:text-danger transition-colors p-1"
                title="Logout"
              >
                <LogOut size={15} />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
