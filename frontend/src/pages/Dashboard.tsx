import { Link } from 'react-router-dom';
import { ArrowRight, GitPullRequest, CheckCircle, Clock, GitBranch, TrendingUp } from 'lucide-react';
import { AppLayout } from '../components/AppLayout';
import { ReviewTable } from '../components/ReviewTable';
import { useReviews } from '../hooks/useReviews';
import { useAnalyticsSummary } from '../hooks/useAnalytics';
import { useAuthContext } from '../contexts/AuthContext';

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
      value: analytics?.success_rate ? `${analytics.success_rate.toFixed(1)}%` : '—',
      icon: <CheckCircle size={18} />,
      sub: 'completed / total',
    },
    {
      label: 'Avg Review Time',
      value: analytics?.avg_processing_seconds ? `${analytics.avg_processing_seconds.toFixed(0)}s` : '—',
      icon: <Clock size={18} />,
      sub: 'per pull request',
    },
    {
      label: 'Connected Repos',
      value: analytics?.connected_repos ?? '—',
      icon: <GitBranch size={18} />,
      sub: 'active webhooks',
    },
  ];

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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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

      {/* This week */}
      {analytics && (
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
