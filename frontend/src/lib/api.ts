import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // send httpOnly JWT cookie automatically
  headers: {
    'Content-Type': 'application/json',
  },
});

// Intercept 401 → redirect to login (skip for /auth/me which is handled by useAuth)
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isAuthCheck = err.config?.url?.includes('/auth/me');
    if (err.response?.status === 401 && !isAuthCheck && window.location.pathname !== '/') {
      window.location.href = '/';
    }
    return Promise.reject(err);
  }
);

export default api;
