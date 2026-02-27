import { Link } from 'react-router-dom';
import { ArrowRight, GitPullRequest, CheckCircle, Clock, GitBranch, TrendingUp, GitMerge, FileCode, Activity } from 'lucide-react';
import { AppLayout } from '../components/AppLayout';
import { ReviewTable } from '../components/ReviewTable';
import { useReviews } from '../hooks/useReviews';
import { useAnalyticsSummary } from '../hooks/useAnalytics';
import { useAuthContext } from '../contexts/AuthContext';

function formatMergeTime(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export default function Dashboard() {
  const { user } = useAuthContext();
  const { data: reviews, isLoading: reviewsLoading } = useReviews({ limit: 5 });
  const { data: analytics } = useAnalyticsSummary();

  const stats = [
    {
      label: 'Total Reviews',
      value: analytics?.total_reviews ?? '—',
      icon: <GitPullRequest size={18} />,
      sub: `${analytics?.reviews_today ?? 0} today`,
    },
    {
      label: 'Success Rate',
      value: analytics?.success_rate != null ? `${analytics.success_rate.toFixed(1)}%` : '—',
      icon: <CheckCircle size={18} />,
      sub: 'completed / total',
    },
    {
      label: 'Avg Review Time',
      value: analytics?.avg_processing_seconds ? `${analytics.avg_processing_seconds.toFixed(0)}s` : '—',
      icon: <Clock size={18} />,
      sub: 'AI review duration',
    },
    {
      label: 'Connected Repos',
      value: analytics?.connected_repos ?? '—',
      icon: <GitBranch size={18} />,
      sub: 'active webhooks',
    },
    {
      label: 'Avg Merge Time',
      value: formatMergeTime(analytics?.avg_merge_hours),
      icon: <GitMerge size={18} />,
      sub: 'created → merged',
    },
    {
      label: 'Avg PR Size',
      value: analytics?.avg_pr_size != null ? `${analytics.avg_pr_size} lines` : '—',
      icon: <FileCode size={18} />,
      sub: 'additions + deletions',
    },
  ];

  const weeklyPRs = analytics?.last_week_activity ?? [];
  const weekMerged = weeklyPRs.filter((p) => p.state === 'merged').length;
  const weekOpen = weeklyPRs.filter((p) => p.state === 'open').length;
  const weekLines = weeklyPRs.reduce((sum, p) => sum + p.additions + p.deletions, 0);

  return (
    <AppLayout title="Dashboard">
      {/* Greeting */}
      <div className="mb-8">
        <h2 className="text-2xl font-black uppercase tracking-tight text-white">
          Welcome back, <span className="text-[#F5C800]">{user?.name || user?.github_username}</span>
        </h2>
        <p className="text-[#555] text-sm mt-1">Here's what's happening with your code reviews.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="card-yellow">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[#F5C800]">{stat.icon}</span>
              <TrendingUp size={12} className="text-[#333]" />
            </div>
            <div className="text-3xl font-black text-white mb-1">{stat.value}</div>
            <div className="text-[#F5C800] text-xs font-bold uppercase tracking-wider">{stat.label}</div>
            <div className="text-[#555] text-xs mt-0.5">{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* Weekly Activity */}
      {weeklyPRs.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={16} className="text-[#F5C800]" />
            <h3 className="text-white font-bold text-sm uppercase tracking-widest">This Week's Activity</h3>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {[
              { label: 'PRs Reviewed', value: weeklyPRs.length, color: 'text-[#F5C800]' },
              { label: 'Merged', value: weekMerged, color: 'text-purple-400' },
              { label: 'Open', value: weekOpen, color: 'text-green-400' },
              { label: 'Lines Changed', value: weekLines.toLocaleString(), color: 'text-white' },
            ].map((s) => (
              <div key={s.label} className="card border-[#222]">
                <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
                <div className="text-[#555] text-xs uppercase tracking-wider mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="card-yellow overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[#666] text-xs uppercase tracking-wider border-b border-[#222]">
                  <th className="pb-2 pr-4">PR</th>
                  <th className="pb-2 pr-4">Author</th>
                  <th className="pb-2 pr-4 text-right">Size</th>
                  <th className="pb-2 pr-4 text-right">Files</th>
                  <th className="pb-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {weeklyPRs.map((pr) => (
                  <tr key={`${pr.repo_name}#${pr.pr_number}`} className="border-b border-[#1a1a1a] hover:bg-[#111] transition-colors">
                    <td className="py-2.5 pr-4">
                      <div className="text-white font-medium">#{pr.pr_number}</div>
                      <div className="text-[#555] text-xs truncate max-w-[250px]">{pr.title}</div>
                    </td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-1.5">
                        <img src={`https://github.com/${pr.author}.png?size=20`} alt="" className="w-4 h-4 rounded-full" />
                        <span className="text-[#999] text-xs">{pr.author}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 text-right">
                      <span className="text-green-400 text-xs">+{pr.additions}</span>
                      <span className="text-[#444] text-xs mx-0.5">/</span>
                      <span className="text-red-400 text-xs">-{pr.deletions}</span>
                    </td>
                    <td className="py-2.5 pr-4 text-right text-[#999] text-xs">{pr.changed_files}</td>
                    <td className="py-2.5 text-right">
                      <span className={`text-xs font-bold uppercase ${
                        pr.state === 'merged' ? 'text-purple-400' :
                        pr.state === 'open' ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {pr.state}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* This week summary (fallback if no weekly PRs) */}
      {weeklyPRs.length === 0 && analytics && (
        <div className="mb-8 card flex items-center gap-6">
          <div className="border-r border-[#222] pr-6">
            <div className="text-3xl font-black text-[#F5C800]">{analytics.reviews_this_week}</div>
            <div className="text-[#555] text-xs uppercase tracking-wider mt-0.5">Reviews this week</div>
          </div>
          <p className="text-[#999] text-sm">
            Your team is shipping fast. Keep the momentum going.
          </p>
        </div>
      )}

      {/* Recent Reviews */}
      <div className="mb-6 flex items-center justify-between">
        <h3 className="text-white font-bold text-sm uppercase tracking-widest">Recent Reviews</h3>
        <Link
          to="/logs"
          className="text-[#F5C800] text-xs font-bold uppercase tracking-wider hover:underline flex items-center gap-1"
        >
          View all <ArrowRight size={12} />
        </Link>
      </div>

      <ReviewTable reviews={reviews || []} isLoading={reviewsLoading} />

      {/* Quick Actions */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link to="/repos" className="card hover:border-[#F5C800] transition-colors group">
          <div className="flex items-center gap-3">
            <GitBranch size={18} className="text-[#F5C800]" />
            <div>
              <div className="text-white font-bold text-sm group-hover:text-[#F5C800] transition-colors">Connect a Repo</div>
              <div className="text-[#555] text-xs mt-0.5">Add GitHub repositories to monitor</div>
            </div>
            <ArrowRight size={14} className="ml-auto text-[#333] group-hover:text-[#F5C800] transition-colors" />
          </div>
        </Link>
        <Link to="/analytics" className="card hover:border-[#F5C800] transition-colors group">
          <div className="flex items-center gap-3">
            <CheckCircle size={18} className="text-[#F5C800]" />
            <div>
              <div className="text-white font-bold text-sm group-hover:text-[#F5C800] transition-colors">View Analytics</div>
              <div className="text-[#555] text-xs mt-0.5">Charts, trends and review metrics</div>
            </div>
            <ArrowRight size={14} className="ml-auto text-[#333] group-hover:text-[#F5C800] transition-colors" />
          </div>
        </Link>
      </div>
    </AppLayout>
  );
}
