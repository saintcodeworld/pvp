// ─── COMBAT MANAGER — server-authoritative PVP combat ───────────────
// Supports: 1v1 and 2v2 team matches
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

function setupCombatManager(players, broadcastToRoom, sendTo, lobbyManager, changeRoom, getMuseumPlayers) {
  const matches = new Map(); // matchId -> match state
  const playerMatchIndex = new Map(); // playerId -> matchId (O(1) lookup)

  // ─── CREATE MATCH (1v1) ──────────────────────────────────────────
  function createMatch(lobbyId, creatorId, guestId) {
    const match = {
      id: lobbyId,
      mode: '1v1',
      playerIds: [creatorId, guestId],
      teams: { [creatorId]: 1, [guestId]: 2 },
      hp: { [creatorId]: 100, [guestId]: 100 },
      alive: new Set([creatorId, guestId]),
      roundWins: { 1: 0, 2: 0 }, // team-based wins
      currentRound: 1,
      phase: 'countdown',
      countdownTimer: 5,
      lastHitTime: {},
      hearts: [],
      heartSpawnCount: 0,
      heartSpawnTimer: 3 + Math.random() * 5,
      startTime: Date.now(),
      intervalId: null,
    };

    matches.set(lobbyId, match);
    match.playerIds.forEach(pid => {
      changeRoom(pid, 'arena');
      playerMatchIndex.set(pid, lobbyId);
    });

    startCountdown(match);
    return match;
  }

  // ─── CREATE 2v2 MATCH ────────────────────────────────────────────
  function createMatch2v2(lobbyId, lobbyPlayers) {
    // lobbyPlayers: [{id, name, team}]
    const playerIds = lobbyPlayers.map(p => p.id);
    const teams = {};
    lobbyPlayers.forEach(p => { teams[p.id] = p.team; });

    const hp = {};
    playerIds.forEach(pid => { hp[pid] = 100; });

    const match = {
      id: lobbyId,
      mode: '2v2',
      playerIds,
      teams,
      hp,
      alive: new Set(playerIds),
      roundWins: { 1: 0, 2: 0 },
      currentRound: 1,
      phase: 'countdown',
      countdownTimer: 5,
      lastHitTime: {},
      hearts: [],
      heartSpawnCount: 0,
      heartSpawnTimer: 3 + Math.random() * 5,
      startTime: Date.now(),
      intervalId: null,
    };

    matches.set(lobbyId, match);
    playerIds.forEach(pid => {
      changeRoom(pid, 'arena');
      playerMatchIndex.set(pid, lobbyId);
    });

    startCountdown(match);
    return match;
  }

  // ─── COUNTDOWN & TICK ────────────────────────────────────────────
  function startCountdown(match) {
    match.phase = 'countdown';
    match.countdownTimer = 5;
    match.playerIds.forEach(pid => { match.hp[pid] = 100; });
    match.alive = new Set(match.playerIds);
    match.hearts = [];
    match.heartSpawnCount = 0;
    match.heartSpawnTimer = 3 + Math.random() * 5;

    // Send arena setup to all players
    match.playerIds.forEach((pid, idx) => {
      const team = match.teams[pid];
      // Spawn positions: team 1 on left, team 2 on right
      // For 2v2, offset within team
      let spawnSide = team === 1 ? 'left' : 'right';
      const otherIds = match.playerIds.filter(id => id !== pid);

      sendTo(pid, {
        type: 'arena_setup',
        matchId: match.id,
        mode: match.mode,
        round: match.currentRound,
        spawnSide,
        team,
        allPlayers: match.playerIds.map(id => ({
          id, team: match.teams[id],
          name: players.get(id)?.state?.name || 'Unknown',
        })),
        otherPlayerIds: otherIds,
      });
    });

    if (match.intervalId) clearInterval(match.intervalId);
    match.intervalId = setInterval(() => tickMatch(match), 100);
  }

  function tickMatch(match) {
    if (match.phase === 'countdown') {
      match.countdownTimer -= 0.1;
      if (match.countdownTimer <= 0) {
        match.phase = 'fighting';
        match.countdownTimer = 0;
        sendToAll(match, { type: 'round_start', round: match.currentRound });
      } else {
        sendToAll(match, { type: 'countdown_tick', time: Math.ceil(match.countdownTimer) });
      }
      return;
    }

    if (match.phase === 'fighting') {
      // Heart spawning
      const maxHearts = match.mode === '2v2' ? 6 : 4;
      if (match.heartSpawnCount < maxHearts) {
        match.heartSpawnTimer -= 0.1;
        if (match.heartSpawnTimer <= 0) {
          spawnHeart(match);
          match.heartSpawnCount++;
          match.heartSpawnTimer = 4 + Math.random() * 6;
        }
      }
      checkHeartPickups(match);
    }
  }

  function spawnHeart(match) {
    const heart = {
      id: Date.now() + Math.random(),
      x: (Math.random() - 0.5) * 24,
      z: (Math.random() - 0.5) * 24,
      active: true,
    };
    match.hearts.push(heart);
    sendToAll(match, { type: 'heart_spawn', heart: { id: heart.id, x: heart.x, z: heart.z } });
  }

  function checkHeartPickups(match) {
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
          match.hp[pid] = Math.min(100, match.hp[pid] + 45);
          sendToAll(match, {
            type: 'heart_picked_up',
            heartId: heart.id,
            playerId: pid,
            hp: match.hp[pid],
          });
        }
      });
    });
  }

  // ─── MESSAGE HANDLER ─────────────────────────────────────────────
  function handleMessage(playerId, msg) {
    const player = players.get(playerId);
    if (!player || player.room !== 'arena') return;

    const matchId = playerMatchIndex.get(playerId);
    const match = matchId != null ? matches.get(matchId) : null;
    if (!match) return;

    switch (msg.type) {
      case 'update': {
        const p = player.state;
        p.x = msg.x; p.y = msg.y; p.z = msg.z;
        p.yaw = msg.yaw; p.pitch = msg.pitch;
        p.activeSlot = msg.activeSlot;
        p.isSwinging = msg.isSwinging;

        // Forward to all other players in match
        match.playerIds.forEach(pid => {
          if (pid !== playerId) {
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
        if (match.phase !== 'fighting') break;
        if (!match.alive.has(playerId)) break;

        const now = Date.now();
        const lastHit = match.lastHitTime[playerId] || 0;
        if (now - lastHit < 300) break;

        const attacker = player.state;
        const attackAngle = Math.atan2(-Math.sin(attacker.yaw), -Math.cos(attacker.yaw));
        const myTeam = match.teams[playerId];

        // Check all alive enemies
        match.playerIds.forEach(targetId => {
          if (targetId === playerId) return;
          if (!match.alive.has(targetId)) return;
          // In 2v2, can't hit teammates
          if (match.teams[targetId] === myTeam) return;

          const targetPlayer = players.get(targetId);
          if (!targetPlayer) return;
          const defender = targetPlayer.state;

          const dx = defender.x - attacker.x;
          const dz = defender.z - attacker.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist > 2.5) return;

          const toDefenderAngle = Math.atan2(dx, dz);
          let angleDiff = attackAngle - toDefenderAngle;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          if (Math.abs(angleDiff) > Math.PI / 2) return;

          // Valid hit
          match.lastHitTime[playerId] = now;
          match.hp[targetId] = Math.max(0, match.hp[targetId] - 10);

          sendToAll(match, {
            type: 'hit',
            attackerId: playerId,
            defenderId: targetId,
            defenderHp: match.hp[targetId],
            attackerHp: match.hp[playerId],
          });

          // Forward swing animation
          match.playerIds.forEach(pid => {
            if (pid !== playerId) sendTo(pid, { type: 'player_swing', id: playerId });
          });

          // Check elimination
          if (match.hp[targetId] <= 0) {
            match.alive.delete(targetId);
            sendToAll(match, { type: 'player_eliminated', playerId: targetId, killerId: playerId });
            checkRoundEnd(match);
          }
        });
        break;
      }
    }
  }

  // ─── ROUND / MATCH END ───────────────────────────────────────────
  function checkRoundEnd(match) {
    // Check which teams still have alive players
    const aliveTeams = new Set();
    match.alive.forEach(pid => aliveTeams.add(match.teams[pid]));

    if (aliveTeams.size > 1) return; // Round still going

    const winningTeam = aliveTeams.values().next().value;
    if (winningTeam === undefined) return; // shouldn't happen

    match.phase = 'round_end';
    match.roundWins[winningTeam]++;

    sendToAll(match, {
      type: 'round_end',
      winningTeam,
      roundWins: match.roundWins,
      round: match.currentRound,
    });

    // Best of 3
    if (match.roundWins[winningTeam] >= 2) {
      setTimeout(() => endMatch(match, winningTeam), 2000);
    } else {
      match.currentRound++;
      setTimeout(() => startCountdown(match), 3000);
    }
  }

  async function endMatch(match, winningTeam) {
    match.phase = 'match_end';
    if (match.intervalId) clearInterval(match.intervalId);

    const winnerIds = match.playerIds.filter(pid => match.teams[pid] === winningTeam);
    const loserIds = match.playerIds.filter(pid => match.teams[pid] !== winningTeam);
    const winnerNames = winnerIds.map(pid => players.get(pid)?.state?.name || 'Unknown');
    const loserNames = loserIds.map(pid => players.get(pid)?.state?.name || 'Unknown');

    sendToAll(match, {
      type: 'match_end',
      mode: match.mode,
      winningTeam,
      winnerIds,
      loserIds,
      winnerNames,
      loserNames,
      roundWins: match.roundWins,
    });

    // Save to Supabase
    if (supabase) {
      try {
        await supabase.from('match_results').insert({
          winner_name: winnerNames.join(' & '),
          loser_name: loserNames.join(' & '),
          winner_rounds: match.roundWins[winningTeam],
          loser_rounds: match.roundWins[winningTeam === 1 ? 2 : 1],
          game_mode: match.mode,
        });
        console.log(`[Combat] ${match.mode} match saved: ${winnerNames.join('&')} defeated ${loserNames.join('&')}`);
      } catch (err) {
        console.error('[Combat] Failed to save match result:', err.message);
      }
    }

    // Return all players to museum
    setTimeout(() => {
      match.playerIds.forEach(pid => returnToMuseum(match, pid));
      lobbyManager.removeLobby(match.id);
      matches.delete(match.id);
    }, 3000);
  }

  function returnToMuseum(match, playerId) {
    const player = players.get(playerId);
    if (!player) return;
    changeRoom(playerId, 'museum');
    player.state.x = 0;
    player.state.y = 2.7;
    player.state.z = -28;
    playerMatchIndex.delete(playerId);

    sendTo(playerId, { type: 'returned_to_museum', players: getMuseumPlayers() });
    broadcastToRoom('museum', { type: 'player_join', player: player.state }, playerId);
  }

  function handleDisconnect(playerId) {
    const matchId = playerMatchIndex.get(playerId);
    if (matchId == null) return;
    const match = matches.get(matchId);
    if (!match || match.phase === 'match_end') return;

    match.alive.delete(playerId);
    match.hp[playerId] = 0;
    sendToAll(match, { type: 'player_eliminated', playerId, killerId: null });
    checkRoundEnd(match);
  }

  function sendToAll(match, msg) {
    match.playerIds.forEach(pid => sendTo(pid, msg));
  }

  return { handleMessage, handleDisconnect, createMatch, createMatch2v2 };
}

export { setupCombatManager };
