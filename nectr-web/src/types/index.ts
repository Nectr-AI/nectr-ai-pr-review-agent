// ─── User ────────────────────────────────────────────────────────────────────
export interface User {
  id: number;
  github_id: number;
  github_username: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
}

// ─── Repo ────────────────────────────────────────────────────────────────────
export interface Repo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  html_url: string;
  updated_at: string;
  is_connected: boolean;
  installation_id?: number;
}

// ─── Review ──────────────────────────────────────────────────────────────────
export type ReviewStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type PRStatus = 'open' | 'merged' | 'closed';

export interface Review {
  id: number;
  event_type: string;
  source: string;
  status: ReviewStatus;
  pr_status: PRStatus;
  created_at: string;
  processed_at: string | null;
  pr_title?: string;
  pr_number?: number;
  repo_name?: string;
  branch?: string;
  author?: string;
  pr_url?: string;
  ai_summary?: string;
  files_analyzed?: number;
}

// ─── Analytics ───────────────────────────────────────────────────────────────
export interface WeeklyPR {
  pr_number: number;
  title: string;
  author: string;
  repo_name: string;
  state: string;
  additions: number;
  deletions: number;
  changed_files: number;
}

export interface AnalyticsSummary {
  total_reviews: number;
  success_rate: number;
  avg_processing_seconds: number;
  connected_repos: number;
  reviews_today: number;
  reviews_this_week: number;
  avg_merge_hours: number | null;
  avg_pr_size: number | null;
  last_week_activity: WeeklyPR[];
}

export interface TimelineEntry {
  date: string;
  total: number;
  completed: number;
  failed: number;
}

export interface MergeTimeStats {
  avg_hours: number | null;
  median_hours: number | null;
  fastest_hours: number | null;
  slowest_hours: number | null;
  sample_size: number;
}

export interface AuthorStats {
  author: string;
  prs: number;
  merged: number;
  issues_flagged: number;
  avg_confidence: number | null;
}

export interface RepoStats {
  repo: string;
  prs: number;
  merged: number;
  merge_rate: number;
  issues: number;
}

export interface AnalyticsInsights {
  period_days: number;
  total_prs: number;
  avg_pr_size: number | null;
  merge_time: MergeTimeStats;
  verdicts: { APPROVE: number; REQUEST_CHANGES: number; NEEDS_DISCUSSION: number };
  confidence_distribution: Record<string, number>;
  issue_categories: { critical: number; moderate: number; minor: number; total: number };
  per_author: AuthorStats[];
  per_repo: RepoStats[];
}

export interface Contributor {
  username: string;
  profile_summary: string | null;
  patterns: string[];
  strengths: string[];
  pr_count: number;
  commit_count: number;
  last_seen_pr: number | null;
}

// ─── Memory ──────────────────────────────────────────────────────────────────
export interface Memory {
  id: string;
  memory?: string;
  content?: string;
  metadata?: {
    memory_type?: string;
    source_pr?: number;
    username?: string;
  };
  created_at?: string;
}
