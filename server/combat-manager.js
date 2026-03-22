// ─── COMBAT MANAGER — server-authoritative PVP combat ───────────────
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

function setupCombatManager(players, broadcastToRoom, sendTo, lobbyManager) {
  const matches = new Map(); // matchId -> match state

  function createMatch(lobbyId, creatorId, guestId) {
    const match = {
      id: lobbyId,
      player1: creatorId,
      player2: guestId,
      hp: { [creatorId]: 100, [guestId]: 100 },
      roundWins: { [creatorId]: 0, [guestId]: 0 },
      currentRound: 1,
      phase: 'countdown', // countdown | fighting | round_end | match_end
      countdownTimer: 5,
      lastHitTime: { [creatorId]: 0, [guestId]: 0 },
      hearts: [],
      heartSpawnCount: 0,
      heartSpawnTimer: 3 + Math.random() * 5, // first heart spawns 3-8s into round
      startTime: Date.now(),
      intervalId: null,
    };

    matches.set(lobbyId, match);

    // Move both players to arena room
    const p1 = players.get(creatorId);
    const p2 = players.get(guestId);
    if (p1) p1.room = 'arena';
    if (p2) p2.room = 'arena';

    // Start countdown
    startCountdown(match);

    return match;
  }

  function startCountdown(match) {
    match.phase = 'countdown';
    match.countdownTimer = 5;
    match.hp[match.player1] = 100;
    match.hp[match.player2] = 100;
    match.hearts = [];
    match.heartSpawnCount = 0;
    match.heartSpawnTimer = 3 + Math.random() * 5;

    // Send arena setup to both players
    sendTo(match.player1, {
      type: 'arena_setup',
      matchId: match.id,
      round: match.currentRound,
      spawnSide: 'left',
      opponentId: match.player2,
    });
    sendTo(match.player2, {
      type: 'arena_setup',
      matchId: match.id,
      round: match.currentRound,
      spawnSide: 'right',
      opponentId: match.player1,
    });

    // Countdown tick
    if (match.intervalId) clearInterval(match.intervalId);
    match.intervalId = setInterval(() => tickMatch(match), 100); // 10 ticks/sec
  }

  function tickMatch(match) {
    if (match.phase === 'countdown') {
      match.countdownTimer -= 0.1;
      if (match.countdownTimer <= 0) {
        match.phase = 'fighting';
        match.countdownTimer = 0;
        sendToBoth(match, {
          type: 'round_start',
          round: match.currentRound,
        });
      } else {
        sendToBoth(match, {
          type: 'countdown_tick',
          time: Math.ceil(match.countdownTimer),
        });
      }
      return;
    }

    if (match.phase === 'fighting') {
      // Heart spawning logic: 4 hearts per round, staggered randomly
      if (match.heartSpawnCount < 4) {
        match.heartSpawnTimer -= 0.1;
        if (match.heartSpawnTimer <= 0) {
          spawnHeart(match);
          match.heartSpawnCount++;
          match.heartSpawnTimer = 4 + Math.random() * 6; // next heart in 4-10s
        }
      }

      // Check heart pickups
      checkHeartPickups(match);
    }
  }

  function spawnHeart(match) {
    // Random position within 30x30 arena (arena coords: -12 to 12 on x and z)
    const heart = {
      id: Date.now() + Math.random(),
      x: (Math.random() - 0.5) * 24,
      z: (Math.random() - 0.5) * 24,
      active: true,
    };
    match.hearts.push(heart);

    sendToBoth(match, {
      type: 'heart_spawn',
      heart: { id: heart.id, x: heart.x, z: heart.z },
    });
  }

  function checkHeartPickups(match) {
    const p1 = players.get(match.player1);
    const p2 = players.get(match.player2);

    match.hearts.forEach(heart => {
      if (!heart.active) return;

      [match.player1, match.player2].forEach(pid => {
        const p = players.get(pid);
        if (!p) return;
        const dx = p.state.x - heart.x;
        const dz = p.state.z - heart.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 1.2) {
          heart.active = false;
          match.hp[pid] = Math.min(100, match.hp[pid] + 45);
          sendToBoth(match, {
            type: 'heart_picked_up',
            heartId: heart.id,
            playerId: pid,
            hp: match.hp[pid],
          });
        }
      });
    });
  }

  function handleMessage(playerId, msg) {
    const player = players.get(playerId);
    if (!player || player.room !== 'arena') return;

    // Find the match this player is in
    let match = null;
    matches.forEach(m => {
      if (m.player1 === playerId || m.player2 === playerId) {
        match = m;
      }
    });
    if (!match) return;

    switch (msg.type) {
      case 'update': {
        // Position update in arena
        const p = player.state;
        p.x = msg.x;
        p.y = msg.y;
        p.z = msg.z;
        p.yaw = msg.yaw;
        p.pitch = msg.pitch;
        p.activeSlot = msg.activeSlot;
        p.isSwinging = msg.isSwinging;

        // Forward to opponent
        const opponentId = match.player1 === playerId ? match.player2 : match.player1;
        sendTo(opponentId, {
          type: 'player_update',
          id: playerId,
          x: p.x, y: p.y, z: p.z,
          yaw: p.yaw, pitch: p.pitch,
          activeSlot: p.activeSlot,
          isSwinging: p.isSwinging,
        });
        break;
      }

      case 'swing': {
        if (match.phase !== 'fighting') break;

        const now = Date.now();
        const lastHit = match.lastHitTime[playerId] || 0;
        if (now - lastHit < 300) break; // 0.3s cooldown

        // Check if opponent is in range (within ~2.5 blocks, facing direction)
        const attacker = player.state;
        const opponentId = match.player1 === playerId ? match.player2 : match.player1;
        const opponentPlayer = players.get(opponentId);
        if (!opponentPlayer) break;
        const defender = opponentPlayer.state;

        const dx = defender.x - attacker.x;
        const dz = defender.z - attacker.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > 2.5) break; // Out of range

        // Check facing direction (within ~90 degree cone)
        const attackAngle = Math.atan2(-Math.sin(attacker.yaw), -Math.cos(attacker.yaw));
        const toDefenderAngle = Math.atan2(dx, dz);
        let angleDiff = attackAngle - toDefenderAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        if (Math.abs(angleDiff) > Math.PI / 2) break; // Not facing opponent

        // Valid hit!
        match.lastHitTime[playerId] = now;
        match.hp[opponentId] = Math.max(0, match.hp[opponentId] - 10);

        // Notify both players
        sendToBoth(match, {
          type: 'hit',
          attackerId: playerId,
          defenderId: opponentId,
          defenderHp: match.hp[opponentId],
          attackerHp: match.hp[playerId],
        });

        // Forward swing animation to opponent
        sendTo(opponentId, {
          type: 'player_swing',
          id: playerId,
        });

        // Check for round end
        if (match.hp[opponentId] <= 0) {
          endRound(match, playerId, opponentId);
        }
        break;
      }
    }
  }

  function endRound(match, winnerId, loserId) {
    match.phase = 'round_end';
    match.roundWins[winnerId]++;

    sendToBoth(match, {
      type: 'round_end',
      winnerId,
      loserId,
      roundWins: match.roundWins,
      round: match.currentRound,
    });

    // Check for match end (best of 3 = first to 2 wins)
    if (match.roundWins[winnerId] >= 2) {
      setTimeout(() => endMatch(match, winnerId, loserId), 2000);
    } else {
      // Start next round after 5 seconds
      match.currentRound++;
      setTimeout(() => startCountdown(match), 3000);
    }
  }

  async function endMatch(match, winnerId, loserId) {
    match.phase = 'match_end';
    if (match.intervalId) clearInterval(match.intervalId);

    const winnerPlayer = players.get(winnerId);
    const loserPlayer = players.get(loserId);
    const winnerName = winnerPlayer ? winnerPlayer.state.name : 'Unknown';
    const loserName = loserPlayer ? loserPlayer.state.name : 'Unknown';

    sendToBoth(match, {
      type: 'match_end',
      winnerId,
      loserId,
      winnerName,
      loserName,
      roundWins: match.roundWins,
    });

    // Save result to Supabase
    if (supabase) {
      try {
        await supabase.from('match_results').insert({
          winner_name: winnerName,
          loser_name: loserName,
          winner_rounds: match.roundWins[winnerId],
          loser_rounds: match.roundWins[loserId],
        });
        console.log(`[Combat] Match saved: ${winnerName} defeated ${loserName}`);
      } catch (err) {
        console.error('[Combat] Failed to save match result:', err.message);
      }
    }

    // Move both players back to museum after a delay
    setTimeout(() => {
      returnToMuseum(match, winnerId);
      returnToMuseum(match, loserId);
      lobbyManager.removeLobby(match.id);
      matches.delete(match.id);
    }, 3000);
  }

  function returnToMuseum(match, playerId) {
    const player = players.get(playerId);
    if (!player) return;
    player.room = 'museum';
    player.state.x = 0;
    player.state.y = 2.7;
    player.state.z = -28;

    // Send museum re-entry
    const museumPlayers = [];
    players.forEach((p) => {
      if (p.room === 'museum') museumPlayers.push(p.state);
    });
    sendTo(playerId, {
      type: 'returned_to_museum',
      players: museumPlayers,
    });
    broadcastToRoom('museum', { type: 'player_join', player: player.state }, playerId);
  }

  function handleDisconnect(playerId) {
    // Find any match with this player
    matches.forEach((match, matchId) => {
      if (match.player1 === playerId || match.player2 === playerId) {
        const opponentId = match.player1 === playerId ? match.player2 : match.player1;
        if (match.phase !== 'match_end') {
          // Opponent wins by default
          endMatch(match, opponentId, playerId);
        }
      }
    });
  }

  function sendToBoth(match, msg) {
    sendTo(match.player1, msg);
    sendTo(match.player2, msg);
  }

  // Expose createMatch so lobby manager can trigger it
  // This is called from server/index.js when game_starting triggers
  return { handleMessage, handleDisconnect, createMatch };
}

export { setupCombatManager };
