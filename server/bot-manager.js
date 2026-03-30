// ─── BOT MANAGER — server-side AI bots for FFA matches ──────────────
// Medium difficulty: bots navigate, pursue targets, attack with human-like
// reaction times, and pick up hearts. They don't have perfect aim or instant
// reactions, making them beatable but still a challenge.

const BOT_NAMES = [
  'BotSteve', 'CraftBot', 'NPC_Alex', 'PixelSlayer', 'VoxelKnight',
  'BlockMaster', 'CubeWarrior', 'MineGuard', 'NPC_Rex', 'GridFighter',
  'BitBrawler', 'RoboMiner', 'AutoSword', 'NPC_Kai', 'NetBlade',
  'CyberBlock', 'NPC_Luna', 'DigiSword', 'BotBlade', 'IronNPC',
];

const BOT_COLORS = [
  '#ff4444', '#44ff44', '#4488ff', '#ffaa00', '#ff44ff',
  '#44ffff', '#ff8844', '#88ff44', '#4444ff', '#ffff44',
];

let nextBotId = 900000;

function createBot() {
  const id = nextBotId++;
  const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + '_' + (id % 1000);
  const color = BOT_COLORS[Math.floor(Math.random() * BOT_COLORS.length)];

  return {
    id,
    isBot: true,
    name,
    color,
    state: {
      id,
      name,
      color,
      x: 0,
      y: 1.7,
      z: 0,
      yaw: Math.random() * Math.PI * 2,
      pitch: 0,
      activeSlot: 1,
      isSwinging: false,
    },
    // AI state
    ai: {
      targetId: null,
      lastTargetSwitch: 0,
      lastSwingTime: 0,
      lastMoveDecision: 0,
      moveDir: { x: 0, z: 0 },
      wanderAngle: Math.random() * Math.PI * 2,
      reactionDelay: 300 + Math.random() * 400, // 300-700ms reaction (medium)
      aimJitter: 0.3 + Math.random() * 0.2, // some inaccuracy
      aggressionRadius: 12 + Math.random() * 8, // 12-20 blocks
      fleeHpThreshold: 25 + Math.random() * 15, // flee at 25-40 HP
      strafeDir: Math.random() > 0.5 ? 1 : -1,
      strafeTimer: 0,
      heartTarget: null,
    },
  };
}

