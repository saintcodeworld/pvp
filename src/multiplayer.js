import * as THREE from 'three';
import { playerPos, yaw, pitch, activeSlot, isSwinging } from './player.js';

// ─── MULTIPLAYER STATE ──────────────────────────────────────────────
export let ws = null;
export let myPlayerId = null;
export let myPlayerName = 'Player';
export let myPlayerColor = '#ff4444';
export const remotePlayers = new Map();
export let onlineCount = 1;

let lastSendTime = 0;
const SEND_RATE = 50;
let camera;
let externalMessageHandler = null;

export function setExternalMessageHandler(handler) {
  externalMessageHandler = handler;
}

export function setMultiplayerCamera(cam) {
  camera = cam;
}

export function getMyId() { return myPlayerId; }

export function setMyPlayerName(name) {
  myPlayerName = name;
}

/** Ask server for museum room roster — keeps “Players online” accurate */
export function requestMuseumPlayerResync() {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'resync' }));
  }
}

// ─── CONNECT ────────────────────────────────────────────────────────
// Vite dev (port 5173) proxies only `/ws` → game server (vite.config.js).
// Connecting to `ws://host/` hits the dev server, not the multiplayer backend.
export function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${location.host}/ws`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[MP] Connected to server');
    addChatMessage(null, 'Connected to multiplayer server', true);
    if (myPlayerName && myPlayerName !== 'Player') {
      ws.send(JSON.stringify({ type: 'set_name', name: myPlayerName }));
    }
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleServerMessage(msg);
    } catch (e) {
      // Ignore
    }
  };

  ws.onclose = () => {
    console.log('[MP] Disconnected');
    addChatMessage(null, 'Disconnected from server. Reconnecting...', true);
    remotePlayers.forEach((rp, id) => removeRemotePlayer(id));
    remotePlayers.clear();
    onlineCount = 1;
    updatePlayerCount();
    setTimeout(() => connectWebSocket(), 3000);
  };

  ws.onerror = () => {};
}

// ─── MESSAGE HANDLER ────────────────────────────────────────────────
function handleServerMessage(msg) {
  // Forward to external handler first (for lobby/arena routing)
  if (externalMessageHandler) {
    externalMessageHandler(msg);
  }

  switch (msg.type) {
    case 'init': {
      myPlayerId = msg.id;
      myPlayerColor = msg.color;
      onlineCount = msg.players.length;
      updatePlayerCount();
      msg.players.forEach(p => {
        if (p.id !== myPlayerId) {
          createRemotePlayer(p);
        }
      });
      break;
    }

    case 'player_join': {
      if (msg.player.id !== myPlayerId) {
        createRemotePlayer(msg.player);
        onlineCount++;
        updatePlayerCount();
        addChatMessage(null, `${msg.player.name} joined the museum`, true);
      }
      break;
    }

    case 'player_leave': {
      if (msg.id !== myPlayerId) {
        const rp = remotePlayers.get(msg.id);
        const name = rp ? rp.data.name : 'Player ' + msg.id;
        removeRemotePlayer(msg.id);
        remotePlayers.delete(msg.id);
        onlineCount = Math.max(1, onlineCount - 1);
        updatePlayerCount();
        addChatMessage(null, `${name} left the museum`, true);
      }
      break;
    }

    case 'player_update': {
      const rp = remotePlayers.get(msg.id);
      if (rp) {
        rp.targetPos = new THREE.Vector3(msg.x, msg.y, msg.z);
        rp.targetYaw = msg.yaw;
        rp.targetPitch = msg.pitch;
        rp.data.activeSlot = msg.activeSlot;
        rp.data.isSwinging = msg.isSwinging;
      }
      break;
    }

    case 'player_name': {
      const rp = remotePlayers.get(msg.id);
      if (rp) {
        rp.data.name = msg.name;
        updateRemotePlayerLabel(rp);
      }
      break;
    }

    case 'player_swing': {
      const rp = remotePlayers.get(msg.id);
      if (rp) {
        triggerRemoteSwing(rp);
      }
      break;
    }

    case 'chat': {
      addChatMessage(msg.name, msg.text, false);
      break;
    }

    case 'pong': {
      // Server keepalive response — no action needed
      break;
    }

    case 'resync': {
      // Server sent a fresh player list — rebuild remote players
      if (msg.players) {
        // Remove remote players no longer in the list
        const serverIds = new Set(msg.players.map(p => p.id));
        remotePlayers.forEach((rp, id) => {
          if (!serverIds.has(id)) {
            removeRemotePlayer(id);
            remotePlayers.delete(id);
          }
        });
        // Add or update players from server
        msg.players.forEach(p => {
          if (p.id === myPlayerId) return;
          if (!remotePlayers.has(p.id)) {
            createRemotePlayer(p);
          } else {
            const rp = remotePlayers.get(p.id);
            rp.targetPos.set(p.x, p.y, p.z);
            rp.targetYaw = p.yaw || 0;
            rp.data.name = p.name;
            rp.data.activeSlot = p.activeSlot;
            updateRemotePlayerLabel(rp);
          }
        });
        onlineCount = msg.players.length;
        updatePlayerCount();
      }
      break;
    }
  }
}

// ─── SEND FUNCTIONS ─────────────────────────────────────────────────
export function sendPositionUpdate() {
  if (!ws || ws.readyState !== 1) return;
  const now = performance.now();
  if (now - lastSendTime < SEND_RATE) return;
  lastSendTime = now;

  ws.send(JSON.stringify({
    type: 'update',
    x: playerPos.x,
    y: playerPos.y,
    z: playerPos.z,
    yaw: yaw,
    pitch: pitch,
    activeSlot: activeSlot,
    isSwinging: isSwinging,
  }));
}

export function sendSwing() {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: 'swing' }));
}

// ─── REMOTE PLAYER 3D MODEL ────────────────────────────────────────
let scene;
export function setMultiplayerScene(s) { scene = s; }

function makePlayerTexture(baseR, baseG, baseB, variation = 8) {
  const canvas = document.createElement('canvas');
  canvas.width = 8; canvas.height = 8;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const v = (Math.random() - 0.5) * variation;
      ctx.fillStyle = `rgb(${(baseR+v)|0},${(baseG+v)|0},${(baseB+v)|0})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function createRemotePlayer(data) {
  if (remotePlayers.has(data.id)) return;

  const group = new THREE.Group();
  const color = hexToRgb(data.color || '#ff4444');
  const px = 0.0625;

  const headGeo = new THREE.BoxGeometry(8 * px, 8 * px, 8 * px);
  const skinTex = makePlayerTexture(196, 152, 108);
  const headMat = new THREE.MeshLambertMaterial({ map: skinTex });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.5 + 4 * px;
  head.castShadow = true;
  group.add(head);

  const eyeGeo = new THREE.BoxGeometry(2 * px, 2 * px, 0.5 * px);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-1.5 * px, 1.5 + 5 * px, 4.3 * px);
  group.add(leftEye);
  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(1.5 * px, 1.5 + 5 * px, 4.3 * px);
  group.add(rightEye);

  const bodyGeo = new THREE.BoxGeometry(8 * px, 12 * px, 4 * px);
  const shirtTex = makePlayerTexture(color.r, color.g, color.b);
  const bodyMat = new THREE.MeshLambertMaterial({ map: shirtTex });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.75 + 6 * px;
  body.castShadow = true;
  group.add(body);

  const armGeo = new THREE.BoxGeometry(4 * px, 12 * px, 4 * px);
  const armMat = new THREE.MeshLambertMaterial({ map: makePlayerTexture(color.r * 0.8, color.g * 0.8, color.b * 0.8) });
  const leftArm = new THREE.Mesh(armGeo, armMat);
  leftArm.position.set(-6 * px, 0.75 + 6 * px, 0);
  leftArm.castShadow = true;
  group.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, armMat.clone());
  rightArm.position.set(6 * px, 0.75 + 6 * px, 0);
  rightArm.castShadow = true;
  group.add(rightArm);

  const heldSword = createRemoteSwordSprite();
  heldSword.position.set(-0.0820, -0.1760, 0.2870);
  heldSword.rotation.set(0.210, 1.060, -0.200);
  heldSword.visible = (data.activeSlot === 1);
  leftArm.add(heldSword);

  const legGeo = new THREE.BoxGeometry(4 * px, 12 * px, 4 * px);
  const legTex = makePlayerTexture(50, 50, 80);
  const legMat = new THREE.MeshLambertMaterial({ map: legTex });
  const leftLeg = new THREE.Mesh(legGeo, legMat);
  leftLeg.position.set(-2 * px, 6 * px, 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, legMat.clone());
  rightLeg.position.set(2 * px, 6 * px, 0);
  rightLeg.castShadow = true;
  group.add(rightLeg);

  group.position.set(data.x || 0, (data.y || 2.7) - 1.7, data.z || -28);
  scene.add(group);

  const nameLabel = createPlayerNameLabel(data.name || ('Player ' + data.id), data.color || '#ff4444');
  nameLabel.position.set(0, 2.2, 0);
  group.add(nameLabel);

  const rpObj = {
    group,
    head,
    body,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    heldSword,
    nameLabel,
    data: { ...data },
    targetPos: new THREE.Vector3(data.x || 0, data.y || 2.7, data.z || -28),
    targetYaw: data.yaw || 0,
    targetPitch: data.pitch || 0,
    swingTime: 0,
    walkPhase: 0,
  };

  remotePlayers.set(data.id, rpObj);
}

