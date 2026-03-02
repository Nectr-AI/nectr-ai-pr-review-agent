'use client';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { Review } from '@/types';

interface UseReviewsOptions {
  limit?: number;
  status?: string;
  search?: string;
}

export function useReviews(opts: UseReviewsOptions = {}) {
  const { limit = 20, status, search } = opts;
  return useQuery<Review[]>({
    queryKey: ['reviews', { limit, status, search }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      const res = await api.get(`/api/v1/reviews?${params}`);
      return res.data;
    },
  });
}

export function useReview(id: number | string) {
  return useQuery<Review>({
    queryKey: ['reviews', id],
    queryFn: async () => {
      const res = await api.get(`/api/v1/reviews/${id}`);
      return res.data;
    },
    enabled: !!id,
  });
}
