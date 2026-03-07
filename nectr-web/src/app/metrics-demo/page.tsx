'use client';
// ── Contributor card preview — no auth required ───────────────────────────────
import { useState, useEffect } from 'react';
import { BarChart, Bar, Cell, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Users } from 'lucide-react';
import type { ContributorStat } from '@/types';

const BORDER  = '#232323';
const AMBER   = '#F5C000';
const SUCCESS = '#4ADB4A';
const DANGER  = '#DB4A4A';

const CONTRIB_PALETTE = [
  '#4A9FDB', '#F5C000', '#4ADB4A', '#DB4A9F',
  '#9F4ADB', '#DB9F4A', '#4ADBDB', '#DB4A4A',
];

function fmtN(n: number) { return n.toLocaleString('en-US'); }

// ── Mock data matching the real API shape ────────────────────────────────────
const MOCK_CONTRIBS: ContributorStat[] = [
  {
    login: 'dhanushchalicheemala',
    total: 93,
    additions: 38147,
    deletions: 11512,
    weeks: [
      ...Array(6).fill({ w: 0, c: 0 }),
      { w: 1, c: 3 }, { w: 2, c: 0 }, { w: 3, c: 7 },
      { w: 4, c: 0 }, { w: 5, c: 0 }, { w: 6, c: 14 },
    ],
  },
  {
    login: 'claude',
    total: 81,
    additions: 34180,
    deletions: 11220,
    weeks: [
      ...Array(6).fill({ w: 0, c: 0 }),
      { w: 1, c: 2 }, { w: 2, c: 0 }, { w: 3, c: 9 },
      { w: 4, c: 0 }, { w: 5, c: 0 }, { w: 6, c: 11 },
    ],
  },
  {
    login: 'cursoragent',
    total: 2,
    additions: 920,
    deletions: 0,
    weeks: [
      ...Array(9).fill({ w: 0, c: 0 }),
      { w: 1, c: 2 }, { w: 2, c: 0 }, { w: 3, c: 0 },
    ],
  },
];

// ── Contributor card ──────────────────────────────────────────────────────────
function ContributorCard({ contributor, rank, color }: {
  contributor: ContributorStat;
  rank: number;
  color: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { login, total, additions, deletions, weeks } = contributor;
  const chartData = weeks.map(w => ({ c: w.c }));
  const maxC = Math.max(...chartData.map(d => d.c), 1);

  return (
    <div
      className="relative rounded-xl p-5 flex flex-col gap-4 transition-colors"
      style={{ backgroundColor: '#141414', border: `1px solid ${BORDER}` }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#191919')}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#141414')}
    >
      {/* Rank */}
      <span className="absolute top-4 right-4 text-xs font-semibold tabular-nums"
        style={{ color: '#3a3a3a' }}>
        #{rank}
      </span>

      {/* Avatar + info */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-base font-bold flex-shrink-0 select-none"
          style={{
            backgroundColor: `${color}20`,
            color,
            border: `1.5px solid ${color}50`,
          }}
        >
          {login.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-semibold font-mono leading-tight" style={{ color }}>
            @{login}
          </p>
          <p className="text-xs mt-1 font-mono">
            <span style={{ color: '#555' }}>{fmtN(total)} commits </span>
            <span style={{ color: SUCCESS }}>+{fmtN(additions)} </span>
            <span style={{ color: DANGER }}>-{fmtN(deletions)}</span>
          </p>
        </div>
      </div>

      {/* Weekly commits bar chart */}
      <div className="h-16">
        {!mounted ? null : <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barCategoryGap="25%" margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <YAxis domain={[0, maxC]} hide />
            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                if (!active || !payload?.length || !payload[0].value) return null;
                return (
                  <div className="px-2 py-1 rounded text-[11px] font-medium shadow-lg"
                    style={{ backgroundColor: '#1c1c1c', border: `1px solid ${BORDER}`, color }}>
                    {payload[0].value} commits
                  </div>
                );
              }}
            />
            <Bar dataKey="c" radius={[2, 2, 0, 0]}>
              {chartData.map((d, i) => (
                <Cell
                  key={i}
                  fill={color}
                  fillOpacity={d.c === 0 ? 0 : (d.c / maxC) * 0.55 + 0.45}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ContributorPreview() {
  return (
    <div className="min-h-screen px-6 pt-8 pb-16"
      style={{ backgroundColor: '#0e0e0e', color: '#f0f0f0', fontFamily: 'var(--font-sans)' }}>

      {/* Section header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-[11px] font-semibold tracking-widest uppercase mb-1.5"
            style={{ color: '#444' }}>
            Default Branch · All Time
          </p>
          <h2 className="text-xl font-bold tracking-tight">Top Contributors</h2>
        </div>
        <Users size={20} style={{ color: AMBER }} />
      </div>

      {/* Contributor cards grid */}
      <div className="grid grid-cols-2 gap-4">
        {MOCK_CONTRIBS.map((c, idx) => (
          <ContributorCard
            key={c.login}
            contributor={c}
            rank={idx + 1}
            color={CONTRIB_PALETTE[idx % CONTRIB_PALETTE.length]}
          />
        ))}
      </div>
    </div>
  );
}
