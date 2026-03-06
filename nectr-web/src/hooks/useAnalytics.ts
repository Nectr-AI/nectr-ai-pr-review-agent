'use client';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { AnalyticsSummary, TimelineEntry, AnalyticsInsights, Contributor, GraphAnalytics } from '@/types';

export function useAnalyticsSummary() {
  return useQuery<AnalyticsSummary>({
    queryKey: ['analytics', 'summary'],
    queryFn: async () => {
      const res = await api.get('/api/v1/analytics/summary');
      return res.data;
    },
  });
}

export function useAnalyticsTimeline(days = 30) {
  return useQuery<TimelineEntry[]>({
    queryKey: ['analytics', 'timeline', days],
    queryFn: async () => {
      const res = await api.get(`/api/v1/analytics/timeline?days=${days}`);
      return res.data;
    },
  });
}

export function useAnalyticsInsights(days = 30) {
  return useQuery<AnalyticsInsights>({
    queryKey: ['analytics', 'insights', days],
    queryFn: async () => {
      const res = await api.get(`/api/v1/analytics/insights?days=${days}`);
      return res.data;
    },
  });
}

export function useContributors(repo: string | null, page = 1) {
  return useQuery<{ repo: string; contributor_count: number; contributors: Contributor[]; total_pages: number }>({
    queryKey: ['analytics', 'contributors', repo, page],
    queryFn: async () => {
      const res = await api.get(`/api/v1/analytics/contributors?repo=${encodeURIComponent(repo!)}&page=${page}&per_page=20`);
      return res.data;
    },
    enabled: !!repo,
  });
}

export function useGraphAnalytics(repo: string | null) {
  return useQuery<GraphAnalytics>({
    queryKey: ['analytics', 'graph', repo],
    queryFn: async () => {
      const res = await api.get(`/api/v1/analytics/graph?repo=${encodeURIComponent(repo!)}`);
      return res.data;
    },
    enabled: !!repo,
    staleTime: 5 * 60 * 1000, // graph data changes slowly — cache for 5 min
  });
}
