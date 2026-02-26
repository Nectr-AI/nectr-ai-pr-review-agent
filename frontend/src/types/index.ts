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

// ─── Repository / Installation ───────────────────────────────────────────────
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

// ─── Review / Event ──────────────────────────────────────────────────────────
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
export interface AnalyticsSummary {
  total_reviews: number;
  success_rate: number;
  avg_processing_seconds: number;
  connected_repos: number;
  reviews_today: number;
  reviews_this_week: number;
}

export interface TimelineEntry {
  date: string;
  total: number;
  completed: number;
  failed: number;
}

// ─── API Keys ────────────────────────────────────────────────────────────────
export interface ApiKey {
  id: number;
  name: string;
  key_preview: string; // e.g. "nk_****...abcd"
  created_at: string;
  last_used_at: string | null;
}
