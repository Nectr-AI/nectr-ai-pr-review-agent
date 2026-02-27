import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import type { AnalyticsSummary, TimelineEntry, AnalyticsInsights } from '../types';

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
