/** Detect phone/tablet */
export function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);
}

function isLocalHost(h) {
  return !h || h === 'localhost' || h === '127.0.0.1';
}

/** Server origin for API + Socket.io */
export function getServerOrigin() {
  const { protocol, hostname, port } = window.location;
  const origin = window.location.origin.replace(/\/$/, '');

  // Cloud / public host (Render, domain, LAN IP on :3001)
  if (!isLocalHost(hostname)) {
    return origin;
  }

  // localhost dev
  if (port === '3001') return origin;

  const saved = localStorage.getItem('blockblast_server')?.replace(/\/$/, '');
  if (saved && !isLocalHost(new URL(saved).hostname)) return saved;

  return 'http://localhost:3001';
}

export function getApiBase() {
  return `${getServerOrigin()}/api`;
}

export function getGuestName() {
  let id = localStorage.getItem('blockblast_guest_id');
  if (!id) {
    id = Math.random().toString(36).slice(2, 6).toUpperCase();
    localStorage.setItem('blockblast_guest_id', id);
  }
  return `Guest-${id}`;
}

export function getPlayerName() {
  const user = JSON.parse(localStorage.getItem('blockblast_user') || 'null');
  return user?.username || user?.displayName || getGuestName();
}

export function saveServerOrigin(origin) {
  localStorage.setItem('blockblast_server', origin.replace(/\/$/, ''));
}

export async function testServerConnection(url) {
  const base = (url || getServerOrigin()).replace(/\/$/, '');
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${base}/api/health`, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) return { ok: false, error: 'server_error' };
    const data = await res.json();
    return { ok: true, url: base, ...data };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'timeout' : 'network_error', url: base };
  }
}

/** Multiplayer v3 needs server >= 3.0 (ack callbacks, duel_ready handshake) */
export function isServerV3(health) {
  const v = health?.version;
  if (!v) return false;
  const major = parseInt(String(v).split('.')[0], 10);
  return major >= 3;
}

export function isPhoneOnLocalhost() {
  return isMobileDevice() && isLocalHost(new URL(getServerOrigin()).hostname);
}

export async function fetchLanUrls() {
  try {
    const res = await fetch(`${getServerOrigin()}/api/health`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return { phoneUrl: data.phoneUrl, ips: data.ips || [] };
  } catch {
    return null;
  }
}

export function isWrongPort() {
  if (window.location.protocol === 'https:') return false;
  if (!isLocalHost(window.location.hostname)) return false;
  const p = window.location.port;
  return p && p !== '3001';
}
