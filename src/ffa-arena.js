import * as THREE from 'three';
import { ws } from './multiplayer.js';
import { playerPos, yaw, pitch, activeSlot, isSwinging } from './player.js';

// ─── FFA ARENA STATE ────────────────────────────────────────────────
let inFFA = false;
let ffaPhase = 'waiting'; // waiting | queue | countdown | fighting | match_end
let ffaGroup = null;
let scene = null;
let matchId = null;
let onFFAEnd = null;
let myHp = 100;
let allPlayers = []; // [{id, name}]
let alivePlayers = new Set();
let ffaResult = null;

// Remote player models in FFA
const ffaModels = new Map(); // playerId -> { group, head, body, ... }
const ffaTargetPos = new Map();
const ffaTargetYaw = new Map();
const ffaSwingTimes = new Map();
const ffaWalkPhases = new Map();

// Hearts
const heartMeshes = new Map();

const FFA_ARENA_SIZE = 60;

export function isInFFA() { return inFFA; }
export function getFFAPhase() { return ffaPhase; }

export function setFFAScene(s) { scene = s; }

// ─── BUILD FFA ARENA ────────────────────────────────────────────────
function buildFFAArena() {
  if (ffaGroup) {
    scene.remove(ffaGroup);
    ffaGroup = null;
  }
  ffaGroup = new THREE.Group();

  const HALF = FFA_ARENA_SIZE / 2;

  // Floor
  const floorGeo = new THREE.BoxGeometry(FFA_ARENA_SIZE, 0.5, FFA_ARENA_SIZE);
  const floorMat = new THREE.MeshLambertMaterial({ color: 0x2a2a3a });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.set(0, -0.25, 0);
  floor.receiveShadow = true;
  ffaGroup.add(floor);

  // Grid lines
  const gridMat = new THREE.MeshBasicMaterial({ color: 0x3a3a5a });
  for (let i = -HALF; i <= HALF; i += 5) {
    const lineH = new THREE.Mesh(new THREE.BoxGeometry(FFA_ARENA_SIZE, 0.02, 0.05), gridMat);
    lineH.position.set(0, 0.01, i);
    ffaGroup.add(lineH);
    const lineV = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, FFA_ARENA_SIZE), gridMat);
    lineV.position.set(i, 0.01, 0);
    ffaGroup.add(lineV);
  }

  // Walls (barrier)
  const wallMat = new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.15 });
  const wallHeight = 6;
  // North/South walls
  const wallNS = new THREE.Mesh(new THREE.BoxGeometry(FFA_ARENA_SIZE, wallHeight, 0.3), wallMat);
  wallNS.position.set(0, wallHeight / 2, -HALF);
  ffaGroup.add(wallNS);
  const wallNS2 = wallNS.clone();
  wallNS2.position.z = HALF;
  ffaGroup.add(wallNS2);
  // East/West walls
  const wallEW = new THREE.Mesh(new THREE.BoxGeometry(0.3, wallHeight, FFA_ARENA_SIZE), wallMat);
  wallEW.position.set(-HALF, wallHeight / 2, 0);
  ffaGroup.add(wallEW);
  const wallEW2 = wallEW.clone();
  wallEW2.position.x = HALF;
  ffaGroup.add(wallEW2);

  // Corner pillars with red glow
  const pillarGeo = new THREE.BoxGeometry(1, 8, 1);
  const pillarMat = new THREE.MeshBasicMaterial({ color: 0xff3333 });
  [[-HALF, -HALF], [HALF, -HALF], [-HALF, HALF], [HALF, HALF]].forEach(([x, z]) => {
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(x, 4, z);
    ffaGroup.add(pillar);
    const light = new THREE.PointLight(0xff3333, 1.5, 25);
    light.position.set(x, 6, z);
    ffaGroup.add(light);
  });

  // Overhead lights
  const lightPositions = [[0, 0], [-15, -15], [15, -15], [-15, 15], [15, 15], [0, -20], [0, 20]];
  lightPositions.forEach(([x, z]) => {
    const light = new THREE.PointLight(0xffffff, 1, 40);
    light.position.set(x, 12, z);
    ffaGroup.add(light);
  });

  const ambient = new THREE.AmbientLight(0x443344, 0.8);
  ffaGroup.add(ambient);

  scene.add(ffaGroup);
}

