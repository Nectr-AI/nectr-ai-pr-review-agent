import axios from 'axios';

// NEXT_PUBLIC_API_URL is required — enforced at build time in next.config.ts
const BASE_URL = process.env.NEXT_PUBLIC_API_URL as string;

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isAuthCheck = err.config?.url?.includes('/auth/me');
    if (
      err.response?.status === 401 &&
      !isAuthCheck &&
      typeof window !== 'undefined' &&
      window.location.pathname !== '/'
    ) {
      window.location.href = '/';
    }
    return Promise.reject(err);
  }
);

export default api;
