import dbApi from '../db.js';

const DUEL_DURATION = 180000;
const waitingQueue = [];
const activeRooms = new Map();
const socketRooms = new Map();

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

function cancelRoom(roomId, io, reason = 'cancelled') {
  const room = activeRooms.get(roomId);
  if (!room) return;
  clearTimeout(room.readyTimer);
  clearTimeout(room.timer);
  room.players.forEach(p => {
    io.to(p.socketId).emit('duel_cancelled', { reason });
    socketRooms.delete(p.socketId);
  });
  activeRooms.delete(roomId);
}

function startGame(roomId, io) {
  const room = activeRooms.get(roomId);
  if (!room || room.started) return;

  const allAlive = room.players.every(p => {
    const s = io.sockets.sockets.get(p.socketId);
    return s?.connected;
  });
  if (!allAlive) {
    cancelRoom(roomId, io, 'opponent_lost');
    return;
  }

  room.started = true;
  room.startTime = Date.now();

  room.players.forEach(p => {
    const opp = room.players.find(x => x.socketId !== p.socketId);
    io.to(p.socketId).emit('duel_start', {
      roomId,
      opponent: opp?.username || '?',
      duration: DUEL_DURATION
    });
  });

  room.timer = setTimeout(() => endDuel(roomId, io), DUEL_DURATION);
  console.log(`[MP] START: ${room.players.map(p => p.username).join(' vs ')}`);
}

function tryMatch(io, socket, playerInfo, ack) {
  purgeQueue(io);

  const opponent = waitingQueue.find(e =>
    e.id !== socket.id &&
    e.username !== playerInfo.username
  );

  if (!opponent) {
    waitingQueue.push({
      id: socket.id,
      username: playerInfo.username,
      userId: playerInfo.userId
    });
    const status = getStatus(io);
    const data = { ok: true, status: 'queued', ...status, queueSize: status.queue };
    ack?.(data);
    socket.emit('duel_waiting', data);
    broadcastQueue(io);
    console.log(`[MP] queued: ${playerInfo.username} (${status.queue} waiting, ${status.online} online)`);
    return;
  }

  const oppSocket = io.sockets.sockets.get(opponent.id);
  if (!oppSocket?.connected) {
    const idx = waitingQueue.indexOf(opponent);
    if (idx >= 0) waitingQueue.splice(idx, 1);
    waitingQueue.push({ id: socket.id, username: playerInfo.username, userId: playerInfo.userId });
    const status = getStatus(io);
    const data = { ok: true, status: 'queued', ...status, queueSize: status.queue };
    ack?.(data);
    socket.emit('duel_waiting', data);
    return;
  }

  // Remove opponent from queue
  waitingQueue.splice(waitingQueue.indexOf(opponent), 1);

  const roomId = `duel-${Date.now()}`;
  const room = {
    id: roomId,
    players: [
      { socketId: opponent.id, username: opponent.username, userId: opponent.userId, score: 0, finished: false, ready: false },
      { socketId: socket.id, username: playerInfo.username, userId: playerInfo.userId, score: 0, finished: false, ready: false }
    ],
    started: false,
    timer: null,
    readyTimer: null
  };

  activeRooms.set(roomId, room);
  socketRooms.set(opponent.id, roomId);
  socketRooms.set(socket.id, roomId);

  console.log(`[MP] matched: ${opponent.username} vs ${playerInfo.username} → room ${roomId}`);

  const pending = (oppName) => ({ roomId, opponent: oppName, status: 'pending' });

  io.to(opponent.id).emit('duel_found', pending(playerInfo.username));
  socket.emit('duel_found', pending(opponent.username));

  // Auto-cancel if both don't ready within 15s
  room.readyTimer = setTimeout(() => {
    if (!room.started) {
      console.log(`[MP] ready timeout: ${roomId}`);
      cancelRoom(roomId, io, 'ready_timeout');
    }
  }, 15000);

  ack?.({ ok: true, status: 'matched', roomId, opponent: opponent.username, ...getStatus(io) });
}

