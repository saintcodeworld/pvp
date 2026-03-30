// ─── MUSEUM ROOM — handles position sync, chat, swings in museum ───

function setupMuseumRoom(players, broadcastToRoom, sendTo) {
  function numberOr(defaultValue, value, min, max) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return defaultValue;
    if (value < min) return min;
    if (value > max) return max;
    return value;
  }

  function handleMessage(playerId, msg) {
    const player = players.get(playerId);
    if (!player || player.room !== 'museum') return;

    switch (msg.type) {
      case 'update': {
        const p = player.state;
        p.x = numberOr(p.x, msg.x, -200, 200);
        p.y = numberOr(p.y, msg.y, -20, 50);
        p.z = numberOr(p.z, msg.z, -200, 200);
        p.yaw = numberOr(p.yaw, msg.yaw, -Math.PI * 2, Math.PI * 2);
        p.pitch = numberOr(p.pitch, msg.pitch, -Math.PI / 2, Math.PI / 2);
        p.activeSlot = Math.trunc(numberOr(p.activeSlot, msg.activeSlot, 0, 8));
        p.isSwinging = !!msg.isSwinging;

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
        const text = (typeof msg.text === 'string' ? msg.text : '').substring(0, 200);
        if (!text.trim()) break;
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
