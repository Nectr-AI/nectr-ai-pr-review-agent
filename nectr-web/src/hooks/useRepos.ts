'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { Repo, RepoFilesResponse, RepoGraphData } from '@/types';

export function useRepos() {
  return useQuery<Repo[]>({
    queryKey: ['repos'],
    queryFn: async () => {
      const res = await api.get('/api/v1/repos');
      return res.data;
    },
  });
}

export function useInstallRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ owner, repo }: { owner: string; repo: string }) => {
      const res = await api.post(`/api/v1/repos/${owner}/${repo}/install`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['repos'] }),
  });
}

export function useUninstallRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ owner, repo }: { owner: string; repo: string }) => {
      await api.delete(`/api/v1/repos/${owner}/${repo}/install`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['repos'] }),
  });
}

export function useRescanRepo() {
  return useMutation({
    mutationFn: async ({ owner, repo }: { owner: string; repo: string }) => {
      const res = await api.post(`/api/v1/repos/${owner}/${repo}/rescan`);
      return res.data;
    },
  });
}

export function useRepoGraph(owner: string, repo: string, enabled = true) {
  return useQuery<RepoGraphData>({
    queryKey: ['repo-graph', owner, repo],
    queryFn: async () => {
      const res = await api.get(`/api/v1/repos/${owner}/${repo}/graph`);
      return res.data;
    },
    enabled: enabled && !!owner && !!repo,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRepoFiles(owner: string, repo: string, enabled = true) {
  return useQuery<RepoFilesResponse>({
    queryKey: ['repo-files', owner, repo],
    queryFn: async () => {
      const res = await api.get(`/api/v1/repos/${owner}/${repo}/files`);
      return res.data;
    },
    enabled: enabled && !!owner && !!repo,
    staleTime: 5 * 60 * 1000, // 5 min — file trees don't change often
  });
}