// ─── PLAYER MODELS ──────────────────────────────────────────────────
function createFFAPlayerModel(playerId, playerName) {
  if (ffaModels.has(playerId)) return;

  const group = new THREE.Group();
  const px = 0.0625;

  // Random color per player
  const colors = [0xff4444, 0x44ff44, 0x4488ff, 0xffaa00, 0xff44ff, 0x44ffff, 0xff8844, 0x88ff44];
  const colorIdx = playerId % colors.length;
  const bodyColor = colors[colorIdx];

  // Head
  const headGeo = new THREE.BoxGeometry(8 * px, 8 * px, 8 * px);
  const headMat = new THREE.MeshLambertMaterial({ color: 0xc4986c });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.5 + 4 * px;
  group.add(head);

  // Eyes
  const eyeGeo = new THREE.BoxGeometry(2 * px, 2 * px, 0.5 * px);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-1.5 * px, 1.5 + 5 * px, 4.3 * px);
  group.add(leftEye);
  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(1.5 * px, 1.5 + 5 * px, 4.3 * px);
  group.add(rightEye);

  // Body
  const bodyGeo = new THREE.BoxGeometry(8 * px, 12 * px, 4 * px);
  const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.75 + 6 * px;
  group.add(body);

  // Arms
  const armGeo = new THREE.BoxGeometry(4 * px, 12 * px, 4 * px);
  const armMat = new THREE.MeshLambertMaterial({ color: bodyColor });
  const leftArm = new THREE.Mesh(armGeo, armMat);
  leftArm.position.set(-6 * px, 0.75 + 6 * px, 0);
  group.add(leftArm);
  const rightArm = new THREE.Mesh(armGeo, armMat.clone());
  rightArm.position.set(6 * px, 0.75 + 6 * px, 0);
  group.add(rightArm);

  // Sword on left arm
  const swordGroup = new THREE.Group();
  const swordImg = new Image();
  swordImg.crossOrigin = 'anonymous';
  swordImg.onload = () => {
    const tex = new THREE.Texture(swordImg);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    const swordMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide });
    const swordPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.14, 1.63), swordMat);
    swordGroup.add(swordPlane);
  };
  swordImg.src = 'assets/Sprite-0001.png';
  swordGroup.position.set(-0.082, -0.176, 0.287);
  swordGroup.rotation.set(0.21, 1.06, -0.2);
  leftArm.add(swordGroup);

  // Legs
  const legGeo = new THREE.BoxGeometry(4 * px, 12 * px, 4 * px);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x333350 });
  const leftLeg = new THREE.Mesh(legGeo, legMat);
  leftLeg.position.set(-2 * px, 6 * px, 0);
  group.add(leftLeg);
  const rightLeg = new THREE.Mesh(legGeo, legMat.clone());
  rightLeg.position.set(2 * px, 6 * px, 0);
  group.add(rightLeg);

  // Name label
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 48;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 8, 256, 32);
  ctx.fillStyle = '#' + bodyColor.toString(16).padStart(6, '0');
  ctx.font = 'bold 22px Courier New';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(playerName, 128, 24);
  const labelTex = new THREE.CanvasTexture(canvas);
  labelTex.magFilter = THREE.NearestFilter;
  const labelGeo = new THREE.PlaneGeometry(1.6, 0.3);
  const labelMeshMat = new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, depthTest: false });
  const nameLabel = new THREE.Mesh(labelGeo, labelMeshMat);
  nameLabel.position.set(0, 2.2, 0);
  nameLabel.renderOrder = 999;
  group.add(nameLabel);

  const model = { group, head, body, leftArm, rightArm, leftLeg, rightLeg, nameLabel, swordGroup };
  ffaModels.set(playerId, model);
  ffaTargetPos.set(playerId, new THREE.Vector3());
  ffaTargetYaw.set(playerId, 0);
  ffaSwingTimes.set(playerId, 0);
  ffaWalkPhases.set(playerId, 0);
  ffaGroup.add(group);
}

