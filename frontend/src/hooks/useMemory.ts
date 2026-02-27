import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export interface Memory {
  id: string;
  memory: string;
  metadata?: { memory_type?: string; source_pr?: number };
  created_at?: string;
}

export function useMemories(repo: string | null) {
  return useQuery<{ memories: Memory[]; count: number }>({
    queryKey: ['memory', repo],
    queryFn: async () => {
      const res = await api.get(`/api/v1/memory?repo=${encodeURIComponent(repo!)}`);
      return res.data;
    },
    enabled: !!repo,
  });
}

export function useMemoryStats(repo: string | null) {
  return useQuery<{ total: number; by_type: Record<string, number> }>({
    queryKey: ['memory', 'stats', repo],
    queryFn: async () => {
      const res = await api.get(`/api/v1/memory/stats?repo=${encodeURIComponent(repo!)}`);
      return res.data;
    },
    enabled: !!repo,
  });
}

export function useProjectMap(repo: string | null) {
  return useQuery<{ memories: Memory[]; count: number }>({
    queryKey: ['memory', 'project-map', repo],
    queryFn: async () => {
      const res = await api.get(`/api/v1/memory/project-map?repo=${encodeURIComponent(repo!)}`);
      return res.data;
    },
    enabled: !!repo,
  });
}

export function useAddMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { repo: string; content: string; memory_type?: string }) => {
      const res = await api.post('/api/v1/memory', {
        repo: body.repo,
        content: body.content,
        memory_type: body.memory_type || 'project_rule',
      });
      return res.data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['memory', vars.repo] });
      qc.invalidateQueries({ queryKey: ['memory', 'stats', vars.repo] });
    },
  });
}

export function useDeleteMemory(repo: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (memoryId: string) => {
      await api.delete(`/api/v1/memory/${memoryId}?repo=${encodeURIComponent(repo!)}`);
    },
    onSuccess: () => {
      if (repo) {
        qc.invalidateQueries({ queryKey: ['memory', repo] });
        qc.invalidateQueries({ queryKey: ['memory', 'stats', repo] });
      }
    },
  });
}

export function useRescanRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (repo: string) => {
      const res = await api.post(`/api/v1/memory/rescan?repo=${encodeURIComponent(repo)}`);
      return res.data;
    },
    onSuccess: (_, repo) => {
      qc.invalidateQueries({ queryKey: ['memory', repo] });
      qc.invalidateQueries({ queryKey: ['memory', 'project-map', repo] });
      qc.invalidateQueries({ queryKey: ['memory', 'stats', repo] });
    },
  });
}
