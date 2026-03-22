import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { setupMuseumRoom } from './museum-room.js';
import { setupLobbyManager } from './lobby-manager.js';
import { setupCombatManager } from './combat-manager.js';

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

const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = filePath.split('?')[0];

  // Try dist/ first (built Vite output), then root
  const projectRoot = path.join(__dirname, '..');
  const distPath = path.join(projectRoot, 'dist', filePath);
  const rootPath = path.join(projectRoot, filePath);

  const tryPath = fs.existsSync(distPath) ? distPath : rootPath;
  const ext = path.extname(tryPath);

  fs.readFile(tryPath, (err, data) => {
    if (err) {
      // SPA fallback
      const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
      fs.readFile(indexPath, (err2, data2) => {
        if (err2) {
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
  players.forEach((player, id) => {
    if (player.room === room && id !== excludeId && player.ws.readyState === 1) {
      player.ws.send(data);
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
const lobbyManager = setupLobbyManager(players, broadcastToRoom, sendTo);
const combatManager = setupCombatManager(players, broadcastToRoom, sendTo, lobbyManager);

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

  const playerState = {
    id: playerId,
    name: 'Player ' + playerId,
    color: playerColor,
    x: 0, y: 2.7, z: -28,
    yaw: 0, pitch: 0,
    activeSlot: 0,
    isSwinging: false,
  };

  players.set(playerId, {
    ws,
    state: playerState,
    room: 'museum',
  });

  // Send init with all museum players
  const museumPlayers = [];
  players.forEach((p, id) => {
    if (p.room === 'museum') {
      museumPlayers.push(p.state);
    }
  });

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
      }

      // Lobby transition messages (must work from museum room)
      if ((msg.type === 'enter_lobby_area' || msg.type === 'leave_lobby_area') && player.room !== 'lobby') {
        lobbyManager.handleMessage(playerId, msg);
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
          players.forEach((p) => {
            if (p.room === player.room) {
              roomPlayers.push(p.state);
            }
          });
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
          // Both players confirmed arena loaded — start the match
          const lobbyId = msg.lobbyId;
          const lobby = lobbyManager.lobbies.get(lobbyId);
          if (lobby && lobby.status === 'in_game') {
            // Only create match once (when second player reports ready)
            if (!lobby.matchCreated) {
              lobby.matchCreated = true;
              combatManager.createMatch(lobbyId, lobby.creatorId, lobby.guestId);
            }
          }
          break;
        }
      }
    } catch (e) {
      // Ignore malformed messages
    }
  });

  ws.on('close', () => {
    const player = players.get(playerId);
    if (player) {
      // Handle disconnect based on room
      if (player.room === 'arena') {
        combatManager.handleDisconnect(playerId);
      }
      if (player.room === 'lobby') {
        lobbyManager.handleDisconnect(playerId);
      }

      broadcastToRoom(player.room, {
        type: 'player_leave',
        id: playerId,
      });
    }
    players.delete(playerId);
    console.log(`Player ${playerId} disconnected (${players.size} online)`);
  });

  ws.on('error', () => {
    players.delete(playerId);
  });
});

// ─── START ──────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🏛️  Muzzeum — Multiplayer Server`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   WebSocket on same port`);
});