function removeFFAPlayerModel(playerId) {
  const model = ffaModels.get(playerId);
  if (model && ffaGroup) {
    ffaGroup.remove(model.group);
  }
  ffaModels.delete(playerId);
  ffaTargetPos.delete(playerId);
  ffaTargetYaw.delete(playerId);
  ffaSwingTimes.delete(playerId);
  ffaWalkPhases.delete(playerId);
}

// ─── ENTER / EXIT FFA ───────────────────────────────────────────────
export function enterFFA(setupData, endCallback) {
  matchId = setupData.matchId;
  allPlayers = setupData.allPlayers || [];
  alivePlayers = new Set(allPlayers.map(p => p.id));
  onFFAEnd = endCallback;
  inFFA = true;
  ffaPhase = 'countdown';
  myHp = 100;
  ffaResult = null;
  heartMeshes.clear();

  buildFFAArena();

  // Set spawn position
  playerPos.set(setupData.spawnX, 1.7, setupData.spawnZ);

  // Create models for other players
  allPlayers.forEach(p => {
    if (p.id !== setupData.myId) {
      createFFAPlayerModel(p.id, p.name);
    }
  });

  // Show FFA HUD
  showFFAHUD();
  updateFFAHPBar();
  updateAliveCount();
}

export function exitFFA() {
  inFFA = false;
  ffaPhase = 'waiting';
  if (ffaGroup) {
    scene.remove(ffaGroup);
    ffaGroup = null;
  }
  ffaModels.clear();
  ffaTargetPos.clear();
  ffaTargetYaw.clear();
  ffaSwingTimes.clear();
  ffaWalkPhases.clear();
  heartMeshes.clear();
  hideFFAHUD();
}

// ─── HANDLE SERVER MESSAGES ─────────────────────────────────────────
export function handleFFAMessage(msg) {
  switch (msg.type) {
    case 'ffa_arena_setup': {
      // Setup received — enterFFA is called from main.js
      break;
    }

    case 'countdown_tick': {
      ffaPhase = 'countdown';
      updateFFACountdown(msg.time);
      break;
    }

    case 'ffa_round_start': {
      ffaPhase = 'fighting';
      hideFFACountdown();
      break;
    }

    case 'player_update': {
      const tp = ffaTargetPos.get(msg.id);
      if (tp) {
        tp.set(msg.x, (msg.y || 1.7) - 1.7, msg.z);
        ffaTargetYaw.set(msg.id, msg.yaw);
      }
      break;
    }

    case 'player_swing': {
      ffaSwingTimes.set(msg.id, 0.5);
      break;
    }

    case 'hit': {
      if (msg.defenderId !== msg.attackerId) {
        // Check if I'm the defender
        const myId = allPlayers.find(p => ffaModels.has(p.id) === false)?.id;
        if (msg.defenderId === myId || (!ffaModels.has(msg.defenderId) && allPlayers.length > 0)) {
          myHp = msg.defenderHp;
          flashFFADamage();
        }
        updateFFAHPBar();
      }
      break;
    }

    case 'heart_spawn': {
      spawnFFAHeart(msg.heart);
      break;
    }

    case 'heart_picked_up': {
      removeFFAHeart(msg.heartId);
      // Check if it's me
      if (!ffaModels.has(msg.playerId)) {
        myHp = msg.hp;
      }
      updateFFAHPBar();
      break;
    }

    case 'ffa_player_eliminated': {
      alivePlayers.delete(msg.playerId);
      updateAliveCount();
      // Show elimination notification
      showEliminationNotif(msg.eliminatedName, msg.killerName);
      // Remove model if it exists
      if (ffaModels.has(msg.playerId)) {
        // Fade out model
        const model = ffaModels.get(msg.playerId);
        if (model) model.group.visible = false;
      } else {
        // I was eliminated
        ffaPhase = 'spectating';
        showEliminatedOverlay();
      }
      break;
    }

    case 'ffa_match_end': {
      ffaPhase = 'match_end';
      ffaResult = msg;
      showFFAMatchEnd(msg);
      break;
    }

    case 'returned_to_museum': {
      if (inFFA) {
        exitFFA();
        if (onFFAEnd) onFFAEnd(ffaResult);
      }
      break;
    }
  }
}

