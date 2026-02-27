import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar,
} from 'recharts';
import { AppLayout } from '../components/AppLayout';
import { useAnalyticsSummary, useAnalyticsTimeline, useAnalyticsInsights } from '../hooks/useAnalytics';

const PIE_COLORS = ['#F5C800', '#dc2626', '#333333'];
const VERDICT_COLORS: Record<string, string> = {
  APPROVE: '#22c55e',
  REQUEST_CHANGES: '#dc2626',
  NEEDS_DISCUSSION: '#F5C800',
};

function formatHours(h: number | null): string {
  if (h === null || h === undefined) return '—';
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

export default function Analytics() {
  const { data: summary } = useAnalyticsSummary();
  const { data: timeline, isLoading } = useAnalyticsTimeline(30);
  const { data: insights } = useAnalyticsInsights(30);

  const pieData = summary
    ? [
        { name: 'Completed', value: Math.round((summary.success_rate / 100) * summary.total_reviews) },
        { name: 'Failed', value: summary.total_reviews - Math.round((summary.success_rate / 100) * summary.total_reviews) },
      ].filter((d) => d.value > 0)
    : [];

  const verdictData = insights
    ? Object.entries(insights.verdicts)
        .map(([name, value]) => ({ name: name.replace(/_/g, ' '), value, key: name }))
        .filter((d) => d.value > 0)
    : [];

  const confidenceData = insights
    ? Object.entries(insights.confidence_distribution)
        .map(([score, count]) => ({ score: `${score}/5`, count }))
    : [];

  const issueData = insights
    ? [
        { name: 'Critical', value: insights.issue_categories.critical, color: '#dc2626' },
        { name: 'Moderate', value: insights.issue_categories.moderate, color: '#F5C800' },
        { name: 'Minor', value: insights.issue_categories.minor, color: '#22c55e' },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <AppLayout title="Analytics">
      <div className="mb-6">
        <h2 className="text-2xl font-black uppercase tracking-tight text-white">Analytics</h2>
        <p className="text-[#555] text-sm mt-0.5">Last 30 days of review activity</p>
      </div>

      {/* ── Summary row ───────────────────────────────────────── */}
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

      {/* ── Merge Time Stats ─────────────────────────────────── */}
      {insights?.merge_time && insights.merge_time.sample_size > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[#999] mb-3">PR Merge Time</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Average', value: formatHours(insights.merge_time.avg_hours) },
              { label: 'Median', value: formatHours(insights.merge_time.median_hours) },
              { label: 'Fastest', value: formatHours(insights.merge_time.fastest_hours) },
              { label: 'Slowest', value: formatHours(insights.merge_time.slowest_hours) },
            ].map((s) => (
              <div key={s.label} className="card border-[#222]">
                <div className="text-2xl font-black text-white">{s.value}</div>
                <div className="text-[#555] text-xs uppercase tracking-wider mt-1">{s.label}</div>
              </div>
            ))}
          </div>
          <p className="text-[#444] text-xs mt-2">Based on {insights.merge_time.sample_size} merged PRs</p>
        </div>
      )}

      {/* ── Charts row ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Timeline */}
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
                <XAxis dataKey="date" tick={{ fill: '#555', fontSize: 10 }} tickLine={false} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fill: '#555', fontSize: 10 }} tickLine={false} />
                <Tooltip contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 0 }} labelStyle={{ color: '#F5C800', fontSize: 11 }} itemStyle={{ color: '#fff', fontSize: 11 }} />
                <Line type="monotone" dataKey="completed" stroke="#F5C800" strokeWidth={2} dot={false} name="Completed" />
                <Line type="monotone" dataKey="failed" stroke="#dc2626" strokeWidth={2} dot={false} name="Failed" />
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
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Legend formatter={(value) => <span style={{ color: '#999', fontSize: 11, textTransform: 'uppercase' }}>{value}</span>} />
                <Tooltip contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 0 }} itemStyle={{ color: '#fff', fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center">
              <p className="text-[#333] text-sm uppercase tracking-wider">No data yet</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Verdict + Confidence + Issues row ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* AI Verdict Breakdown */}
        <div className="card-yellow">
          <p className="section-label mb-5">AI Verdict Breakdown</p>
          {verdictData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={verdictData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                  {verdictData.map((d) => <Cell key={d.key} fill={VERDICT_COLORS[d.key] || '#555'} />)}
                </Pie>
                <Legend formatter={(value) => <span style={{ color: '#999', fontSize: 10, textTransform: 'uppercase' }}>{value}</span>} />
                <Tooltip contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 0 }} itemStyle={{ color: '#fff', fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center">
              <p className="text-[#333] text-sm uppercase tracking-wider">No data yet</p>
            </div>
          )}
        </div>

        {/* Confidence Distribution */}
        <div className="card-yellow">
          <p className="section-label mb-5">Confidence Scores</p>
          {confidenceData.some((d) => d.count > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={confidenceData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis dataKey="score" tick={{ fill: '#999', fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fill: '#555', fontSize: 10 }} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 0 }} itemStyle={{ color: '#fff', fontSize: 11 }} />
                <Bar dataKey="count" name="Reviews" radius={[2, 2, 0, 0]}>
                  {confidenceData.map((d) => {
                    const score = parseInt(d.score);
                    const color = score >= 4 ? '#22c55e' : score >= 3 ? '#F5C800' : '#dc2626';
                    return <Cell key={d.score} fill={color} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center">
              <p className="text-[#333] text-sm uppercase tracking-wider">No data yet</p>
            </div>
          )}
        </div>

        {/* Issue Categories */}
        <div className="card-yellow">
          <p className="section-label mb-5">Issues Flagged</p>
          {issueData.length > 0 ? (
            <>
              <div className="space-y-4 px-2">
                {issueData.map((d) => (
                  <div key={d.name}>
                    <div className="flex justify-between text-xs uppercase tracking-wider mb-1">
                      <span className="text-[#999]">{d.name}</span>
                      <span className="text-white font-bold">{d.value}</span>
                    </div>
                    <div className="w-full h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min((d.value / (insights?.issue_categories.total || 1)) * 100, 100)}%`,
                          backgroundColor: d.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[#444] text-xs mt-4 px-2">{insights?.issue_categories.total} total issues across {insights?.total_prs} PRs</p>
            </>
          ) : (
            <div className="h-48 flex items-center justify-center">
              <p className="text-[#333] text-sm uppercase tracking-wider">No issues found</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Per-Author Table ──────────────────────────────────── */}
      {insights?.per_author && insights.per_author.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[#999] mb-3">Per-Author Stats</h3>
          <div className="card-yellow overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[#666] text-xs uppercase tracking-wider border-b border-[#222]">
                  <th className="pb-3 pr-4">Author</th>
                  <th className="pb-3 pr-4 text-right">PRs</th>
                  <th className="pb-3 pr-4 text-right">Merged</th>
                  <th className="pb-3 pr-4 text-right">Merge Rate</th>
                  <th className="pb-3 pr-4 text-right">Issues</th>
                  <th className="pb-3 text-right">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {insights.per_author.map((a) => (
                  <tr key={a.author} className="border-b border-[#1a1a1a] hover:bg-[#111] transition-colors">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <img
                          src={`https://github.com/${a.author}.png?size=24`}
                          alt={a.author}
                          className="w-5 h-5 rounded-full"
                        />
                        <span className="text-white font-medium">{a.author}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-right text-[#999]">{a.prs}</td>
                    <td className="py-3 pr-4 text-right text-[#999]">{a.merged}</td>
                    <td className="py-3 pr-4 text-right">
                      <span className={a.prs > 0 && a.merged / a.prs >= 0.7 ? 'text-green-400' : 'text-[#999]'}>
                        {a.prs > 0 ? `${((a.merged / a.prs) * 100).toFixed(0)}%` : '—'}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <span className={a.issues_flagged > 5 ? 'text-red-400' : 'text-[#999]'}>
                        {a.issues_flagged}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      {a.avg_confidence !== null ? (
                        <span className={
                          a.avg_confidence >= 4 ? 'text-green-400' :
                          a.avg_confidence >= 3 ? 'text-[#F5C800]' : 'text-red-400'
                        }>
                          {a.avg_confidence}/5
                        </span>
                      ) : (
                        <span className="text-[#444]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Per-Repo Table ────────────────────────────────────── */}
      {insights?.per_repo && insights.per_repo.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[#999] mb-3">Per-Repository Stats</h3>
          <div className="card-yellow overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[#666] text-xs uppercase tracking-wider border-b border-[#222]">
                  <th className="pb-3 pr-4">Repository</th>
                  <th className="pb-3 pr-4 text-right">PRs</th>
                  <th className="pb-3 pr-4 text-right">Merged</th>
                  <th className="pb-3 pr-4 text-right">Merge Rate</th>
                  <th className="pb-3 text-right">Issues Flagged</th>
                </tr>
              </thead>
              <tbody>
                {insights.per_repo.map((r) => (
                  <tr key={r.repo} className="border-b border-[#1a1a1a] hover:bg-[#111] transition-colors">
                    <td className="py-3 pr-4 text-white font-medium">{r.repo}</td>
                    <td className="py-3 pr-4 text-right text-[#999]">{r.prs}</td>
                    <td className="py-3 pr-4 text-right text-[#999]">{r.merged}</td>
                    <td className="py-3 pr-4 text-right">
                      <span className={r.merge_rate >= 70 ? 'text-green-400' : 'text-[#999]'}>
                        {r.merge_rate}%
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <span className={r.issues > 5 ? 'text-red-400' : 'text-[#999]'}>
                        {r.issues}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
