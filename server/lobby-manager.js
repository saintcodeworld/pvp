// ─── LOBBY MANAGER — create/join/list lobbies for PVP Wars ─────────

function setupLobbyManager(players, broadcastToRoom, sendTo) {
  const lobbies = new Map(); // lobbyId -> { id, creatorId, creatorName, guestId, guestName, status }
  let nextLobbyId = 1;

  function getOpenLobbies() {
    const open = [];
    lobbies.forEach((lobby) => {
      if (lobby.status === 'waiting') {
        open.push({
          id: lobby.id,
          creatorName: lobby.creatorName,
          creatorId: lobby.creatorId,
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

  function handleMessage(playerId, msg) {
    const player = players.get(playerId);
    if (!player) return;

    switch (msg.type) {
      case 'enter_lobby_area': {
        // Player teleported from museum to lobby void
        // Remove from museum, add to lobby room
        broadcastToRoom('museum', { type: 'player_leave', id: playerId }, playerId);
        player.room = 'lobby';
        // Send current lobby list
        sendTo(playerId, {
          type: 'lobby_entered',
          lobbies: getOpenLobbies(),
        });
        break;
      }

      case 'leave_lobby_area': {
        // Player going back to museum
        // Clean up any lobby they created
        lobbies.forEach((lobby, lobbyId) => {
          if (lobby.creatorId === playerId && lobby.status === 'waiting') {
            lobbies.delete(lobbyId);
          }
        });
        player.room = 'museum';
        // Notify museum players of rejoin
        const museumPlayers = [];
        players.forEach((p) => {
          if (p.room === 'museum') museumPlayers.push(p.state);
        });
        sendTo(playerId, {
          type: 'returned_to_museum',
          players: museumPlayers,
        });
        broadcastToRoom('museum', { type: 'player_join', player: player.state }, playerId);
        broadcastLobbyList();
        break;
      }

      case 'create_lobby': {
        // Check player isn't already in a lobby
        let alreadyInLobby = false;
        lobbies.forEach((lobby) => {
          if (lobby.creatorId === playerId || lobby.guestId === playerId) {
            alreadyInLobby = true;
          }
        });
        if (alreadyInLobby) {
          sendTo(playerId, { type: 'lobby_error', message: 'You are already in a lobby' });
          break;
        }

        const lobbyId = nextLobbyId++;
        lobbies.set(lobbyId, {
          id: lobbyId,
          creatorId: playerId,
          creatorName: player.state.name,
          guestId: null,
          guestName: null,
          status: 'waiting', // waiting | full | in_game
        });

        sendTo(playerId, {
          type: 'lobby_created',
          lobbyId,
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
        if (lobby.creatorId === playerId) {
          sendTo(playerId, { type: 'lobby_error', message: 'Cannot join your own lobby' });
          break;
        }

        lobby.guestId = playerId;
        lobby.guestName = player.state.name;
        lobby.status = 'in_game';

        // Notify both players that game is starting
        sendTo(lobby.creatorId, {
          type: 'game_starting',
          lobbyId,
          opponentName: lobby.guestName,
          opponentId: lobby.guestId,
          role: 'creator',
        });
        sendTo(lobby.guestId, {
          type: 'game_starting',
          lobbyId,
          opponentName: lobby.creatorName,
          opponentId: lobby.creatorId,
          role: 'guest',
        });

        broadcastLobbyList();
        break;
      }

      case 'cancel_lobby': {
        lobbies.forEach((lobby, lobbyId) => {
          if (lobby.creatorId === playerId && lobby.status === 'waiting') {
            lobbies.delete(lobbyId);
          }
        });
        sendTo(playerId, { type: 'lobby_cancelled' });
        broadcastLobbyList();
        break;
      }

      case 'update': {
        // Position updates while in lobby (for void scene)
        const p = player.state;
        p.x = msg.x;
        p.y = msg.y;
        p.z = msg.z;
        p.yaw = msg.yaw;
        p.pitch = msg.pitch;
        break;
      }
    }
  }

  function handleDisconnect(playerId) {
    // Remove any lobbies created by this player
    lobbies.forEach((lobby, lobbyId) => {
      if (lobby.creatorId === playerId && lobby.status === 'waiting') {
        lobbies.delete(lobbyId);
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
