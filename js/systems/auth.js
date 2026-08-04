import { getApiBase, getPlayerName, getServerOrigin } from './network.js';

export function setApiBase(url) {
  localStorage.setItem('blockblast_api', url);
}

export function getToken() {
  return localStorage.getItem('blockblast_token');
}

export function setToken(token) {
  if (token) localStorage.setItem('blockblast_token', token);
  else localStorage.removeItem('blockblast_token');
}

export function getUser() {
  const raw = localStorage.getItem('blockblast_user');
  return raw ? JSON.parse(raw) : null;
}

export function setUser(user) {
  if (user) localStorage.setItem('blockblast_user', JSON.stringify(user));
  else localStorage.removeItem('blockblast_user');
}

export function isLoggedIn() {
  return !!getToken();
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(`${getApiBase()}${path}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw { status: res.status, ...data };
    return data;
  } catch (err) {
    if (err.status) throw err;
    throw { status: 0, error: 'network_error' };
  }
}

export async function register(username, email, password, displayName) {
  const data = await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password, displayName })
  });
  setToken(data.token);
  setUser(data.user);
  return data;
}

export async function login(email, password) {
  const data = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  setToken(data.token);
  setUser(data.user);
  return data;
}

export function logout() {
  setToken(null);
  setUser(null);
}

export async function fetchProfile() {
  const data = await request('/auth/me');
  setUser(data.user);
  return data.user;
}

export async function syncSave(save) {
  return request('/game/save', { method: 'POST', body: JSON.stringify({ save }) });
}

export async function loadCloudSave() {
  const data = await request('/game/save');
  return data.save;
}

export async function submitTournamentScore(score) {
  return request('/tournament/submit', { method: 'POST', body: JSON.stringify({ score }) });
}

export async function getLeaderboard() {
  return request('/tournament/leaderboard');
}

export async function checkHealth() {
  try {
    const res = await fetch(`${getApiBase()}/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getServerStats() {
  try {
    return await request('/stats');
  } catch {
    return { totalUsers: 0, online: 0 };
  }
}

export async function unlockAchievement(id) {
  if (!isLoggedIn()) return;
  try {
    await request('/game/achievements', { method: 'POST', body: JSON.stringify({ achievementId: id }) });
  } catch { /* offline */ }
}

export async function getAchievements() {
  if (!isLoggedIn()) return [];
  try {
    const data = await request('/game/achievements');
    return data.achievements;
  } catch {
    return [];
  }
}

export { getServerOrigin, getPlayerName };
