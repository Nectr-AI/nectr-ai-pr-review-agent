import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { AppLayout } from '../components/AppLayout';
import { useAnalyticsSummary, useAnalyticsTimeline } from '../hooks/useAnalytics';

const PIE_COLORS = ['#F5C800', '#dc2626', '#333333'];

export default function Analytics() {
  const { data: summary } = useAnalyticsSummary();
  const { data: timeline, isLoading } = useAnalyticsTimeline(30);

  const pieData = summary
    ? [
        { name: 'Completed', value: Math.round((summary.success_rate / 100) * summary.total_reviews) },
        { name: 'Failed', value: summary.total_reviews - Math.round((summary.success_rate / 100) * summary.total_reviews) },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <AppLayout title="Analytics">
      <div className="mb-6">
        <h2 className="text-2xl font-black uppercase tracking-tight text-white">Analytics</h2>
        <p className="text-[#555] text-sm mt-0.5">Last 30 days of review activity</p>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Reviews', value: summary?.total_reviews ?? '—' },
          { label: 'Success Rate', value: summary?.success_rate ? `${summary.success_rate.toFixed(1)}%` : '—' },
          { label: 'Avg Time', value: summary?.avg_processing_seconds ? `${summary.avg_processing_seconds.toFixed(0)}s` : '—' },
          { label: 'This Week', value: summary?.reviews_this_week ?? '—' },
        ].map((s) => (
          <div key={s.label} className="card border-[#222]">
            <div className="text-3xl font-black text-[#F5C800]">{s.value}</div>
            <div className="text-[#555] text-xs uppercase tracking-wider mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline — takes 2 cols */}
        <div className="lg:col-span-2 card-yellow">
          <p className="section-label mb-5">Reviews per day (last 30 days)</p>
          {isLoading ? (
            <div className="h-48 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-[#F5C800] border-t-transparent animate-spin" />
            </div>
          ) : timeline && timeline.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={timeline} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#555', fontSize: 10 }}
                  tickLine={false}
                  tickFormatter={(v) => v.slice(5)} // "MM-DD"
                />
                <YAxis tick={{ fill: '#555', fontSize: 10 }} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 0 }}
                  labelStyle={{ color: '#F5C800', fontSize: 11 }}
                  itemStyle={{ color: '#fff', fontSize: 11 }}
                />
                <Line
                  type="monotone"
                  dataKey="completed"
                  stroke="#F5C800"
                  strokeWidth={2}
                  dot={false}
                  name="Completed"
                />
                <Line
                  type="monotone"
                  dataKey="failed"
                  stroke="#dc2626"
                  strokeWidth={2}
                  dot={false}
                  name="Failed"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center">
              <p className="text-[#333] text-sm uppercase tracking-wider">No data yet</p>
            </div>
          )}
        </div>

        {/* Status pie */}
        <div className="card-yellow">
          <p className="section-label mb-5">Status distribution</p>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Legend
                  formatter={(value) => (
                    <span style={{ color: '#999', fontSize: 11, textTransform: 'uppercase' }}>{value}</span>
                  )}
                />
                <Tooltip
                  contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 0 }}
                  itemStyle={{ color: '#fff', fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center">
              <p className="text-[#333] text-sm uppercase tracking-wider">No data yet</p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
