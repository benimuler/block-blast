import { getPlayerName, getServerOrigin, isMobileDevice } from './network.js';
import { getUser } from './auth.js';

export class MultiplayerClient {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.isSearching = false;
    this.roomId = null;
    this.listenersBound = false;
    this.onWaiting = null;
    this.onFound = null;
    this.onStart = null;
    this.onUpdate = null;
    this.onEnd = null;
    this.onOpponentLeft = null;
    this.onCancelled = null;
    this.onConnectChange = null;
    this.lastError = null;
    this._lastUrl = null;
    this.socketId = null;
  }

  connect() {
    return new Promise((resolve) => {
      if (typeof io === 'undefined') {
        this.lastError = 'socket_io_missing';
        resolve(false);
        return;
      }

      const url = getServerOrigin();

      if (this.socket && this._lastUrl !== url) {
        this.disconnect();
      }

      if (!this.socket) {
        this._lastUrl = url;
        this.socket = io(url, {
          transports: isMobileDevice() ? ['polling'] : ['polling', 'websocket'],
          reconnection: true,
          reconnectionAttempts: 10,
          timeout: 20000
        });
        this.bindListeners();
      }

      if (this.socket.connected) {
        this._auth();
        this.connected = true;
        this.socketId = this.socket.id;
        resolve(true);
        return;
      }

      const timer = setTimeout(() => finish(false, 'timeout'), 20000);
      const finish = (ok, err = null) => {
        clearTimeout(timer);
        this.socket?.off('connect', onOk);
        this.socket?.off('connect_error', onErr);
        this.connected = ok;
        this.lastError = err;
        if (ok) this.socketId = this.socket.id;
        resolve(ok);
      };
      const onOk = () => { this._auth(); finish(true); };
      const onErr = (e) => finish(false, e?.message || 'error');

      this.socket.once('connect', onOk);
      this.socket.once('connect_error', onErr);
      this.socket.connect();
    });
  }

  _auth() {
    const user = getUser();
    this.socket?.emit('auth', { username: getPlayerName(), userId: user?.id || null });
  }

  bindListeners() {
    if (this.listenersBound || !this.socket) return;
    this.listenersBound = true;

    this.socket.on('connect', () => {
      this.connected = true;
      this.socketId = this.socket.id;
      this._auth();
      this.onConnectChange?.(true);
      this._tryRejoinDuel();
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      this.onConnectChange?.(false);
    });

    this.socket.on('connect_error', (err) => {
      this.lastError = err?.message;
      this.onConnectChange?.(false);
    });

    this.socket.on('duel_waiting', (data) => {
      this.isSearching = true;
      this.onWaiting?.(data);
    });

    this.socket.on('duel_found', (data) => {
      this.isSearching = false;
      this.roomId = data.roomId;
      this.onFound?.(data);
      this.sendReady(data.roomId);
    });

    this.socket.on('duel_start', (data) => {
      this.roomId = data.roomId;
      if (data.roomId) {
        try { sessionStorage.setItem('blockblast_duel_room', data.roomId); } catch { /* private mode */ }
      }
      this.onStart?.(data);
    });

    this.socket.on('duel_cancelled', (data) => {
      this.isSearching = false;
      this.roomId = null;
      this.onCancelled?.(data?.reason);
    });

    this.socket.on('duel_update', (data) => this.onUpdate?.(data));
    this.socket.on('duel_end', (data) => {
      this.roomId = null;
      try { sessionStorage.removeItem('blockblast_duel_room'); } catch { /* ignore */ }
      this.onEnd?.(data);
    });
    this.socket.on('duel_opponent_left', () => {
      this.roomId = null;
      try { sessionStorage.removeItem('blockblast_duel_room'); } catch { /* ignore */ }
      this.onOpponentLeft?.();
    });
  }

  _tryRejoinDuel() {
    let roomId = null;
    try { roomId = sessionStorage.getItem('blockblast_duel_room'); } catch { /* ignore */ }
    if (!roomId || !this.socket?.connected) return;
    this.socket.emit('rejoin_duel', { roomId, username: getPlayerName() }, (ack) => {
      if (!ack?.ok) {
        try { sessionStorage.removeItem('blockblast_duel_room'); } catch { /* ignore */ }
        return;
      }
      this.roomId = roomId;
    });
  }

  clearDuelSession() {
    this.roomId = null;
    try { sessionStorage.removeItem('blockblast_duel_room'); } catch { /* ignore */ }
  }

  sendReady(roomId) {
    if (!roomId || !this.socket?.connected) return;
    this.roomId = roomId;
    this.socket.emit('duel_ready', { roomId });
  }

  syncDuel(roomId) {
    if (!roomId || !this.socket?.connected) return;
    this.socket.emit('sync_duel', { roomId });
  }

  findDuel() {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        resolve({ ok: false, error: 'not_connected' });
        return;
      }
      this._auth();
      this.isSearching = true;
      const timer = setTimeout(() => resolve({ ok: false, error: 'timeout' }), 10000);
      this.socket.emit('find_duel', { username: getPlayerName() }, (ack) => {
        clearTimeout(timer);
        resolve(ack || { ok: false, error: 'no_ack' });
      });
    });
  }

  cancelDuel() {
    this.isSearching = false;
    this.clearDuelSession();
    if (this.socket?.connected) this.socket.emit('cancel_duel');
    else this.onCancelled?.('cancelled');
  }

  sendScore(score) {
    if (this.roomId && this.socket?.connected) {
      this.socket.emit('duel_score', { roomId: this.roomId, score });
    }
  }

  finishDuel(score) {
    if (this.roomId && this.socket?.connected) {
      this.socket.emit('duel_finished', { roomId: this.roomId, score });
    }
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.listenersBound = false;
    this.connected = false;
    this.isSearching = false;
    this.roomId = null;
  }
}
