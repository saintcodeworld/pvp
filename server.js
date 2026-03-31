const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

// ─── HTTP STATIC FILE SERVER ─────────────────────────────────────────
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
  const fullPath = path.join(__dirname, filePath);
  const ext = path.extname(fullPath);

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// ─── WEBSOCKET MULTIPLAYER SERVER ────────────────────────────────────
const wss = new WebSocketServer({ server });

const players = new Map();
let nextId = 1;

function randomPlayerColor() {
  const colors = [
    '#ff4444', '#44ff44', '#4488ff', '#ffaa00', '#ff44ff',
    '#44ffff', '#ff8844', '#88ff44', '#4444ff', '#ffff44',
    '#ff4488', '#44ff88', '#8844ff', '#ff8888', '#88ffff',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

function broadcastExclude(msg, excludeId) {
  const data = JSON.stringify(msg);
  wss.clients.forEach((client) => {
    if (client.readyState === 1 && client.playerId !== excludeId) {
      client.send(data);
    }
  });
}

function broadcastAll(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(data);
    }
  });
}

wss.on('connection', (ws) => {
  const playerId = nextId++;
  const playerColor = randomPlayerColor();
  ws.playerId = playerId;

  const playerState = {
    id: playerId,
    name: 'Player ' + playerId,
    color: playerColor,
    x: 0, y: 2.7, z: -28,
    yaw: 0, pitch: 0,
    activeSlot: 0,
    isSwinging: false,
  };
  players.set(playerId, playerState);

  // Send init with all current players
  ws.send(JSON.stringify({
    type: 'init',
    id: playerId,
    color: playerColor,
    players: Array.from(players.values()),
  }));

  // Notify others
  broadcastExclude({
    type: 'player_join',
    player: playerState,
  }, playerId);

  console.log(`Player ${playerId} connected (${players.size} online)`);

  ws.on('message', (rawData) => {
    try {
      const msg = JSON.parse(rawData);

      switch (msg.type) {
        case 'update': {
          const p = players.get(playerId);
          if (!p) break;
          p.x = msg.x;
          p.y = msg.y;
          p.z = msg.z;
          p.yaw = msg.yaw;
          p.pitch = msg.pitch;
          p.activeSlot = msg.activeSlot;
          p.isSwinging = msg.isSwinging;

          broadcastExclude({
            type: 'player_update',
            id: playerId,
            x: p.x, y: p.y, z: p.z,
            yaw: p.yaw, pitch: p.pitch,
            activeSlot: p.activeSlot,
            isSwinging: p.isSwinging,
          }, playerId);
          break;
        }

        case 'set_name': {
          const p = players.get(playerId);
          if (!p) break;
          p.name = (msg.name || 'Player').substring(0, 20);
          broadcastAll({
            type: 'player_name',
            id: playerId,
            name: p.name,
          });
          break;
        }

        case 'chat': {
          const p = players.get(playerId);
          if (!p) break;
          const text = (msg.text || '').substring(0, 200);
          broadcastAll({
            type: 'chat',
            id: playerId,
            name: p.name,
            text,
          });
          break;
        }

        case 'swing': {
          broadcastExclude({
            type: 'player_swing',
            id: playerId,
          }, playerId);
          break;
        }
      }
    } catch (e) {
      // Ignore malformed messages
    }
  });

  ws.on('close', () => {
    players.delete(playerId);
    broadcastAll({
      type: 'player_leave',
      id: playerId,
    });
    console.log(`Player ${playerId} disconnected (${players.size} online)`);
  });

  ws.on('error', () => {
    players.delete(playerId);
  });
});

// ─── START ───────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`⚔️  PVP WARS — Multiplayer Server`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   WebSocket on same port`);
});
