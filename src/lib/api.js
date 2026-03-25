// Global API helper
const API_BASE = '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('comicvault_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

export async function fetchApi(endpoint, options = {}) {
  const headers = {
    ...getAuthHeaders(),
    ...options.headers,
  };

  if (options.body && !(options.body instanceof FormData) && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `API Error: ${response.status}`);
  }

  return response.json();
}

export const auth = {
  async getSession() {
    try {
      if (!localStorage.getItem('comicvault_token')) return null;
      const data = await fetchApi('/auth/me');
      return data.session;
    } catch {
      return null;
    }
  },
  async signUp(email, password) {
    await fetchApi('/auth/signup', { method: 'POST', body: { email, password } });
  },
  async signIn(email, password) {
    const data = await fetchApi('/auth/login', { method: 'POST', body: { email, password } });
    localStorage.setItem('comicvault_token', data.token);
    return data.user;
  },
  async signOut() {
    try {
      await fetchApi('/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error(e);
    }
    localStorage.removeItem('comicvault_token');
  }
};
