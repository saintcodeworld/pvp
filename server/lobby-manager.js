// ─── LOBBY MANAGER — create/join/list lobbies for PVP Wars ─────────
// Supports: 1v1, 2v2, private lobbies with codes

function generateLobbyCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function setupLobbyManager(players, broadcastToRoom, sendTo, changeRoom, getMuseumPlayers) {
  // lobbyId -> { id, mode:'1v1'|'2v2', isPrivate, code, creatorId, creatorName,
  //              players: [{id,name,team}], maxPlayers, status:'waiting'|'in_game' }
  const lobbies = new Map();
  let nextLobbyId = 1;

  function getOpenLobbies() {
    const open = [];
    lobbies.forEach((lobby) => {
      if (lobby.status === 'waiting' && !lobby.isPrivate) {
        open.push({
          id: lobby.id,
          mode: lobby.mode,
          creatorName: lobby.creatorName,
          creatorId: lobby.creatorId,
          playerCount: lobby.players.length,
          maxPlayers: lobby.maxPlayers,
        });
      }
    });
    return open;
  }

  function broadcastLobbyList() {
    const list = getOpenLobbies();
    broadcastToRoom('lobby', {
      type: 'lobby_list',
      lobbies: list,
    });
  }

  function isPlayerInAnyLobby(playerId) {
    let found = false;
    lobbies.forEach((lobby) => {
      if (lobby.players.some(p => p.id === playerId)) found = true;
    });
    return found;
  }

  function handleMessage(playerId, msg) {
    const player = players.get(playerId);
    if (!player) return;

    switch (msg.type) {
      case 'enter_lobby_area': {
        broadcastToRoom('museum', { type: 'player_leave', id: playerId }, playerId);
        changeRoom(playerId, 'lobby');
        sendTo(playerId, {
          type: 'lobby_entered',
          lobbies: getOpenLobbies(),
        });
        break;
      }

      case 'leave_lobby_area': {
        // Clean up any lobby they created or are in
        lobbies.forEach((lobby, lobbyId) => {
          if (lobby.creatorId === playerId && lobby.status === 'waiting') {
            // Notify other players in the lobby
            lobby.players.forEach(p => {
              if (p.id !== playerId) {
                sendTo(p.id, { type: 'lobby_cancelled' });
              }
            });
            lobbies.delete(lobbyId);
          } else if (lobby.status === 'waiting') {
            // Remove player from lobby they joined
            const idx = lobby.players.findIndex(p => p.id === playerId);
            if (idx !== -1) {
              lobby.players.splice(idx, 1);
              // Notify remaining players
              lobby.players.forEach(p => {
                sendTo(p.id, { type: 'lobby_player_left', playerId, players: lobby.players });
              });
            }
          }
        });
        changeRoom(playerId, 'museum');
        sendTo(playerId, {
          type: 'returned_to_museum',
          players: getMuseumPlayers(),
        });
        broadcastToRoom('museum', { type: 'player_join', player: player.state }, playerId);
        broadcastLobbyList();
        break;
      }

      case 'create_lobby': {
        if (isPlayerInAnyLobby(playerId)) {
          sendTo(playerId, { type: 'lobby_error', message: 'You are already in a lobby' });
          break;
        }

        const mode = msg.mode === '2v2' ? '2v2' : '1v1';
        const isPrivate = !!msg.isPrivate;
        const maxPlayers = mode === '2v2' ? 4 : 2;
        const lobbyId = nextLobbyId++;
        const code = isPrivate ? generateLobbyCode() : null;

        let creatorTeam = 1;
        if (mode === '2v2' && (msg.team === 1 || msg.team === 2)) {
          creatorTeam = msg.team;
        }

        const lobby = {
          id: lobbyId,
          mode,
          isPrivate,
          code,
          creatorId: playerId,
          creatorName: player.state.name,
          players: [{ id: playerId, name: player.state.name, team: creatorTeam }],
          maxPlayers,
          status: 'waiting',
          matchCreated: false,
        };
        lobbies.set(lobbyId, lobby);

        sendTo(playerId, {
          type: 'lobby_created',
          lobbyId,
          mode,
          isPrivate,
          code,
          maxPlayers,
          players: lobby.players,
        });

        broadcastLobbyList();
        break;
      }

      case 'join_lobby': {
        const lobbyId = msg.lobbyId;
        const lobby = lobbies.get(lobbyId);
        if (!lobby) {
          sendTo(playerId, { type: 'lobby_error', message: 'Lobby not found' });
          break;
        }
        if (lobby.status !== 'waiting') {
          sendTo(playerId, { type: 'lobby_error', message: 'Lobby is no longer available' });
          break;
        }
        if (lobby.players.some(p => p.id === playerId)) {
          sendTo(playerId, { type: 'lobby_error', message: 'You are already in this lobby' });
          break;
        }
        if (lobby.players.length >= lobby.maxPlayers) {
          sendTo(playerId, { type: 'lobby_error', message: 'Lobby is full' });
          break;
        }
        if (isPlayerInAnyLobby(playerId)) {
          sendTo(playerId, { type: 'lobby_error', message: 'Leave your current lobby first' });
          break;
        }

        // Assign team for 2v2 — honor preference if slot free, else balance
        let team = 1;
        if (lobby.mode === '2v2') {
          const team1Count = lobby.players.filter(p => p.team === 1).length;
          const team2Count = lobby.players.filter(p => p.team === 2).length;
          const want = (msg.team === 1 || msg.team === 2) ? msg.team : null;
          if (want === 1 && team1Count < 2) team = 1;
          else if (want === 2 && team2Count < 2) team = 2;
          else team = team1Count <= team2Count ? 1 : 2;
        }

        lobby.players.push({ id: playerId, name: player.state.name, team });

        // Notify all lobby players about the update
        lobby.players.forEach(p => {
          sendTo(p.id, {
            type: 'lobby_player_joined',
            lobbyId,
            players: lobby.players,
            mode: lobby.mode,
            maxPlayers: lobby.maxPlayers,
          });
        });

        // Check if lobby is full → start game
        if (lobby.players.length >= lobby.maxPlayers) {
          startGame(lobby);
        }

        broadcastLobbyList();
        break;
      }

      case 'join_private': {
        const code = (msg.code || '').toUpperCase().trim();
        if (!code) {
          sendTo(playerId, { type: 'lobby_error', message: 'Please enter a lobby code' });
          break;
        }
        let foundLobby = null;
        lobbies.forEach(lobby => {
          if (lobby.code === code && lobby.status === 'waiting') foundLobby = lobby;
        });
        if (!foundLobby) {
          sendTo(playerId, { type: 'lobby_error', message: 'Invalid lobby code' });
          break;
        }
        // Re-use join_lobby logic
        handleMessage(playerId, { type: 'join_lobby', lobbyId: foundLobby.id, team: msg.team });
        break;
      }

      case 'cancel_lobby': {
        lobbies.forEach((lobby, lobbyId) => {
          if (lobby.creatorId === playerId && lobby.status === 'waiting') {
            // Notify other players
            lobby.players.forEach(p => {
              if (p.id !== playerId) {
                sendTo(p.id, { type: 'lobby_cancelled' });
              }
            });
            lobbies.delete(lobbyId);
          }
        });
        sendTo(playerId, { type: 'lobby_cancelled' });
        broadcastLobbyList();
        break;
      }

      case 'leave_current_lobby': {
        lobbies.forEach((lobby, lobbyId) => {
          if (lobby.status !== 'waiting') return;
          const idx = lobby.players.findIndex(p => p.id === playerId);
          if (idx === -1) return;

          if (lobby.creatorId === playerId) {
            // Creator leaving = destroy lobby
            lobby.players.forEach(p => {
              if (p.id !== playerId) sendTo(p.id, { type: 'lobby_cancelled' });
            });
            lobbies.delete(lobbyId);
          } else {
            lobby.players.splice(idx, 1);
            lobby.players.forEach(p => {
              sendTo(p.id, { type: 'lobby_player_left', playerId, players: lobby.players });
            });
          }
        });
        sendTo(playerId, { type: 'lobby_cancelled' });
        broadcastLobbyList();
        break;
      }

      case 'update': {
        const p = player.state;
        if (typeof msg.x === 'number' && Number.isFinite(msg.x)) p.x = Math.max(-200, Math.min(200, msg.x));
        if (typeof msg.y === 'number' && Number.isFinite(msg.y)) p.y = Math.max(-20, Math.min(50, msg.y));
        if (typeof msg.z === 'number' && Number.isFinite(msg.z)) p.z = Math.max(-200, Math.min(200, msg.z));
        if (typeof msg.yaw === 'number' && Number.isFinite(msg.yaw)) p.yaw = Math.max(-Math.PI * 2, Math.min(Math.PI * 2, msg.yaw));
        if (typeof msg.pitch === 'number' && Number.isFinite(msg.pitch)) p.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, msg.pitch));
        break;
      }
    }
  }

  function startGame(lobby) {
    lobby.status = 'in_game';

    if (lobby.mode === '1v1') {
      // Classic 1v1
      const p1 = lobby.players[0];
      const p2 = lobby.players[1];
      sendTo(p1.id, {
        type: 'game_starting',
        lobbyId: lobby.id,
        mode: '1v1',
        opponentName: p2.name,
        opponentId: p2.id,
        role: 'creator',
      });
      sendTo(p2.id, {
        type: 'game_starting',
        lobbyId: lobby.id,
        mode: '1v1',
        opponentName: p1.name,
        opponentId: p1.id,
        role: 'guest',
      });
    } else if (lobby.mode === '2v2') {
      const team1 = lobby.players.filter(p => p.team === 1);
      const team2 = lobby.players.filter(p => p.team === 2);
      // Send game_starting to all 4 players with team info
      lobby.players.forEach(p => {
        const myTeam = p.team;
        const teammate = lobby.players.find(t => t.team === myTeam && t.id !== p.id);
        const enemies = lobby.players.filter(t => t.team !== myTeam);
        sendTo(p.id, {
          type: 'game_starting',
          lobbyId: lobby.id,
          mode: '2v2',
          team: myTeam,
          teammateName: teammate ? teammate.name : null,
          teammateId: teammate ? teammate.id : null,
          enemies: enemies.map(e => ({ id: e.id, name: e.name })),
          allPlayers: lobby.players,
          role: p.id === lobby.creatorId ? 'creator' : 'guest',
        });
      });
    }

    broadcastLobbyList();
  }

  function handleDisconnect(playerId) {
    // Match loading (game_starting sent but createMatch not yet run) — cancel for everyone
    const cancelLoadIds = [];
    lobbies.forEach((lobby, lobbyId) => {
      if (lobby.status === 'in_game' && !lobby.matchCreated) {
        const idx = lobby.players.findIndex(p => p.id === playerId);
        if (idx !== -1) cancelLoadIds.push(lobbyId);
      }
    });
    cancelLoadIds.forEach((lobbyId) => {
      const lobby = lobbies.get(lobbyId);
      if (!lobby) return;
      lobby.players.forEach(p => {
        if (p.id !== playerId) sendTo(p.id, { type: 'lobby_cancelled' });
      });
      lobbies.delete(lobbyId);
    });

    lobbies.forEach((lobby, lobbyId) => {
      if (lobby.status === 'waiting') {
        if (lobby.creatorId === playerId) {
          lobby.players.forEach(p => {
            if (p.id !== playerId) sendTo(p.id, { type: 'lobby_cancelled' });
          });
          lobbies.delete(lobbyId);
        } else {
          const idx = lobby.players.findIndex(p => p.id === playerId);
          if (idx !== -1) {
            lobby.players.splice(idx, 1);
            lobby.players.forEach(p => {
              sendTo(p.id, { type: 'lobby_player_left', playerId, players: lobby.players });
            });
          }
        }
      }
    });
    broadcastLobbyList();
  }

  function removeLobby(lobbyId) {
    lobbies.delete(lobbyId);
    broadcastLobbyList();
  }

  return { handleMessage, handleDisconnect, removeLobby, lobbies };
}

export { setupLobbyManager };