// ─── SEND POSITION ──────────────────────────────────────────────────
let lastFFASendTime = 0;
const FFA_SEND_RATE = 50;

export function sendFFAPositionUpdate() {
  if (!ws || ws.readyState !== 1 || !inFFA) return;
  const now = performance.now();
  if (now - lastFFASendTime < FFA_SEND_RATE) return;
  lastFFASendTime = now;

  ws.send(JSON.stringify({
    type: 'update',
    x: playerPos.x, y: playerPos.y, z: playerPos.z,
    yaw, pitch, activeSlot, isSwinging,
  }));
}

export function sendFFASwing() {
  if (!ws || ws.readyState !== 1 || !inFFA) return;
  ws.send(JSON.stringify({ type: 'swing' }));
}

// ─── HEARTS ─────────────────────────────────────────────────────────
function spawnFFAHeart(heart) {
  const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(heart.x, 0.5, heart.z);
  mesh.userData = { id: heart.id, phase: Math.random() * Math.PI * 2 };
  ffaGroup.add(mesh);
  heartMeshes.set(heart.id, mesh);
}

function removeFFAHeart(heartId) {
  const mesh = heartMeshes.get(heartId);
  if (mesh && ffaGroup) {
    ffaGroup.remove(mesh);
    heartMeshes.delete(heartId);
  }
}

// ─── FFA ANIMATION (each frame) ─────────────────────────────────────
export function updateFFAScene(delta, time, camera) {
  if (!inFFA || !ffaGroup) return;

  const lerpFactor = Math.min(1, delta * 12);

  ffaModels.forEach((model, pid) => {
    const tp = ffaTargetPos.get(pid);
    if (!tp) return;

    const group = model.group;
    if (!group.visible) return;

    const prevX = group.position.x;
    const prevZ = group.position.z;

    group.position.x += (tp.x - group.position.x) * lerpFactor;
    group.position.y += (tp.y - group.position.y) * lerpFactor;
    group.position.z += (tp.z - group.position.z) * lerpFactor;

    const dx = group.position.x - prevX;
    const dz = group.position.z - prevZ;
    const speed = delta > 0 ? Math.sqrt(dx * dx + dz * dz) / delta : 0;

    // Rotation
    const targetRotY = -(ffaTargetYaw.get(pid) || 0) + Math.PI;
    let rotDiff = targetRotY - group.rotation.y;
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    group.rotation.y += rotDiff * lerpFactor;

    // Walk animation
    let wp = ffaWalkPhases.get(pid) || 0;
    if (speed > 0.5) {
      wp += delta * speed * 2;
      ffaWalkPhases.set(pid, wp);
      const swing = Math.sin(wp) * 0.6;
      model.leftArm.rotation.x = swing;
      model.rightArm.rotation.x = -swing;
      model.leftLeg.rotation.x = -swing;
      model.rightLeg.rotation.x = swing;
    } else {
      model.leftArm.rotation.x *= 0.9;
      model.rightArm.rotation.x *= 0.9;
      model.leftLeg.rotation.x *= 0.9;
      model.rightLeg.rotation.x *= 0.9;
    }

    // Swing animation
    let st = ffaSwingTimes.get(pid) || 0;
    if (st > 0) {
      st -= delta * 2;
      ffaSwingTimes.set(pid, st);
      model.leftArm.rotation.x = Math.sin(st * Math.PI * 2) * 1.2;
    }

    // Billboard name
    if (model.nameLabel && camera) {
      model.nameLabel.lookAt(camera.position);
    }
  });

  // Animate hearts
  heartMeshes.forEach(mesh => {
    mesh.rotation.y = time * 2;
    mesh.position.y = 0.5 + Math.sin(time * 3 + mesh.userData.phase) * 0.15;
  });

  // Arena bounds
  if (ffaPhase === 'fighting' || ffaPhase === 'spectating') {
    const HALF = FFA_ARENA_SIZE / 2 - 0.5;
    playerPos.x = Math.max(-HALF, Math.min(HALF, playerPos.x));
    playerPos.z = Math.max(-HALF, Math.min(HALF, playerPos.z));
  }
}

