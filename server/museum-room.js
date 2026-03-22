// ─── MUSEUM ROOM — handles position sync, chat, swings in museum ───

function setupMuseumRoom(players, broadcastToRoom, sendTo) {

  function handleMessage(playerId, msg) {
    const player = players.get(playerId);
    if (!player || player.room !== 'museum') return;

    switch (msg.type) {
      case 'update': {
        const p = player.state;
        p.x = msg.x;
        p.y = msg.y;
        p.z = msg.z;
        p.yaw = msg.yaw;
        p.pitch = msg.pitch;
        p.activeSlot = msg.activeSlot;
        p.isSwinging = msg.isSwinging;

        broadcastToRoom('museum', {
          type: 'player_update',
          id: playerId,
          x: p.x, y: p.y, z: p.z,
          yaw: p.yaw, pitch: p.pitch,
          activeSlot: p.activeSlot,
          isSwinging: p.isSwinging,
        }, playerId);
        break;
      }

      case 'chat': {
        const p = player.state;
        const text = (msg.text || '').substring(0, 200);
        broadcastToRoom('museum', {
          type: 'chat',
          id: playerId,
          name: p.name,
          text,
        });
        break;
      }

      case 'swing': {
        broadcastToRoom('museum', {
          type: 'player_swing',
          id: playerId,
        }, playerId);
        break;
      }
    }
  }

  return { handleMessage };
}

export { setupMuseumRoom };
