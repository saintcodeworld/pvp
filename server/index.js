import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { setupMuseumRoom } from './museum-room.js';
import { setupLobbyManager } from './lobby-manager.js';
import { setupCombatManager } from './combat-manager.js';
import { setupFFAManager } from './ffa-manager.js';
import { setupBotManager } from './bot-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── HTTP STATIC FILE SERVER (production only, dev uses Vite) ───────
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Bot API handler (set later after botManager is created)
let botApiHandler = null;

const server = http.createServer((req, res) => {
  // ── Bot management API ──
  const urlPath = req.url.split('?')[0];
  if (urlPath.startsWith('/api/bots')) {
    if (botApiHandler) return botApiHandler(req, res);
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bot system not ready' }));
    return;
  }

  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = filePath.split('?')[0];

  // /bots route → serve bots.html
  if (filePath === '/bots') filePath = '/bots.html';

  // In production, files are in dist/ folder. In dev, they're in root.
  const isProduction = process.env.NODE_ENV === 'production';
  const basePath = isProduction ? path.join(__dirname, '..', 'dist') : path.join(__dirname, '..');
  const fullPath = path.join(basePath, filePath);
  const ext = path.extname(fullPath);

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      // SPA fallback - serve index.html for all routes
      const indexPath = path.join(basePath, 'index.html');
      fs.readFile(indexPath, (err2, data2) => {
        if (err2) {
          console.error(`File not found: ${fullPath}`);
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data2);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// ─── WEBSOCKET SERVER ───────────────────────────────────────────────
const wss = new WebSocketServer({ server });

// Shared state
const players = new Map(); // id -> { ws, state, room: 'museum'|'lobby'|'arena' }
let nextId = 1;

// ─── ROOM INDEX — O(1) room lookups instead of O(n) iteration ────────
const roomIndex = {
  museum: new Set(),
  lobby: new Set(),
  arena: new Set(),
  ffa_queue: new Set(),
  ffa_arena: new Set(),
};

function changeRoom(playerId, newRoom) {
  const player = players.get(playerId);
  if (!player) return;
  const oldRoom = player.room;
  if (oldRoom === newRoom) return;
  if (roomIndex[oldRoom]) roomIndex[oldRoom].delete(playerId);
  player.room = newRoom;
  if (roomIndex[newRoom]) roomIndex[newRoom].add(playerId);
}

function getMuseumPlayers() {
  const result = [];
  roomIndex.museum.forEach(id => {
    const p = players.get(id);
    if (p) result.push(p.state);
  });
  return result;
}

// ─── RATE LIMITING — max 25 messages/sec per client ──────────────────
const RATE_LIMIT_WINDOW = 1000; // 1 second
const RATE_LIMIT_MAX = 25;

function randomPlayerColor() {
  const colors = [
    '#ff4444', '#44ff44', '#4488ff', '#ffaa00', '#ff44ff',
    '#44ffff', '#ff8844', '#88ff44', '#4444ff', '#ffff44',
    '#ff4488', '#44ff88', '#8844ff', '#ff8888', '#88ffff',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

function broadcastToRoom(room, msg, excludeId = null) {
  const data = JSON.stringify(msg);
  const ids = roomIndex[room];
  if (!ids) return;
  ids.forEach(id => {
    if (id !== excludeId) {
      const player = players.get(id);
      if (player && player.ws.readyState === 1) {
        player.ws.send(data);
      }
    }
  });
}

function sendTo(playerId, msg) {
  const player = players.get(playerId);
  if (player && player.ws.readyState === 1) {
    player.ws.send(JSON.stringify(msg));
  }
}

// Initialize sub-managers
const museumRoom = setupMuseumRoom(players, broadcastToRoom, sendTo);
const lobbyManager = setupLobbyManager(players, broadcastToRoom, sendTo, changeRoom, getMuseumPlayers);
const combatManager = setupCombatManager(players, broadcastToRoom, sendTo, lobbyManager, changeRoom, getMuseumPlayers);
const ffaManager = setupFFAManager(players, broadcastToRoom, sendTo, changeRoom, getMuseumPlayers);
const botManager = setupBotManager(ffaManager, players, broadcastToRoom, sendTo, changeRoom);
ffaManager.setBotManager(botManager);

// ─── BOT API ENDPOINTS ──────────────────────────────────────────────
botApiHandler = (req, res) => {
  const urlPath = req.url.split('?')[0];
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET' && urlPath === '/api/bots/status') {
    const queueBots = botManager.getQueuedBotCount();
    const totalBots = botManager.getBotCount();
    const queueTotal = ffaManager.queue.length;
    const activeMatches = ffaManager.ffaMatches.size;
    res.writeHead(200);
    res.end(JSON.stringify({
      queueBots,
      totalBots,
      queueTotal,
      queueMax: 8,
      activeMatches,
      queuePlayers: ffaManager.queue.map(p => ({
        id: p.id,
        name: p.name,
        isBot: botManager.isBot(p.id),
      })),
    }));
    return;
  }

  if (req.method === 'POST' && urlPath === '/api/bots/add') {
    const bot = botManager.addBotToQueue();
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, bot: { id: bot.id, name: bot.name } }));
    return;
  }

  if (req.method === 'POST' && urlPath === '/api/bots/remove') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { botId } = JSON.parse(body);
        if (botId && botManager.isBot(botId)) {
          botManager.removeBotFromQueue(botId);
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
        } else {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid bot ID' }));
        }
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
    return;
  }

  if (req.method === 'POST' && urlPath === '/api/bots/fill') {
    const needed = 8 - ffaManager.queue.length;
    const added = [];
    for (let i = 0; i < needed; i++) {
      const bot = botManager.addBotToQueue();
      added.push({ id: bot.id, name: bot.name });
    }
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, added, count: added.length }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
};

// ─── WEBSOCKET HEARTBEAT (ping/pong to detect dead connections) ─────
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const heartbeatTimer = setInterval(() => {
  wss.clients.forEach((client) => {
    if (client.isAlive === false) {
      // Connection didn't respond to last ping — terminate it
      return client.terminate();
    }
    client.isAlive = false;
    client.ping(); // native WebSocket ping frame
  });
}, HEARTBEAT_INTERVAL);

wss.on('close', () => {
  clearInterval(heartbeatTimer);
});

wss.on('connection', (ws) => {
  // Mark connection as alive for heartbeat
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; }); // native pong response

  const playerId = nextId++;
  const playerColor = randomPlayerColor();

  const   playerState = {
    id: playerId,
    name: 'Player ' + playerId,
    color: playerColor,
    x: 0, y: 2.7, z: -28,
    // Face +Z toward PVP portal (north); yaw 0 faced -Z (away from portal)
    yaw: Math.PI,
    pitch: 0,
    activeSlot: 0,
    isSwinging: false,
  };

  players.set(playerId, {
    ws,
    state: playerState,
    room: 'museum',
    msgCount: 0,
    msgWindowStart: Date.now(),
  });
  roomIndex.museum.add(playerId);

  // Send init with all museum players
  const museumPlayers = getMuseumPlayers();

  ws.send(JSON.stringify({
    type: 'init',
    id: playerId,
    color: playerColor,
    players: museumPlayers,
  }));

  // Notify other museum players
  broadcastToRoom('museum', {
    type: 'player_join',
    player: playerState,
  }, playerId);

  console.log(`Player ${playerId} connected (${players.size} online)`);

  ws.on('message', (rawData) => {
    try {
      const msg = JSON.parse(rawData);
      const player = players.get(playerId);
      if (!player) return;

      // Rate limiting
      const now = Date.now();
      if (now - player.msgWindowStart > RATE_LIMIT_WINDOW) {
        player.msgCount = 0;
        player.msgWindowStart = now;
      }
      player.msgCount++;
      if (player.msgCount > RATE_LIMIT_MAX) return;

      // Route message based on player's current room
      switch (player.room) {
        case 'museum':
          museumRoom.handleMessage(playerId, msg);
          break;
        case 'lobby':
          lobbyManager.handleMessage(playerId, msg);
          break;
        case 'arena':
          combatManager.handleMessage(playerId, msg);
          break;
        case 'ffa_queue':
          ffaManager.handleMessage(playerId, msg);
          break;
        case 'ffa_arena':
          ffaManager.handleMessage(playerId, msg);
          break;
      }

      // Lobby transition messages (must work from museum room)
      if ((msg.type === 'enter_lobby_area' || msg.type === 'leave_lobby_area') && player.room !== 'lobby') {
        lobbyManager.handleMessage(playerId, msg);
      }

      // FFA queue messages (player stays in museum while queued)
      if (msg.type === 'ffa_join_queue' && player.room === 'museum') {
        ffaManager.handleMessage(playerId, msg);
      }
      if (msg.type === 'ffa_leave_queue' && player.room === 'museum') {
        ffaManager.handleMessage(playerId, msg);
      }

      // Global messages (work in any room)
      switch (msg.type) {
        case 'ping': {
          // Application-level keepalive from client (tab hidden)
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
          break;
        }

        case 'resync': {
          // Client returned from hidden tab — send fresh player list
          const roomPlayers = [];
          const ids = roomIndex[player.room];
          if (ids) {
            ids.forEach(id => {
              const p = players.get(id);
              if (p) roomPlayers.push(p.state);
            });
          }
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({
              type: 'resync',
              players: roomPlayers,
            }));
          }
          break;
        }

        case 'set_name': {
          player.state.name = (msg.name || 'Player').substring(0, 20);
          broadcastToRoom(player.room, {
            type: 'player_name',
            id: playerId,
            name: player.state.name,
          });
          break;
        }

        case 'game_ready': {
          // Players confirmed arena loaded — start the match
          const lobbyId = msg.lobbyId;
          const lobby = lobbyManager.lobbies.get(lobbyId);
          if (lobby && lobby.status === 'in_game') {
            if (!lobby.readyCount) lobby.readyCount = 0;
            lobby.readyCount++;
            // Start when all players are ready
            if (!lobby.matchCreated && lobby.readyCount >= lobby.maxPlayers) {
              const missing = lobby.players.filter(p => !players.has(p.id));
              if (missing.length > 0) {
                lobby.players.forEach(p => {
                  if (players.has(p.id)) sendTo(p.id, { type: 'lobby_cancelled' });
                });
                lobbyManager.removeLobby(lobbyId);
                break;
              }
              lobby.matchCreated = true;
              if (lobby.mode === '2v2') {
                combatManager.createMatch2v2(lobbyId, lobby.players);
              } else {
                combatManager.createMatch(lobbyId, lobby.players[0].id, lobby.players[1].id);
              }
            }
          }
          break;
        }

        case 'voice_offer':
        case 'voice_answer':
        case 'voice_ice': {
          // WebRTC signaling relay
          const targetId = msg.targetId;
          if (targetId && players.has(targetId)) {
            sendTo(targetId, { ...msg, fromId: playerId });
          }
          break;
        }
      }
    } catch (e) {
      // Ignore malformed messages
    }
  });

  function cleanupDisconnectedPlayer() {
    const player = players.get(playerId);
    if (!player) return;

    // Lobby cleanup for any room (in_game loading is still "museum")
    lobbyManager.handleDisconnect(playerId);

    if (player.room === 'arena') {
      combatManager.handleDisconnect(playerId);
    }
    // Always check FFA disconnect (player may be queued while in museum room)
    ffaManager.handleDisconnect(playerId);

    broadcastToRoom(player.room, {
      type: 'player_leave',
      id: playerId,
    });
    if (roomIndex[player.room]) roomIndex[player.room].delete(playerId);
    players.delete(playerId);
    console.log(`Player ${playerId} disconnected (${players.size} online)`);
  }

  ws.on('close', cleanupDisconnectedPlayer);

  ws.on('error', () => {
    cleanupDisconnectedPlayer();
  });
});

// ─── START ──────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🏛️  Muzzeum — Multiplayer Server`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   WebSocket on same port`);
});