function createPlayerNameLabel(name, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 48;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 8, 256, 32);
  ctx.fillStyle = color || '#f5a623';
  ctx.font = 'bold 22px Courier New';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 128, 24);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  const geo = new THREE.PlaneGeometry(1.6, 0.3);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 999;
  return mesh;
}

function updateRemotePlayerLabel(rp) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 48;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 8, 256, 32);
  ctx.fillStyle = rp.data.color || '#f5a623';
  ctx.font = 'bold 22px Courier New';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(rp.data.name, 128, 24);
  rp.nameLabel.material.map = new THREE.CanvasTexture(canvas);
  rp.nameLabel.material.map.magFilter = THREE.NearestFilter;
  rp.nameLabel.material.map.needsUpdate = true;
}

function removeRemotePlayer(id) {
  const rp = remotePlayers.get(id);
  if (!rp) return;
  scene.remove(rp.group);
  rp.group.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (child.material.map) child.material.map.dispose();
      child.material.dispose();
    }
  });
}

function createRemoteSwordSprite() {
  const group = new THREE.Group();

  const swordImg = new Image();
  swordImg.crossOrigin = 'anonymous';
  swordImg.onload = () => {
    const tex = new THREE.Texture(swordImg);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;

    const swordMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
    });
    const swordPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.140, 1.630), swordMat);
    group.add(swordPlane);
  };
  swordImg.src = 'assets/Sprite-0001.png';

  return group;
}

