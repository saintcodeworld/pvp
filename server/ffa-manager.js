// ─── FFA MANAGER — Free-For-All (8 players, last man standing) ──────
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

const FFA_MAX_PLAYERS = 8;
const FFA_ARENA_SIZE = 40; // 40x40 arena for 8 players
const FFA_HEART_HP = 45;
const FFA_HIT_DAMAGE = 10;
const FFA_HIT_COOLDOWN = 300; // ms

function setupFFAManager(players, broadcastToRoom, sendTo, changeRoom, getMuseumPlayers, payoutManager) {
  // Queue of players waiting for FFA
  const queue = []; // [{id, name}]
  // Active FFA matches
  const ffaMatches = new Map(); // matchId -> match state
  const playerMatchIndex = new Map(); // playerId -> matchId (O(1) lookup)
  let nextFFAId = 1;
  let botManager = null; // set externally after both managers are created

  function setBotManager(bm) { botManager = bm; }

  /** Human eliminated mid-match — send them back to the museum immediately */
  function returnEliminatedHumanToMuseum(targetId) {
    const targetPlayer = players.get(targetId);
    if (!targetPlayer || targetPlayer.isBot) return;

    playerMatchIndex.delete(targetId);
    if (targetPlayer.room !== 'museum') {
      changeRoom(targetId, 'museum');
    }
    targetPlayer.state.x = 0;
    targetPlayer.state.y = 2.7;
    targetPlayer.state.z = -28;

    sendTo(targetId, { type: 'returned_to_museum', players: getMuseumPlayers() });
    broadcastToRoom('museum', { type: 'player_join', player: targetPlayer.state }, targetId);
  }

  function getQueueCount() { return queue.length; }

  function broadcastQueueUpdate() {
    // Notify all queued players and all museum players about queue count
    const count = queue.length;
    queue.forEach(p => {
      sendTo(p.id, { type: 'ffa_queue_update', count, max: FFA_MAX_PLAYERS, players: queue.map(q => q.name) });
    });
    // Also broadcast to museum so the interaction block updates
    broadcastToRoom('museum', { type: 'ffa_queue_count', count, max: FFA_MAX_PLAYERS });
  }

  function handleMessage(playerId, msg) {
    const player = players.get(playerId);
    if (!player) return;

    switch (msg.type) {
      case 'ffa_join_queue': {
        if (queue.some(p => p.id === playerId)) {
          sendTo(playerId, { type: 'ffa_error', message: 'Already in queue' });
          break;
        }
        queue.push({ id: playerId, name: player.state.name });
        // Player stays in museum room — can keep walking around
        broadcastQueueUpdate();

        if (queue.length >= FFA_MAX_PLAYERS) {
          startFFAMatch();
        }
        break;
      }

      case 'ffa_join_queue_check_start': {
        // Triggered by bot-manager after adding a bot to check if we should start
        if (queue.length >= FFA_MAX_PLAYERS) {
          startFFAMatch();
        }
        break;
      }

      case 'ffa_leave_queue': {
        const idx = queue.findIndex(p => p.id === playerId);
        if (idx !== -1) {
          queue.splice(idx, 1);
          // Player was never moved out of museum — just update queue
          sendTo(playerId, { type: 'ffa_queue_left' });
          broadcastQueueUpdate();
        }
        break;
      }

      case 'update': {
        // Position update in FFA arena
        const p = player.state;
        if (typeof msg.x === 'number' && Number.isFinite(msg.x)) p.x = Math.max(-200, Math.min(200, msg.x));
        if (typeof msg.y === 'number' && Number.isFinite(msg.y)) p.y = Math.max(-20, Math.min(50, msg.y));
        if (typeof msg.z === 'number' && Number.isFinite(msg.z)) p.z = Math.max(-200, Math.min(200, msg.z));
        if (typeof msg.yaw === 'number' && Number.isFinite(msg.yaw)) p.yaw = Math.max(-Math.PI * 2, Math.min(Math.PI * 2, msg.yaw));
        if (typeof msg.pitch === 'number' && Number.isFinite(msg.pitch)) p.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, msg.pitch));
        if (typeof msg.activeSlot === 'number' && Number.isFinite(msg.activeSlot)) p.activeSlot = Math.max(0, Math.min(8, Math.trunc(msg.activeSlot)));
        p.isSwinging = !!msg.isSwinging;

        // Find match and forward to all other alive players
        const matchId = playerMatchIndex.get(playerId);
        const match = matchId != null ? ffaMatches.get(matchId) : null;
        if (!match) break;

        match.playerIds.forEach(pid => {
          if (pid !== playerId && match.alive.has(pid)) {
            sendTo(pid, {
              type: 'player_update', id: playerId,
              x: p.x, y: p.y, z: p.z,
              yaw: p.yaw, pitch: p.pitch,
              activeSlot: p.activeSlot, isSwinging: p.isSwinging,
            });
          }
        });
        break;
      }

      case 'swing': {
        const swingMatchId = playerMatchIndex.get(playerId);
        const match = swingMatchId != null ? ffaMatches.get(swingMatchId) : null;
        if (!match || match.phase !== 'fighting') break;
        if (!match.alive.has(playerId)) break;

        const now = Date.now();
        const lastHit = match.lastHitTime[playerId] || 0;
        if (now - lastHit < FFA_HIT_COOLDOWN) break;

        const attacker = player.state;
        const attackAngle = Math.atan2(-Math.sin(attacker.yaw), -Math.cos(attacker.yaw));

        // Check all alive enemies (everyone is an enemy in FFA)
        match.playerIds.forEach(targetId => {
          if (targetId === playerId) return;
          if (!match.alive.has(targetId)) return;

          const targetPlayer = players.get(targetId);
          if (!targetPlayer) return;
          const defender = targetPlayer.state;

          const dx = defender.x - attacker.x;
          const dz = defender.z - attacker.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist > 3.5) return;

          const toDefenderAngle = Math.atan2(dx, dz);
          let angleDiff = attackAngle - toDefenderAngle;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          if (Math.abs(angleDiff) > Math.PI / 2) return;

          // Valid hit
          match.lastHitTime[playerId] = now;
          match.hp[targetId] = Math.max(0, match.hp[targetId] - FFA_HIT_DAMAGE);
          match.kills[playerId] = (match.kills[playerId] || 0);

          sendToAllFFA(match, {
            type: 'hit',
            attackerId: playerId,
            defenderId: targetId,
            defenderHp: match.hp[targetId],
            attackerHp: match.hp[playerId],
            attackerX: attacker.x,
            attackerZ: attacker.z,
          });

          // Forward swing animation
          match.playerIds.forEach(pid => {
            if (pid !== playerId) sendTo(pid, { type: 'player_swing', id: playerId });
          });

          // Check elimination
          if (match.hp[targetId] <= 0) {
            match.alive.delete(targetId);
            match.kills[playerId] = (match.kills[playerId] || 0) + 1;
            match.elimOrder.push(targetId);
            sendToAllFFA(match, {
              type: 'ffa_player_eliminated',
              playerId: targetId,
              killerId: playerId,
              killerName: player.state.name,
              eliminatedName: targetPlayer.state.name,
              remaining: match.alive.size,
            });
            returnEliminatedHumanToMuseum(targetId);
            checkFFAEnd(match);
          }
        });
        break;
      }
    }
  }

  function startFFAMatch() {
    const matchId = nextFFAId++;
    const matchPlayers = queue.splice(0, FFA_MAX_PLAYERS);
    const playerIds = matchPlayers.map(p => p.id);

    const hp = {};
    const kills = {};
    playerIds.forEach(pid => { hp[pid] = 100; kills[pid] = 0; });

    const match = {
      id: matchId,
      playerIds,
      hp,
      kills,
      alive: new Set(playerIds),
      elimOrder: [], // order of elimination (first eliminated = last place)
      phase: 'countdown',
      countdownTimer: 5,
      lastHitTime: {},
      hearts: [],
      heartSpawnCount: 0,
      heartSpawnTimer: 5 + Math.random() * 5,
      intervalId: null,
    };

    ffaMatches.set(matchId, match);

    // Move all from museum to ffa_arena room
    playerIds.forEach(pid => {
      broadcastToRoom('museum', { type: 'player_leave', id: pid }, pid);
      changeRoom(pid, 'ffa_arena');
      playerMatchIndex.set(pid, matchId);
    });

    // Send setup to all players with spawn positions
    const spawnPositions = generateSpawnPositions(playerIds.length);
    playerIds.forEach((pid, idx) => {
      const p = players.get(pid);
      // Apply spawn position to player state (critical for bots)
      if (p) {
        p.state.x = spawnPositions[idx].x;
        p.state.y = 1.7;
        p.state.z = spawnPositions[idx].z;
      }

      sendTo(pid, {
        type: 'ffa_arena_setup',
        matchId,
        spawnX: spawnPositions[idx].x,
        spawnZ: spawnPositions[idx].z,
        allPlayers: playerIds.map(id => ({
          id,
          name: players.get(id)?.state?.name || 'Unknown',
        })),
        totalPlayers: playerIds.length,
      });
    });

    // Start countdown
    match.intervalId = setInterval(() => tickFFA(match), 100);
    broadcastQueueUpdate();
  }

  function generateSpawnPositions(count) {
    const positions = [];
    const radius = 14;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      positions.push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
      });
    }
    return positions;
  }

  function tickFFA(match) {
    if (match.phase === 'countdown') {
      match.countdownTimer -= 0.1;
      if (match.countdownTimer <= 0) {
        match.phase = 'fighting';
        sendToAllFFA(match, { type: 'ffa_round_start' });
      } else {
        sendToAllFFA(match, { type: 'countdown_tick', time: Math.ceil(match.countdownTimer) });
      }
      return;
    }

    if (match.phase === 'fighting') {
      // Heart spawning (more hearts for 8 players)
      if (match.heartSpawnCount < 12) {
        match.heartSpawnTimer -= 0.1;
        if (match.heartSpawnTimer <= 0) {
          spawnFFAHeart(match);
          match.heartSpawnCount++;
          match.heartSpawnTimer = 3 + Math.random() * 5;
        }
      }
      checkFFAHeartPickups(match);

      // Tick bot AI
      if (botManager) botManager.tickBots(match);
    }
  }

  function spawnFFAHeart(match) {
    const half = FFA_ARENA_SIZE / 2 - 5;
    const heart = {
      id: Date.now() + Math.random(),
      x: (Math.random() - 0.5) * half * 2,
      z: (Math.random() - 0.5) * half * 2,
      active: true,
    };
    match.hearts.push(heart);
    sendToAllFFA(match, { type: 'heart_spawn', heart: { id: heart.id, x: heart.x, z: heart.z } });
  }

  function checkFFAHeartPickups(match) {
    match.hearts.forEach(heart => {
      if (!heart.active) return;
      match.playerIds.forEach(pid => {
        if (!match.alive.has(pid)) return;
        const p = players.get(pid);
        if (!p) return;
        const dx = p.state.x - heart.x;
        const dz = p.state.z - heart.z;
        if (Math.sqrt(dx * dx + dz * dz) < 1.2) {
          heart.active = false;
          match.hp[pid] = Math.min(100, match.hp[pid] + FFA_HEART_HP);
          sendToAllFFA(match, {
            type: 'heart_picked_up',
            heartId: heart.id,
            playerId: pid,
            hp: match.hp[pid],
          });
        }
      });
    });
  }

  function checkFFAEnd(match) {
    if (match.alive.size > 1) return;

    match.phase = 'match_end';
    if (match.intervalId) clearInterval(match.intervalId);

    const winnerId = match.alive.values().next().value;
    const winnerName = players.get(winnerId)?.state?.name || 'Unknown';

    // Build placements: winner is 1st, then reverse of elimOrder
    const placements = [];
    // Winner
    placements.push({ id: winnerId, name: winnerName, placement: 1, kills: match.kills[winnerId] || 0 });
    // Eliminated in reverse order (last eliminated = 2nd place)
    for (let i = match.elimOrder.length - 1; i >= 0; i--) {
      const pid = match.elimOrder[i];
      const name = players.get(pid)?.state?.name || 'Unknown';
      placements.push({ id: pid, name, placement: placements.length + 1, kills: match.kills[pid] || 0 });
    }

    sendToAllFFA(match, {
      type: 'ffa_match_end',
      winnerId,
      winnerName,
      placements,
    });

    saveFFAResults(placements);
    queueFFAPayouts(match.id, placements);

    // Clean up bots
    if (botManager) botManager.cleanupBotsForMatch(match.playerIds);

    // Return remaining players to museum after delay (eliminated players already left)
    setTimeout(() => {
      match.playerIds.forEach(pid => {
        const player = players.get(pid);
        if (!player) return;
        if (player.isBot) {
          playerMatchIndex.delete(pid);
          return;
        }
        if (player.room === 'museum') {
          playerMatchIndex.delete(pid);
          return;
        }
        changeRoom(pid, 'museum');
        player.state.x = 0;
        player.state.y = 2.7;
        player.state.z = -28;
        playerMatchIndex.delete(pid);

        sendTo(pid, { type: 'returned_to_museum', players: getMuseumPlayers() });
        broadcastToRoom('museum', { type: 'player_join', player: player.state }, pid);
      });
      ffaMatches.delete(match.id);
    }, 5000);
  }

  async function saveFFAResults(placements) {
    if (!supabase) return;
    try {
      const rows = placements.map(p => ({
        player_name: p.name,
        placement: p.placement,
        kills: p.kills,
        total_players: placements.length,
      }));
      await supabase.from('ffa_results').insert(rows);
      console.log(`[FFA] Match results saved (${placements.length} players)`);
    } catch (err) {
      console.error('[FFA] Failed to save results:', err.message);
    }
  }

  async function queueFFAPayouts(matchId, placements) {
    if (!payoutManager?.PAYOUT_ENABLED || !Array.isArray(placements) || placements.length === 0) return;
    try {
      const recipients = [];
      placements.forEach((p) => {
        if (!p || typeof p.name !== 'string') return;
        if (p.placement === 1) recipients.push({ playerName: p.name, amountSol: payoutManager.PAYOUTS.ffaFirst, placement: 1 });
        if (p.placement === 2) recipients.push({ playerName: p.name, amountSol: payoutManager.PAYOUTS.ffaSecond, placement: 2 });
        if (p.placement === 3) recipients.push({ playerName: p.name, amountSol: payoutManager.PAYOUTS.ffaThird, placement: 3 });
      });
      await payoutManager.queuePayouts(recipients, {
        mode: 'ffa',
        reason: 'ffa_placement',
        matchId,
      });
    } catch (err) {
      console.error('[Payout] Failed in FFA payout flow:', err.message);
    }
  }

  function handleDisconnect(playerId) {
    // Remove from queue
    const qIdx = queue.findIndex(p => p.id === playerId);
    if (qIdx !== -1) {
      queue.splice(qIdx, 1);
      broadcastQueueUpdate();
    }

    // Handle active FFA match
    const matchId = playerMatchIndex.get(playerId);
    if (matchId != null) {
      const match = ffaMatches.get(matchId);
      if (match && match.phase !== 'match_end' && match.alive.has(playerId)) {
        match.alive.delete(playerId);
        match.hp[playerId] = 0;
        match.elimOrder.push(playerId);
        sendToAllFFA(match, {
          type: 'ffa_player_eliminated',
          playerId,
          killerId: null,
          killerName: null,
          eliminatedName: players.get(playerId)?.state?.name || 'Unknown',
          remaining: match.alive.size,
        });
        checkFFAEnd(match);
      }
    }
  }

  function sendToAllFFA(match, msg) {
    match.playerIds.forEach(pid => sendTo(pid, msg));
  }

  return { handleMessage, handleDisconnect, getQueueCount, queue, setBotManager, ffaMatches };
}

export { setupFFAManager };
