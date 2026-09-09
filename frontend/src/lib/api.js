import axios from 'axios';

const api = axios.create({
  baseURL: '/',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Response interceptor: handle 401 with token refresh
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    if (
      error.response?.status === 401 &&
      error.response?.data?.code === 'TOKEN_EXPIRED' &&
      !original._retry
    ) {
      original._retry = true;

      const refreshToken = sessionStorage.getItem('sanctum_refresh');
      if (!refreshToken) {
        // Import lazily to avoid circular dependency
        const { useAuthStore } = await import('../stores/auth');
        useAuthStore.getState().lock();
        return Promise.reject(error);
      }

      try {
        const res = await axios.post('/api/auth/refresh', { refreshToken });
        const { accessToken, refreshToken: newRefresh } = res.data;

        sessionStorage.setItem('sanctum_refresh', newRefresh);
        api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
        original.headers['Authorization'] = `Bearer ${accessToken}`;

        const { useAuthStore } = await import('../stores/auth');
        useAuthStore.setState({ accessToken, refreshToken: newRefresh });

        return api(original);
      } catch {
        const { useAuthStore } = await import('../stores/auth');
        useAuthStore.getState().lock();
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
