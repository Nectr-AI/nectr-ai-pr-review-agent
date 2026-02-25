import { GitBranch, Lock, Globe, CheckCircle, Loader2, RefreshCw } from 'lucide-react';
import { AppLayout } from '../components/AppLayout';
import { useRepos, useInstallRepo, useUninstallRepo } from '../hooks/useRepos';
import type { Repo } from '../types';

function RepoCard({ repo }: { repo: Repo }) {
  const install = useInstallRepo();
  const uninstall = useUninstallRepo();
  const [owner, name] = repo.full_name.split('/');
  const isPending = install.isPending || uninstall.isPending;

  const handleToggle = () => {
    if (repo.is_connected) {
      uninstall.mutate({ owner, repo: name });
    } else {
      install.mutate({ owner, repo: name });
    }
  };

  return (
    <div className={`card flex items-center justify-between gap-4 ${repo.is_connected ? 'border-[#F5C800]' : 'border-[#222]'} hover:border-[#F5C800] transition-colors`}>
      <div className="flex items-center gap-3 min-w-0">
        <GitBranch size={16} className={repo.is_connected ? 'text-[#F5C800]' : 'text-[#555]'} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-white font-mono text-sm font-semibold truncate">{repo.full_name}</span>
            {repo.private ? (
              <Lock size={11} className="text-[#555] flex-shrink-0" />
            ) : (
              <Globe size={11} className="text-[#333] flex-shrink-0" />
            )}
          </div>
          {repo.description && (
            <p className="text-[#555] text-xs mt-0.5 truncate">{repo.description}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        {repo.is_connected && (
          <span className="hidden sm:flex items-center gap-1 text-[#F5C800] text-xs font-bold uppercase tracking-wider">
            <CheckCircle size={11} /> Connected
          </span>
        )}
        <button
          onClick={handleToggle}
          disabled={isPending}
          className={repo.is_connected ? 'btn-secondary text-xs px-4 py-2' : 'btn-primary text-xs px-4 py-2'}
        >
          {isPending ? (
            <Loader2 size={12} className="animate-spin" />
          ) : repo.is_connected ? (
            'Disconnect'
          ) : (
            'Connect'
          )}
        </button>
      </div>
    </div>
  );
}

export default function Repos() {
  const { data: repos, isLoading, refetch, isFetching } = useRepos();

  const connected = repos?.filter((r) => r.is_connected) ?? [];
  const others = repos?.filter((r) => !r.is_connected) ?? [];

  return (
    <AppLayout title="Code Providers">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tight text-white">Code Providers</h2>
          <p className="text-[#555] text-sm mt-0.5">
            {connected.length} connected · {repos?.length ?? 0} total
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="btn-secondary text-xs px-4 py-2 flex items-center gap-2"
          disabled={isFetching}
        >
          <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-[#F5C800] border-t-transparent animate-spin" />
        </div>
      ) : (
        <>
          {/* Connected repos */}
          {connected.length > 0 && (
            <div className="mb-8">
              <p className="section-label mb-3">Connected Repos</p>
              <div className="flex flex-col gap-2">
                {connected.map((repo) => <RepoCard key={repo.id} repo={repo} />)}
              </div>
            </div>
          )}

          {/* Available repos */}
          <div>
            <p className="section-label mb-3">Available Repos</p>
            {others.length > 0 ? (
              <div className="flex flex-col gap-2">
                {others.map((repo) => <RepoCard key={repo.id} repo={repo} />)}
              </div>
            ) : (
              <div className="card text-center py-8">
                <p className="text-[#555] text-sm uppercase tracking-wider">All repos connected</p>
              </div>
            )}
          </div>
        </>
      )}
    </AppLayout>
  );
}