// ─── FFA HUD ────────────────────────────────────────────────────────
function showFFAHUD() {
  const hud = document.getElementById('ffa-hud');
  if (hud) hud.style.display = 'block';
}

function hideFFAHUD() {
  const hud = document.getElementById('ffa-hud');
  if (hud) hud.style.display = 'none';
  const overlay = document.getElementById('ffa-overlay');
  if (overlay) overlay.style.display = 'none';
  hideFFACountdown();
}

function updateFFAHPBar() {
  const bar = document.getElementById('ffa-hp-bar');
  const text = document.getElementById('ffa-hp-text');
  if (bar) {
    bar.style.width = myHp + '%';
    bar.style.background = myHp > 50 ? '#00cc44' : myHp > 25 ? '#ffaa00' : '#ff3333';
  }
  if (text) text.textContent = Math.round(myHp) + '%';
}

function updateAliveCount() {
  const el = document.getElementById('ffa-alive-count');
  if (el) el.textContent = `${alivePlayers.size} / ${allPlayers.length} Alive`;
}

function updateFFACountdown(value) {
  const el = document.getElementById('ffa-countdown');
  if (el) {
    el.style.display = 'block';
    el.textContent = value;
  }
}

function hideFFACountdown() {
  const el = document.getElementById('ffa-countdown');
  if (el) el.style.display = 'none';
}

function flashFFADamage() {
  const el = document.getElementById('damage-flash');
  if (el) {
    el.style.opacity = '0.4';
    setTimeout(() => { el.style.opacity = '0'; }, 150);
  }
}

function showEliminationNotif(eliminatedName, killerName) {
  const el = document.getElementById('ffa-kill-feed');
  if (!el) return;
  const line = document.createElement('div');
  line.className = 'ffa-kill-line';
  line.innerHTML = killerName
    ? `<span style="color:#ff4444">${killerName}</span> eliminated <span style="color:#888">${eliminatedName}</span>`
    : `<span style="color:#888">${eliminatedName}</span> disconnected`;
  el.appendChild(line);
  setTimeout(() => { if (line.parentNode) line.parentNode.removeChild(line); }, 5000);
}

function showEliminatedOverlay() {
  const overlay = document.getElementById('ffa-overlay');
  if (overlay) {
    overlay.style.display = 'flex';
    overlay.innerHTML = '<div class="combat-splash lose">ELIMINATED!</div>';
  }
}

function showFFAMatchEnd(data) {
  const overlay = document.getElementById('ffa-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';

  let html = `<div class="combat-splash ${data.winnerId && !ffaModels.has(data.winnerId) ? 'win' : 'lose'}">
    ${data.winnerId && !ffaModels.has(data.winnerId) ? 'VICTORY ROYALE!' : `${data.winnerName} WINS!`}
  </div>
  <div class="ffa-placements">`;

  (data.placements || []).forEach(p => {
    const medal = p.placement <= 3 ? ['🥇', '🥈', '🥉'][p.placement - 1] : `#${p.placement}`;
    html += `<div class="ffa-placement-row">
      <span class="ffa-place">${medal}</span>
      <span class="ffa-pname">${p.name}</span>
      <span class="ffa-kills">${p.kills} kills</span>
    </div>`;
  });

  html += '</div><div style="color:#888;margin-top:12px;">Returning to museum...</div>';
  overlay.innerHTML = html;
}
