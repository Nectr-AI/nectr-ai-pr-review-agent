import { Bell, Search } from 'lucide-react';
import { useAuthContext } from '../contexts/AuthContext';

interface Props {
  title?: string;
}

export function Navbar({ title }: Props) {
  const { user } = useAuthContext();

  return (
    <header className="h-14 bg-black border-b-2 border-[#222222] flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        {title && (
          <h1 className="text-white font-bold text-sm uppercase tracking-widest">{title}</h1>
        )}
      </div>

      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="hidden md:flex items-center gap-2 bg-[#111111] border border-[#222222] px-3 py-1.5">
          <Search size={13} className="text-[#555]" />
          <input
            type="text"
            placeholder="Search reviews..."
            className="bg-transparent text-sm text-white placeholder-[#555] outline-none w-40"
          />
        </div>

        {/* Bell */}
        <button className="text-[#555] hover:text-[#F5C800] transition-colors">
          <Bell size={18} />
        </button>

        {/* Avatar */}
        {user?.avatar_url ? (
          <img
            src={user.avatar_url}
            alt={user.github_username}
            className="w-7 h-7 object-cover border border-[#333]"
          />
        ) : (
          <div className="w-7 h-7 bg-[#F5C800] flex items-center justify-center">
            <span className="text-black font-bold text-xs">
              {user?.github_username?.[0]?.toUpperCase()}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
