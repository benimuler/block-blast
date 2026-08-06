import dbApi from '../db.js';

const DUEL_VARIANTS = {
  blitz: { durationMs: 180000, sudden: false, mirror: false, attack: false, shrink: false },
  mirror: { durationMs: 180000, sudden: false, mirror: true, attack: false, shrink: false },
  attack: { durationMs: 180000, sudden: false, mirror: false, attack: true, shrink: false },
  shrink: { durationMs: 180000, sudden: false, mirror: false, attack: false, shrink: true, shrinkIntervalMs: 45000 },
  sudden: { durationMs: 300000, sudden: true, mirror: false, attack: false, shrink: false }
};

const RECONNECT_GRACE_MS = 45000;
const waitingQueue = [];
const activeRooms = new Map();
const socketRooms = new Map();

function getVariantConfig(id) {
  return DUEL_VARIANTS[id] || DUEL_VARIANTS.blitz;
}

function hashSeed(a, b, roomId) {
  let h = 2166136261;
  const s = `${a}|${b}|${roomId}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function isValidUsername(name) {
  return typeof name === 'string' && name.length > 1 && name !== 'Guest';
}

function purgeQueue(io) {
  for (let i = waitingQueue.length - 1; i >= 0; i--) {
    const e = waitingQueue[i];
    const sock = io.sockets.sockets.get(e.id);
    if (!sock?.connected || !isValidUsername(e.username)) {
      waitingQueue.splice(i, 1);
    }
  }
}

function getStatus(io) {
  return { online: io.engine.clientsCount, queue: waitingQueue.length };
}

function broadcastQueue(io) {
  const status = getStatus(io);
  const payload = { ...status, queueSize: status.queue };
  for (const entry of waitingQueue) {
    io.to(entry.id).emit('duel_waiting', payload);
  }
}

function clearReconnectTimer(player) {
  if (player.reconnectTimer) {
    clearTimeout(player.reconnectTimer);
    player.reconnectTimer = null;
  }
}

function buildStartPayload(room, playerSocketId) {
  const cfg = getVariantConfig(room.variant);
  const opp = room.players.find(x => x.socketId !== playerSocketId);
  const duration = room.started
    ? Math.max(0, cfg.durationMs - (Date.now() - room.startTime))
    : cfg.durationMs;
  return {
    roomId: room.id,
    opponent: opp?.username || '?',
    duration,
    variant: room.variant,
    seed: room.seed,
    shrinkIntervalMs: cfg.shrinkIntervalMs || null,
    sudden: !!cfg.sudden
  };
}

function endDuel(roomId, io, options = {}) {
  const room = activeRooms.get(roomId);
  if (!room || room.ended) return;
  room.ended = true;

  clearTimeout(room.timer);
  clearTimeout(room.readyTimer);
  const [p1, p2] = room.players;

  let winnerUsername = options.winnerUsername ?? null;
  if (!winnerUsername && !options.draw) {
    if (p1.score > p2.score) winnerUsername = p1.username;
    else if (p2.score > p1.score) winnerUsername = p2.username;
  }

  const winnerId = winnerUsername
    ? room.players.find(p => p.username === winnerUsername)?.userId ?? null
    : null;

  if (p1.userId && p2.userId) {
    dbApi.saveDuel(roomId, winnerId, p1.userId, p2.userId, p1.score, p2.score);
  }

  const endPayload = {
    scores: room.players.map(p => ({ username: p.username, score: p.score })),
    winner: winnerUsername,
    draw: options.draw ?? (p1.score === p2.score && !winnerUsername),
    variant: room.variant,
    reason: options.reason || 'normal'
  };

  room.players.forEach(p => {
    clearReconnectTimer(p);
    const s = io.sockets.sockets.get(p.socketId);
    if (s?.connected) io.to(p.socketId).emit('duel_end', endPayload);
    socketRooms.delete(p.socketId);
  });

  activeRooms.delete(roomId);
}

function forfeitDisconnectedPlayer(roomId, io, room, leaverSocketId) {
  const leaver = room.players.find(p => p.socketId === leaverSocketId);
  const winner = room.players.find(p => p.socketId !== leaverSocketId);
  room.players.forEach(p => clearReconnectTimer(p));
  if (winner) {
    endDuel(roomId, io, { winnerUsername: winner.username, reason: 'forfeit' });
  } else {
    clearTimeout(room.timer);
    activeRooms.delete(roomId);
  }
  console.log(`[MP] forfeit: ${leaver?.username} left ${roomId}`);
}

function handlePlayerDisconnect(roomId, io, room, socketId) {
  const player = room.players.find(p => p.socketId === socketId);
  if (!player) return;

  clearReconnectTimer(player);
  player.disconnectedAt = Date.now();
  socketRooms.delete(socketId);

  player.reconnectTimer = setTimeout(() => {
    const live = activeRooms.get(roomId);
    if (!live || live !== room || live.ended) return;
    console.log(`[MP] forfeit (no reconnect): ${player.username} in ${roomId}`);
    forfeitDisconnectedPlayer(roomId, io, room, socketId);
  }, RECONNECT_GRACE_MS);
}

function cancelRoom(roomId, io, reason = 'cancelled') {
  const room = activeRooms.get(roomId);
  if (!room) return;
  clearTimeout(room.readyTimer);
  clearTimeout(room.timer);
  room.players.forEach(p => {
    clearReconnectTimer(p);
    io.to(p.socketId).emit('duel_cancelled', { reason });
    socketRooms.delete(p.socketId);
  });
  activeRooms.delete(roomId);
}

function startGame(roomId, io) {
  const room = activeRooms.get(roomId);
  if (!room || room.started) return;

  const allAlive = room.players.every(p => {
    if (p.disconnectedAt) return false;
    const s = io.sockets.sockets.get(p.socketId);
    return s?.connected;
  });
  if (!allAlive) {
    cancelRoom(roomId, io, 'opponent_lost');
    return;
  }

  const cfg = getVariantConfig(room.variant);
  room.started = true;
  room.startTime = Date.now();
  room.seed = hashSeed(room.players[0].username, room.players[1].username, roomId);

  room.players.forEach(p => {
    io.to(p.socketId).emit('duel_start', buildStartPayload(room, p.socketId));
  });

  room.timer = setTimeout(() => endDuel(roomId, io, { reason: 'timeout' }), cfg.durationMs);
  console.log(`[MP] START ${room.variant}: ${room.players.map(p => p.username).join(' vs ')}`);
}

function tryMatch(io, socket, playerInfo, variant, ack) {
  purgeQueue(io);

  const opponent = waitingQueue.find(e =>
    e.id !== socket.id &&
    e.username !== playerInfo.username &&
    e.variant === variant
  );

  if (!opponent) {
    waitingQueue.push({
      id: socket.id,
      username: playerInfo.username,
      userId: playerInfo.userId,
      variant
    });
    const status = getStatus(io);
    const data = { ok: true, status: 'queued', variant, ...status, queueSize: status.queue };
    ack?.(data);
    socket.emit('duel_waiting', data);
    broadcastQueue(io);
    console.log(`[MP] queued [${variant}]: ${playerInfo.username}`);
    return;
  }

  const oppSocket = io.sockets.sockets.get(opponent.id);
  if (!oppSocket?.connected) {
    const idx = waitingQueue.indexOf(opponent);
    if (idx >= 0) waitingQueue.splice(idx, 1);
    waitingQueue.push({ id: socket.id, username: playerInfo.username, userId: playerInfo.userId, variant });
    const status = getStatus(io);
    ack?.({ ok: true, status: 'queued', variant, ...status, queueSize: status.queue });
    socket.emit('duel_waiting', { ...status, queueSize: status.queue, variant });
    return;
  }

  waitingQueue.splice(waitingQueue.indexOf(opponent), 1);

  const roomId = `duel-${Date.now()}`;
  const room = {
    id: roomId,
    variant,
    seed: null,
    started: false,
    ended: false,
    startTime: 0,
    players: [
      { socketId: opponent.id, username: opponent.username, userId: opponent.userId, score: 0, finished: false, ready: false, disconnectedAt: null, reconnectTimer: null, stuck: false },
      { socketId: socket.id, username: playerInfo.username, userId: playerInfo.userId, score: 0, finished: false, ready: false, disconnectedAt: null, reconnectTimer: null, stuck: false }
    ],
    timer: null,
    readyTimer: null
  };

  activeRooms.set(roomId, room);
  socketRooms.set(opponent.id, roomId);
  socketRooms.set(socket.id, roomId);

  console.log(`[MP] matched [${variant}]: ${opponent.username} vs ${playerInfo.username}`);

  const pending = (oppName) => ({ roomId, opponent: oppName, status: 'pending', variant });

  io.to(opponent.id).emit('duel_found', pending(playerInfo.username));
  socket.emit('duel_found', pending(opponent.username));

  room.readyTimer = setTimeout(() => {
    if (!room.started) cancelRoom(roomId, io, 'ready_timeout');
  }, 15000);

  ack?.({ ok: true, status: 'matched', roomId, opponent: opponent.username, variant, ...getStatus(io) });
}

function broadcastScores(room, io) {
  const payload = {
    scores: room.players.map(p => ({ username: p.username, score: p.score, finished: p.finished, stuck: p.stuck }))
  };
  room.players.forEach(p => {
    const s = io.sockets.sockets.get(p.socketId);
    if (s?.connected) io.to(p.socketId).emit('duel_update', payload);
  });
}

function handleSuddenStuck(roomId, io, room, stuckPlayer) {
  const cfg = getVariantConfig(room.variant);
  if (!cfg.sudden) return false;
  const other = room.players.find(p => p !== stuckPlayer);
  endDuel(roomId, io, { winnerUsername: other?.username, reason: 'sudden' });
  return true;
}

export function setupMultiplayer(io) {
  io.on('connection', (socket) => {
    const playerInfo = { id: socket.id, username: 'Guest', userId: null };
    console.log(`[MP] + ${socket.id.slice(0, 8)} (online: ${io.engine.clientsCount})`);

    socket.on('mp_ping', (cb) => {
      cb?.({ ok: true, id: socket.id, ...getStatus(io), queueSize: waitingQueue.length, variants: Object.keys(DUEL_VARIANTS) });
    });

    socket.on('auth', (data) => {
      if (data?.username) playerInfo.username = data.username;
      if (data?.userId != null) playerInfo.userId = data.userId;
    });

    socket.on('find_duel', (data, ack) => {
      const username = (data?.username || playerInfo.username || '').trim();
      if (!isValidUsername(username)) {
        ack?.({ ok: false, error: 'invalid_username' });
        return;
      }
      playerInfo.username = username;

      const variant = DUEL_VARIANTS[data?.variant] ? data.variant : 'blitz';

      if (socketRooms.has(socket.id)) {
        ack?.({ ok: false, error: 'already_in_game' });
        return;
      }

      const idx = waitingQueue.findIndex(e => e.id === socket.id);
      if (idx >= 0) waitingQueue.splice(idx, 1);

      tryMatch(io, socket, playerInfo, variant, ack);
    });

    socket.on('duel_ready', ({ roomId }) => {
      const room = activeRooms.get(roomId);
      if (!room) return;
      const player = room.players.find(p => p.socketId === socket.id);
      if (!player) return;

      if (room.started) {
        io.to(socket.id).emit('duel_start', { ...buildStartPayload(room, socket.id), rejoin: true });
        io.to(socket.id).emit('duel_update', {
          scores: room.players.map(p => ({ username: p.username, score: p.score, finished: p.finished }))
        });
        return;
      }

      if (player.ready) return;
      player.ready = true;

      if (room.players.every(p => p.ready)) {
        clearTimeout(room.readyTimer);
        startGame(roomId, io);
      }
    });

    socket.on('sync_duel', ({ roomId }) => {
      const room = activeRooms.get(roomId);
      if (!room) return;
      const player = room.players.find(p => p.socketId === socket.id);
      if (!player) return;

      if (room.started) {
        io.to(socket.id).emit('duel_start', buildStartPayload(room, socket.id));
      } else if (!player.ready) {
        player.ready = true;
        if (room.players.every(p => p.ready)) {
          clearTimeout(room.readyTimer);
          startGame(roomId, io);
        }
      }
    });

    socket.on('rejoin_duel', ({ roomId, username }, ack) => {
      const room = activeRooms.get(roomId);
      const name = (username || playerInfo.username || '').trim();
      if (!room?.started || room.ended || !name) {
        ack?.({ ok: false, error: 'no_room' });
        return;
      }

      const player = room.players.find(p => p.username === name);
      if (!player) {
        ack?.({ ok: false, error: 'not_in_room' });
        return;
      }

      clearReconnectTimer(player);
      player.disconnectedAt = null;
      socketRooms.delete(player.socketId);
      player.socketId = socket.id;
      socketRooms.set(socket.id, roomId);
      playerInfo.username = name;

      io.to(socket.id).emit('duel_start', { ...buildStartPayload(room, socket.id), rejoin: true });
      io.to(socket.id).emit('duel_update', {
        scores: room.players.map(p => ({ username: p.username, score: p.score, finished: p.finished }))
      });

      ack?.({ ok: true, duration: buildStartPayload(room, socket.id).duration, variant: room.variant });
    });

    socket.on('cancel_duel', () => {
      const qIdx = waitingQueue.findIndex(e => e.id === socket.id);
      if (qIdx >= 0) waitingQueue.splice(qIdx, 1);

      const roomId = socketRooms.get(socket.id);
      if (roomId) {
        const room = activeRooms.get(roomId);
        if (room && !room.started) cancelRoom(roomId, io, 'cancelled');
      }

      socket.emit('duel_cancelled');
      broadcastQueue(io);
    });

    socket.on('duel_score', ({ roomId, score }) => {
      const room = activeRooms.get(roomId);
      if (!room?.started || room.ended) return;
      const player = room.players.find(p => p.socketId === socket.id);
      if (player && !player.finished) {
        player.score = score;
        broadcastScores(room, io);
      }
    });

    socket.on('duel_attack', ({ roomId, lines }) => {
      const room = activeRooms.get(roomId);
      if (!room?.started || room.ended) return;
      const cfg = getVariantConfig(room.variant);
      if (!cfg.attack) return;
      const rows = Math.min(3, Math.max(1, Math.floor(lines) || 1));
      const opp = room.players.find(p => p.socketId !== socket.id);
      if (opp) {
        const s = io.sockets.sockets.get(opp.socketId);
        if (s?.connected) io.to(opp.socketId).emit('duel_incoming_attack', { rows });
      }
    });

    socket.on('duel_stuck', ({ roomId, score }) => {
      const room = activeRooms.get(roomId);
      if (!room?.started || room.ended) return;
      const player = room.players.find(p => p.socketId === socket.id);
      if (!player || player.finished) return;
      player.score = score;
      player.finished = true;
      player.stuck = true;
      if (handleSuddenStuck(roomId, io, room, player)) return;
      broadcastScores(room, io);
      if (room.players.every(p => p.finished)) endDuel(roomId, io);
    });

    socket.on('duel_finished', ({ roomId, score }) => {
      const room = activeRooms.get(roomId);
      if (!room?.started || room.ended) return;
      const player = room.players.find(p => p.socketId === socket.id);
      if (!player || player.finished) return;
      player.score = score;
      player.finished = true;
      broadcastScores(room, io);
      if (room.players.every(p => p.finished)) endDuel(roomId, io);
    });

    socket.on('disconnect', () => {
      const qIdx = waitingQueue.findIndex(e => e.id === socket.id);
      if (qIdx >= 0) waitingQueue.splice(qIdx, 1);

      const roomId = socketRooms.get(socket.id);
      if (roomId) {
        const room = activeRooms.get(roomId);
        if (room && !room.ended) {
          if (!room.started) {
            cancelRoom(roomId, io, 'opponent_left');
          } else {
            handlePlayerDisconnect(roomId, io, room, socket.id);
          }
        }
      }

      broadcastQueue(io);
      console.log(`[MP] - ${socket.id.slice(0, 8)}`);
    });
  });

  setInterval(() => purgeQueue(io), 5000);
}

export function getOnlineCount(io) {
  return io.engine?.clientsCount || 0;
}

export function getQueueSize() {
  return waitingQueue.length;
}