function setupBotManager(ffaManager, players, broadcastToRoom, sendTo, changeRoom) {
  const activeBots = new Map(); // botId -> bot object

  function addBotToQueue() {
    const bot = createBot();
    activeBots.set(bot.id, bot);

    // Register bot as a fake player in the players map
    players.set(bot.id, {
      ws: { readyState: 1, send: () => {} }, // dummy ws
      state: bot.state,
      room: 'museum',
      isBot: true,
      msgCount: 0,
      msgWindowStart: Date.now(),
    });

    // Add to FFA queue
    ffaManager.queue.push({ id: bot.id, name: bot.name });
    changeRoom(bot.id, 'ffa_queue');
    broadcastToRoom('museum', { type: 'player_leave', id: bot.id }, bot.id);

    // Broadcast queue update
    const count = ffaManager.queue.length;
    ffaManager.queue.forEach(p => {
      sendTo(p.id, { type: 'ffa_queue_update', count, max: 8, players: ffaManager.queue.map(q => q.name) });
    });
    broadcastToRoom('museum', { type: 'ffa_queue_count', count, max: 8 });

    // Check if queue is full — trigger match start
    if (ffaManager.queue.length >= 8) {
      ffaManager.handleMessage(bot.id, { type: 'ffa_join_queue_check_start' });
    }

    return bot;
  }

  function removeBotFromQueue(botId) {
    const idx = ffaManager.queue.findIndex(p => p.id === botId);
    if (idx !== -1) {
      ffaManager.queue.splice(idx, 1);
      changeRoom(botId, 'museum');
      const count = ffaManager.queue.length;
      ffaManager.queue.forEach(p => {
        sendTo(p.id, { type: 'ffa_queue_update', count, max: 8, players: ffaManager.queue.map(q => q.name) });
      });
      broadcastToRoom('museum', { type: 'ffa_queue_count', count, max: 8 });
    }
    players.delete(botId);
    activeBots.delete(botId);
  }

  function getActiveBotIds() {
    return [...activeBots.keys()];
  }

  function getQueuedBotCount() {
    let count = 0;
    ffaManager.queue.forEach(p => {
      if (activeBots.has(p.id)) count++;
    });
    return count;
  }

  // Core AI tick — called from ffa-manager during fighting phase
  function tickBots(match) {
    if (match.phase !== 'fighting') return;

    const now = Date.now();
    const ARENA_HALF = 20 - 1; // FFA_ARENA_SIZE/2 - margin

    match.playerIds.forEach(botId => {
      if (!activeBots.has(botId)) return;
      if (!match.alive.has(botId)) return;

      const bot = activeBots.get(botId);
      const player = players.get(botId);
      if (!bot || !player) return;

      const ai = bot.ai;
      const state = bot.state;

      // Gather alive enemies
      const enemies = [];
      match.playerIds.forEach(pid => {
        if (pid === botId || !match.alive.has(pid)) return;
        const p = players.get(pid);
        if (!p) return;
        const dx = p.state.x - state.x;
        const dz = p.state.z - state.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        enemies.push({ id: pid, x: p.state.x, z: p.state.z, dist, hp: match.hp[pid] });
      });

      // Pick target — prefer closest enemy, switch every 2-4 seconds
      if (!ai.targetId || !match.alive.has(ai.targetId) || now - ai.lastTargetSwitch > 2000 + Math.random() * 2000) {
        const inRange = enemies.filter(e => e.dist < ai.aggressionRadius);
        if (inRange.length > 0) {
          // Prefer lowest HP enemy within range (medium strategy)
          inRange.sort((a, b) => a.hp - b.hp || a.dist - b.dist);
          ai.targetId = inRange[0].id;
        } else if (enemies.length > 0) {
          enemies.sort((a, b) => a.dist - b.dist);
          ai.targetId = enemies[0].id;
        } else {
          ai.targetId = null;
        }
        ai.lastTargetSwitch = now;
      }

      // Check for nearby hearts when low HP
      let heartTarget = null;
      if (match.hp[botId] < 70) {
        let closestHeartDist = 999;
        match.hearts.forEach(h => {
          if (!h.active) return;
          const hdx = h.x - state.x;
          const hdz = h.z - state.z;
          const hDist = Math.sqrt(hdx * hdx + hdz * hdz);
          if (hDist < closestHeartDist && hDist < 15) {
            closestHeartDist = hDist;
            heartTarget = h;
          }
        });
      }

      // Movement decision
      const MOVE_SPEED = 5.5; // slightly slower than players (~6.0)
      const dt = 0.1; // tick interval
      let moveX = 0;
      let moveZ = 0;

      const shouldFlee = match.hp[botId] < ai.fleeHpThreshold && enemies.some(e => e.dist < 5);

      if (heartTarget && match.hp[botId] < 60) {
        // Go to heart
        const dx = heartTarget.x - state.x;
        const dz = heartTarget.z - state.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 0.5) {
          moveX = (dx / dist) * MOVE_SPEED * dt;
          moveZ = (dz / dist) * MOVE_SPEED * dt;
          state.yaw = Math.atan2(-dx, -dz);
        }
      } else if (shouldFlee) {
        // Flee from nearest enemy
        const nearest = enemies.sort((a, b) => a.dist - b.dist)[0];
        if (nearest) {
          const dx = state.x - nearest.x;
          const dz = state.z - nearest.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist > 0) {
            moveX = (dx / dist) * MOVE_SPEED * dt;
            moveZ = (dz / dist) * MOVE_SPEED * dt;
            state.yaw = Math.atan2(-dx, -dz);
          }
        }
      } else if (ai.targetId) {
        const target = enemies.find(e => e.id === ai.targetId);
        if (target) {
          const dx = target.x - state.x;
          const dz = target.z - state.z;
          const dist = target.dist;

          if (dist > 2.2) {
            // Approach target
            moveX = (dx / dist) * MOVE_SPEED * dt;
            moveZ = (dz / dist) * MOVE_SPEED * dt;

            // Add strafing for medium difficulty
            ai.strafeTimer -= dt;
            if (ai.strafeTimer <= 0) {
              ai.strafeDir *= -1;
              ai.strafeTimer = 0.5 + Math.random() * 1.5;
            }
            if (dist < 8) {
              const perpX = -dz / dist;
              const perpZ = dx / dist;
              moveX += perpX * ai.strafeDir * MOVE_SPEED * dt * 0.4;
              moveZ += perpZ * ai.strafeDir * MOVE_SPEED * dt * 0.4;
            }
          } else {
            // In attack range — circle strafe
            const perpX = -dz / dist;
            const perpZ = dx / dist;
            moveX = perpX * ai.strafeDir * MOVE_SPEED * dt * 0.6;
            moveZ = perpZ * ai.strafeDir * MOVE_SPEED * dt * 0.6;
          }

          // Face target (with jitter for medium difficulty)
          const jitter = (Math.random() - 0.5) * ai.aimJitter;
          state.yaw = Math.atan2(-dx, -dz) + jitter;
        }
      } else {
        // Wander
        ai.wanderAngle += (Math.random() - 0.5) * 0.3;
        moveX = Math.sin(ai.wanderAngle) * MOVE_SPEED * dt * 0.5;
        moveZ = Math.cos(ai.wanderAngle) * MOVE_SPEED * dt * 0.5;
        state.yaw = -ai.wanderAngle;
      }

      // Apply movement with arena bounds
      state.x = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, state.x + moveX));
      state.z = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, state.z + moveZ));

      // Bounce off walls
      if (Math.abs(state.x) > ARENA_HALF - 1 || Math.abs(state.z) > ARENA_HALF - 1) {
        ai.wanderAngle += Math.PI * 0.5;
      }

      // Attack if target in range
      if (ai.targetId && match.alive.has(ai.targetId)) {
        const target = enemies.find(e => e.id === ai.targetId);
        if (target && target.dist <= 2.5) {
          if (now - ai.lastSwingTime >= ai.reactionDelay + 300) {
            ai.lastSwingTime = now;
            ffaManager.handleMessage(botId, { type: 'swing' });
          }
        }
      }

      // Broadcast position to all players in match
      match.playerIds.forEach(pid => {
        if (pid !== botId && match.alive.has(pid)) {
          sendTo(pid, {
            type: 'player_update',
            id: botId,
            x: state.x, y: state.y, z: state.z,
            yaw: state.yaw, pitch: state.pitch,
            activeSlot: state.activeSlot,
            isSwinging: state.isSwinging,
          });
        }
      });
    });
  }

  // Clean up bots after match ends
  function cleanupBotsForMatch(matchPlayerIds) {
    matchPlayerIds.forEach(pid => {
      if (activeBots.has(pid)) {
        activeBots.delete(pid);
        // Don't delete from players map here — ffa-manager handles room transitions
        // We'll clean up after the museum return
        setTimeout(() => {
          players.delete(pid);
        }, 6000);
      }
    });
  }

  function getBotCount() {
    return activeBots.size;
  }

  function isBot(playerId) {
    return activeBots.has(playerId);
  }

  return {
    addBotToQueue,
    removeBotFromQueue,
    getActiveBotIds,
    getQueuedBotCount,
    tickBots,
    cleanupBotsForMatch,
    getBotCount,
    isBot,
    activeBots,
  };
}

export { setupBotManager };