function triggerRemoteSwing(rp) {
  rp.swingTime = 0.5;
}

export function hideRemotePlayers() {
  remotePlayers.forEach(rp => { rp.group.visible = false; });
}

export function showRemotePlayers() {
  remotePlayers.forEach(rp => { rp.group.visible = true; });
}

export function updateRemotePlayers(delta, time) {
  remotePlayers.forEach((rp) => {
    const lerpFactor = Math.min(1, delta * 12);
    const currentPos = rp.group.position;
    const targetFeetY = rp.targetPos.y - 1.7;

    const prevX = currentPos.x;
    const prevZ = currentPos.z;

    currentPos.x += (rp.targetPos.x - currentPos.x) * lerpFactor;
    currentPos.y += (targetFeetY - currentPos.y) * lerpFactor;
    currentPos.z += (rp.targetPos.z - currentPos.z) * lerpFactor;

    const dx = currentPos.x - prevX;
    const dz = currentPos.z - prevZ;
    const speed = delta > 0 ? Math.sqrt(dx * dx + dz * dz) / delta : 0;

    const targetRotY = rp.targetYaw + Math.PI;
    let rotDiff = targetRotY - rp.group.rotation.y;
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    rp.group.rotation.y += rotDiff * lerpFactor;

    if (speed > 0.5) {
      rp.walkPhase += delta * speed * 2;
      const swing = Math.sin(rp.walkPhase) * 0.6;
      rp.leftArm.rotation.x = swing;
      rp.rightArm.rotation.x = -swing;
      rp.leftLeg.rotation.x = -swing;
      rp.rightLeg.rotation.x = swing;
    } else {
      rp.leftArm.rotation.x *= 0.9;
      rp.rightArm.rotation.x *= 0.9;
      rp.leftLeg.rotation.x *= 0.9;
      rp.rightLeg.rotation.x *= 0.9;
    }

    if (rp.swingTime > 0) {
      rp.swingTime -= delta * 2;
      const swingCurve = Math.sin(rp.swingTime * Math.PI * 2) * 1.2;
      rp.leftArm.rotation.x = swingCurve;
    }

    if (rp.heldSword) {
      rp.heldSword.visible = (rp.data.activeSlot === 1);
    }

    if (rp.nameLabel && camera) {
      rp.nameLabel.lookAt(camera.position);
    }
  });
}

// ─── CHAT SYSTEM ────────────────────────────────────────────────────
export function addChatMessage(name, text, isSystem) {
  const messagesEl = document.getElementById('chat-messages');
  if (!messagesEl) return;
  const div = document.createElement('div');
  div.className = 'chat-msg' + (isSystem ? ' system' : '');
  if (isSystem) {
    div.textContent = text;
  } else {
    div.innerHTML = `<span class="chat-name">${escapeHtml(name)}</span>: ${escapeHtml(text)}`;
  }
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  while (messagesEl.children.length > 50) {
    messagesEl.removeChild(messagesEl.firstChild);
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function openChat(renderer) {
  const chatInput = document.getElementById('chat-input');
  document.getElementById('chat-input-wrap').style.display = 'block';
  chatInput.value = '';
  chatInput.focus();
  document.exitPointerLock();
}

export function closeChat() {
  document.getElementById('chat-input-wrap').style.display = 'none';
}

export function sendChatMessage(renderer) {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (text && ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'chat', text }));
  }
  input.value = '';
  closeChat();
  if (renderer) renderer.domElement.requestPointerLock();
}

export function updatePlayerCount() {
  const el = document.getElementById('player-count');
  if (el) {
    el.textContent = `Players Online: ${onlineCount}`;
  }
}