export function setupMultiplayer(io) {
  io.on('connection', (socket) => {
    const playerInfo = { id: socket.id, username: 'Guest', userId: null };
    console.log(`[MP] + ${socket.id.slice(0, 8)} (online: ${io.engine.clientsCount})`);

    socket.on('mp_ping', (cb) => {
      cb?.({ ok: true, id: socket.id, ...getStatus(io), queueSize: waitingQueue.length });
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

      if (socketRooms.has(socket.id)) {
        ack?.({ ok: false, error: 'already_in_game' });
        return;
      }

      // Remove self from queue if re-searching
      const idx = waitingQueue.findIndex(e => e.id === socket.id);
      if (idx >= 0) waitingQueue.splice(idx, 1);

      tryMatch(io, socket, playerInfo, ack);
    });

    socket.on('duel_ready', ({ roomId }) => {
      const room = activeRooms.get(roomId);
      if (!room) return;
      const player = room.players.find(p => p.socketId === socket.id);
      if (!player) return;

      // Client missed duel_start — resend if game already running
      if (room.started) {
        const opp = room.players.find(x => x.socketId !== socket.id);
        io.to(socket.id).emit('duel_start', {
          roomId,
          opponent: opp?.username || '?',
          duration: Math.max(0, DUEL_DURATION - (Date.now() - room.startTime))
        });
        console.log(`[MP] resync start → ${player.username}`);
        return;
      }

      if (player.ready) return;

      player.ready = true;
      console.log(`[MP] ready: ${player.username} (${room.players.filter(p => p.ready).length}/2)`);

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
        const opp = room.players.find(x => x.socketId !== socket.id);
        io.to(socket.id).emit('duel_start', {
          roomId,
          opponent: opp?.username || '?',
          duration: Math.max(0, DUEL_DURATION - (Date.now() - room.startTime))
        });
      } else if (!player.ready) {
        player.ready = true;
        if (room.players.every(p => p.ready)) {
          clearTimeout(room.readyTimer);
          startGame(roomId, io);
        }
      }
    });

    socket.on('cancel_duel', () => {
      const qIdx = waitingQueue.findIndex(e => e.id === socket.id);
      if (qIdx >= 0) waitingQueue.splice(qIdx, 1);

      const roomId = socketRooms.get(socket.id);
      if (roomId) {
        const room = activeRooms.get(roomId);
        if (room && !room.started) {
          cancelRoom(roomId, io, 'cancelled');
        }
      }

      socket.emit('duel_cancelled');
      broadcastQueue(io);
    });

    socket.on('duel_score', ({ roomId, score }) => {
      const room = activeRooms.get(roomId);
      if (!room?.started) return;
      const player = room.players.find(p => p.socketId === socket.id);
      if (player && !player.finished) {
        player.score = score;
        broadcastScores(room, io);
      }
    });

    socket.on('duel_finished', ({ roomId, score }) => {
      const room = activeRooms.get(roomId);
      if (!room) return;
      const player = room.players.find(p => p.socketId === socket.id);
      if (player) {
        player.score = score;
        player.finished = true;
      }
      if (room.players.every(p => p.finished)) endDuel(roomId, io);
    });

    socket.on('disconnect', () => {
      const qIdx = waitingQueue.findIndex(e => e.id === socket.id);
      if (qIdx >= 0) waitingQueue.splice(qIdx, 1);

      const roomId = socketRooms.get(socket.id);
      if (roomId) {
        const room = activeRooms.get(roomId);
        if (room) {
          if (!room.started) {
            cancelRoom(roomId, io, 'opponent_left');
          } else {
            room.players.forEach(p => {
              if (p.socketId !== socket.id) {
                const s = io.sockets.sockets.get(p.socketId);
                if (s?.connected) io.to(p.socketId).emit('duel_opponent_left');
              }
            });
            clearTimeout(room.timer);
            activeRooms.delete(roomId);
            room.players.forEach(p => socketRooms.delete(p.socketId));
          }
        }
      }

      broadcastQueue(io);
      console.log(`[MP] - ${socket.id.slice(0, 8)}`);
    });
  });

  setInterval(() => purgeQueue(io), 5000);
}

function broadcastScores(room, io) {
  const payload = {
    scores: room.players.map(p => ({ username: p.username, score: p.score, finished: p.finished }))
  };
  room.players.forEach(p => {
    const s = io.sockets.sockets.get(p.socketId);
    if (s?.connected) io.to(p.socketId).emit('duel_update', payload);
  });
}

function endDuel(roomId, io) {
  const room = activeRooms.get(roomId);
  if (!room) return;

  clearTimeout(room.timer);
  const [p1, p2] = room.players;
  let winnerId = null;
  if (p1.score > p2.score) winnerId = p1.userId;
  else if (p2.score > p1.score) winnerId = p2.userId;

  if (p1.userId && p2.userId) {
    dbApi.saveDuel(roomId, winnerId, p1.userId, p2.userId, p1.score, p2.score);
  }

  const endPayload = {
    scores: room.players.map(p => ({ username: p.username, score: p.score })),
    winner: winnerId ? room.players.find(p => p.userId === winnerId)?.username : null,
    draw: p1.score === p2.score
  };

  room.players.forEach(p => {
    const s = io.sockets.sockets.get(p.socketId);
    if (s?.connected) io.to(p.socketId).emit('duel_end', endPayload);
    socketRooms.delete(p.socketId);
  });

  activeRooms.delete(roomId);
}

export function getOnlineCount(io) {
  return io.engine?.clientsCount || 0;
}

export function getQueueSize() {
  return waitingQueue.length;
}
