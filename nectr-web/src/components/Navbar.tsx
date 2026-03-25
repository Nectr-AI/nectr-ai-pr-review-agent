'use client';
import { useState } from 'react';
import { Menu, Bell, ExternalLink } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import Image from 'next/image';

interface NavbarProps {
  title?: string;
  onMenuClick?: () => void;
}

export function Navbar({ title, onMenuClick }: NavbarProps) {
  const { user } = useAuthContext();
  const [hasNotifications] = useState(false);

  return (
    <header className="h-16 border-b border-surface-border bg-surface-elevated flex items-center px-5 gap-4 flex-shrink-0">
      {/* Mobile hamburger */}
      <button
        onClick={onMenuClick}
        className="lg:hidden text-content-secondary hover:text-content-primary p-1 -ml-1 transition-[color,transform] duration-150 active:scale-[0.90]"
      >
        <Menu size={20} />
      </button>

      {/* Page title */}
      {title && (
        <h1 className="text-sm font-bold uppercase tracking-wider text-content-secondary hidden sm:block">
          {title}
        </h1>
      )}

      <div className="flex-1" />

      {/* Right actions */}
      <div className="flex items-center gap-3">
        {/* Backend status badge */}
        <a
          href="https://devkit-production.up.railway.app/health"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/10 border border-success/20 text-success text-caption font-mono uppercase tracking-wider hover:bg-success/20 transition-colors"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          API Live
          <ExternalLink size={10} />
        </a>

        {/* Notifications */}
        <button className="relative text-content-secondary hover:text-content-primary transition-[color,background-color,transform] duration-150 p-1.5 rounded-lg hover:bg-surface-subtle active:scale-[0.90]">
          <Bell size={18} />
          {hasNotifications && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber" />
          )}
        </button>

        {/* Avatar */}
        {user && (
          <div className="flex items-center gap-2.5">
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
            <span className="hidden sm:block text-sm font-medium text-content-primary">
              {user.name || user.github_username}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
