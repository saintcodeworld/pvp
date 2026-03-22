import * as THREE from 'three';
import { ws } from './multiplayer.js';
import { playerPos, yaw, pitch, activeSlot, isSwinging } from './player.js';

// ─── ARENA STATE ────────────────────────────────────────────────────
let inArena = false;
let arenaGroup = null;
let scene = null;
let matchId = null;
let opponentId = null;
let opponentName = '';
let myRole = ''; // 'creator' or 'guest'
let onMatchEnd = null;

// Combat state (from server)
let myHp = 100;
let opponentHp = 100;
let currentRound = 1;
let myRoundWins = 0;
let opponentRoundWins = 0;
let phase = 'waiting'; // waiting | countdown | fighting | round_end | match_end
let countdownValue = 5;
let matchResult = null; // { winnerId, loserId, winnerName, loserName }

// Opponent 3D model in arena
let opponentModel = null;
let opponentTargetPos = new THREE.Vector3();
let opponentTargetYaw = 0;
let opponentSwingTime = 0;
let opponentWalkPhase = 0;

// Hearts
const heartMeshes = new Map(); // heartId -> THREE.Mesh

export function isInArena() { return inArena; }
export function getArenaPhase() { return phase; }

export function setArenaScene(s) { scene = s; }

// ─── ARENA CONSTRUCTION ─────────────────────────────────────────────
function buildArena() {
  if (arenaGroup) return;
  arenaGroup = new THREE.Group();
  arenaGroup.visible = false;

  const ARENA_SIZE = 30;
  const HALF = ARENA_SIZE / 2;

  // 30x30 floor
  const floorGeo = new THREE.BoxGeometry(ARENA_SIZE, 0.5, ARENA_SIZE);
  const floorMat = new THREE.MeshLambertMaterial({ color: 0x333344 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.set(0, -0.25, 0);
  floor.receiveShadow = true;
  arenaGroup.add(floor);

  // Floor grid lines
  const gridMat = new THREE.MeshBasicMaterial({ color: 0x4a4a6a });
  for (let i = -HALF; i <= HALF; i += 3) {
    const lineH = new THREE.Mesh(new THREE.BoxGeometry(ARENA_SIZE, 0.02, 0.05), gridMat);
    lineH.position.set(0, 0.01, i);
    arenaGroup.add(lineH);
    const lineV = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, ARENA_SIZE), gridMat);
    lineV.position.set(i, 0.01, 0);
    arenaGroup.add(lineV);
  }

  // Corner pillars with glow
  const pillarGeo = new THREE.BoxGeometry(0.7, 5, 0.7);
  const pillarMat = new THREE.MeshBasicMaterial({ color: 0x9933ff });
  [[-HALF, -HALF], [HALF, -HALF], [-HALF, HALF], [HALF, HALF]].forEach(([x, z]) => {
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(x, 2.5, z);
    arenaGroup.add(pillar);
    const light = new THREE.PointLight(0x9933ff, 1.5, 20);
    light.position.set(x, 4, z);
    arenaGroup.add(light);
  });

  // Overhead lights (multiple for larger arena)
  const overheadPositions = [[0, 0], [-8, -8], [8, -8], [-8, 8], [8, 8]];
  overheadPositions.forEach(([x, z]) => {
    const overheadLight = new THREE.PointLight(0xffffff, 1.2, 30);
    overheadLight.position.set(x, 10, z);
    arenaGroup.add(overheadLight);
  });

  const ambientLight = new THREE.AmbientLight(0x334455, 0.8);
  arenaGroup.add(ambientLight);

  scene.add(arenaGroup);
}

// ─── OPPONENT MODEL ─────────────────────────────────────────────────
function createOpponentModel(color) {
  if (opponentModel) {
    arenaGroup.remove(opponentModel.group);
  }

  const group = new THREE.Group();
  const px = 0.0625;
  const rgb = { r: 255, g: 68, b: 68 }; // default red

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
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xff4444 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.75 + 6 * px;
  group.add(body);

  // Arms
  const armGeo = new THREE.BoxGeometry(4 * px, 12 * px, 4 * px);
  const armMat = new THREE.MeshLambertMaterial({ color: 0xcc3333 });
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
  ctx.fillStyle = '#ff4444';
  ctx.font = 'bold 22px Courier New';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(opponentName, 128, 24);
  const labelTex = new THREE.CanvasTexture(canvas);
  labelTex.magFilter = THREE.NearestFilter;
  const labelGeo = new THREE.PlaneGeometry(1.6, 0.3);
  const labelMeshMat = new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, depthTest: false });
  const nameLabel = new THREE.Mesh(labelGeo, labelMeshMat);
  nameLabel.position.set(0, 2.2, 0);
  nameLabel.renderOrder = 999;
  group.add(nameLabel);

  opponentModel = { group, head, body, leftArm, rightArm, leftLeg, rightLeg, nameLabel, swordGroup };
  arenaGroup.add(group);
}

// ─── ENTER / EXIT ARENA ─────────────────────────────────────────────
export function enterArena(gameData, matchEndCallback) {
  matchId = gameData.lobbyId;
  opponentName = gameData.opponentName;
  opponentId = gameData.opponentId;
  myRole = gameData.role;
  onMatchEnd = matchEndCallback;
  inArena = true;
  phase = 'waiting';
  myHp = 100;
  opponentHp = 100;
  currentRound = 1;
  myRoundWins = 0;
  opponentRoundWins = 0;
  matchResult = null;
  heartMeshes.clear();

  buildArena();
  arenaGroup.visible = true;
  createOpponentModel();

  // Show combat HUD
  showCombatHUD();
  updateHPBars();
  updateRoundDisplay();

  // Tell server we're ready
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'game_ready', lobbyId: matchId }));
  }
}

export function exitArena() {
  inArena = false;
  phase = 'waiting';
  if (arenaGroup) arenaGroup.visible = false;

  // Remove hearts
  heartMeshes.forEach(mesh => {
    arenaGroup.remove(mesh);
  });
  heartMeshes.clear();

  // Remove opponent model
  if (opponentModel) {
    arenaGroup.remove(opponentModel.group);
    opponentModel = null;
  }

  hideCombatHUD();
}

// ─── SPAWN POSITIONS ────────────────────────────────────────────────
export function getSpawnPosition(side) {
  // left side = creator, right side = guest (scaled for 30x30 arena)
  if (side === 'left') return new THREE.Vector3(-10, 1.7, 0);
  return new THREE.Vector3(10, 1.7, 0);
}

// ─── HANDLE SERVER MESSAGES ─────────────────────────────────────────
export function handleArenaMessage(msg) {
  switch (msg.type) {
    case 'arena_setup': {
      matchId = msg.matchId;
      currentRound = msg.round;
      const spawnPos = getSpawnPosition(msg.spawnSide);
      playerPos.set(spawnPos.x, spawnPos.y, spawnPos.z);
      // Set opponent position on other side
      const oppSide = msg.spawnSide === 'left' ? 'right' : 'left';
      const oppSpawn = getSpawnPosition(oppSide);
      opponentTargetPos.set(oppSpawn.x, oppSpawn.y - 1.7, oppSpawn.z);
      if (opponentModel) {
        opponentModel.group.position.copy(opponentTargetPos);
      }
      updateRoundDisplay();
      break;
    }

    case 'countdown_tick': {
      phase = 'countdown';
      countdownValue = msg.time;
      updateCountdownDisplay(msg.time);
      break;
    }

    case 'round_start': {
      phase = 'fighting';
      currentRound = msg.round;
      hideCountdown();
      updateRoundDisplay();
      break;
    }

    case 'player_update': {
      if (msg.id === opponentId && opponentModel) {
        opponentTargetPos.set(msg.x, (msg.y || 1.7) - 1.7, msg.z);
        opponentTargetYaw = msg.yaw;
      }
      break;
    }

    case 'player_swing': {
      if (msg.id === opponentId) {
        opponentSwingTime = 0.5;
      }
      break;
    }

    case 'hit': {
      if (msg.defenderId === opponentId) {
        opponentHp = msg.defenderHp;
        flashOpponentHitColor();
      } else {
        myHp = msg.defenderHp;
        flashDamage();
      }
      updateHPBars();
      break;
    }

    case 'heart_spawn': {
      spawnHeartMesh(msg.heart);
      break;
    }

    case 'heart_picked_up': {
      removeHeartMesh(msg.heartId);
      if (msg.playerId === opponentId) {
        opponentHp = msg.hp;
      } else {
        myHp = msg.hp;
      }
      updateHPBars();
      break;
    }

    case 'round_end': {
      phase = 'round_end';
      if (msg.roundWins) {
        // Determine which wins are mine
        const myId = msg.winnerId === opponentId ? msg.loserId : msg.winnerId;
        myRoundWins = msg.roundWins[myId] || 0;
        opponentRoundWins = msg.roundWins[opponentId] || 0;
      }
      showRoundEndDisplay(msg.winnerId !== opponentId);
      updateRoundDisplay();
      // Clean up hearts
      heartMeshes.forEach(mesh => arenaGroup.remove(mesh));
      heartMeshes.clear();
      break;
    }

    case 'match_end': {
      phase = 'match_end';
      matchResult = msg;
      const iWon = msg.winnerId !== opponentId;
      showMatchEndDisplay(iWon, msg.winnerName, msg.loserName);
      break;
    }

    case 'returned_to_museum': {
      if (inArena) {
        exitArena();
        if (onMatchEnd) onMatchEnd(matchResult);
      }
      break;
    }
  }
}

// ─── SEND POSITION IN ARENA ─────────────────────────────────────────
let lastArenaSendTime = 0;
const ARENA_SEND_RATE = 50;

export function sendArenaPositionUpdate() {
  if (!ws || ws.readyState !== 1 || !inArena) return;
  const now = performance.now();
  if (now - lastArenaSendTime < ARENA_SEND_RATE) return;
  lastArenaSendTime = now;

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

export function sendArenaSwing() {
  if (!ws || ws.readyState !== 1 || !inArena) return;
  ws.send(JSON.stringify({ type: 'swing' }));
}

// ─── HEART MESHES ───────────────────────────────────────────────────
function spawnHeartMesh(heart) {
  const heartGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
  const heartMat = new THREE.MeshBasicMaterial({ color: 0xff3366 });
  const mesh = new THREE.Mesh(heartGeo, heartMat);
  mesh.position.set(heart.x, 0.5, heart.z);
  mesh.userData = { id: heart.id, phase: Math.random() * Math.PI * 2 };
  arenaGroup.add(mesh);
  heartMeshes.set(heart.id, mesh);
}

function removeHeartMesh(heartId) {
  const mesh = heartMeshes.get(heartId);
  if (mesh) {
    arenaGroup.remove(mesh);
    heartMeshes.delete(heartId);
  }
}

// ─── ARENA ANIMATION (call each frame) ──────────────────────────────
export function updateArenaScene(delta, time, camera) {
  if (!inArena || !opponentModel) return;

  // Animate opponent
  const lerpFactor = Math.min(1, delta * 12);
  const group = opponentModel.group;
  const prevX = group.position.x;
  const prevZ = group.position.z;

  group.position.x += (opponentTargetPos.x - group.position.x) * lerpFactor;
  group.position.y += (opponentTargetPos.y - group.position.y) * lerpFactor;
  group.position.z += (opponentTargetPos.z - group.position.z) * lerpFactor;

  const dx = group.position.x - prevX;
  const dz = group.position.z - prevZ;
  const speed = delta > 0 ? Math.sqrt(dx * dx + dz * dz) / delta : 0;

  // Rotate to face direction
  const targetRotY = -opponentTargetYaw + Math.PI;
  let rotDiff = targetRotY - group.rotation.y;
  while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
  while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
  group.rotation.y += rotDiff * lerpFactor;

  // Walk animation
  if (speed > 0.5) {
    opponentWalkPhase += delta * speed * 2;
    const swing = Math.sin(opponentWalkPhase) * 0.6;
    opponentModel.leftArm.rotation.x = swing;
    opponentModel.rightArm.rotation.x = -swing;
    opponentModel.leftLeg.rotation.x = -swing;
    opponentModel.rightLeg.rotation.x = swing;
  } else {
    opponentModel.leftArm.rotation.x *= 0.9;
    opponentModel.rightArm.rotation.x *= 0.9;
    opponentModel.leftLeg.rotation.x *= 0.9;
    opponentModel.rightLeg.rotation.x *= 0.9;
  }

  // Swing animation
  if (opponentSwingTime > 0) {
    opponentSwingTime -= delta * 2;
    const swingCurve = Math.sin(opponentSwingTime * Math.PI * 2) * 1.2;
    opponentModel.leftArm.rotation.x = swingCurve;
  }

  // Billboard name label
  if (opponentModel.nameLabel && camera) {
    opponentModel.nameLabel.lookAt(camera.position);
  }

  // Animate hearts (bob + rotate)
  heartMeshes.forEach(mesh => {
    mesh.rotation.y = time * 2;
    mesh.position.y = 0.5 + Math.sin(time * 3 + mesh.userData.phase) * 0.15;
  });

  // Arena bounds for local player (30x30 arena)
  if (phase === 'fighting') {
    playerPos.x = Math.max(-14.5, Math.min(14.5, playerPos.x));
    playerPos.z = Math.max(-14.5, Math.min(14.5, playerPos.z));
  }
}

// ─── COMBAT HUD ─────────────────────────────────────────────────────
function showCombatHUD() {
  const hud = document.getElementById('combat-hud');
  if (hud) hud.style.display = 'block';
}

function hideCombatHUD() {
  const hud = document.getElementById('combat-hud');
  if (hud) hud.style.display = 'none';
  hideCountdown();
  const overlay = document.getElementById('combat-overlay');
  if (overlay) overlay.style.display = 'none';
}

function updateHPBars() {
  const myBar = document.getElementById('my-hp-bar');
  const oppBar = document.getElementById('opp-hp-bar');
  const myText = document.getElementById('my-hp-text');
  const oppText = document.getElementById('opp-hp-text');

  if (myBar) myBar.style.width = myHp + '%';
  if (oppBar) oppBar.style.width = opponentHp + '%';
  if (myText) myText.textContent = Math.round(myHp) + '%';
  if (oppText) oppText.textContent = Math.round(opponentHp) + '%';

  // Color based on HP
  if (myBar) myBar.style.background = myHp > 50 ? '#00cc44' : myHp > 25 ? '#ffaa00' : '#ff3333';
  if (oppBar) oppBar.style.background = opponentHp > 50 ? '#00cc44' : opponentHp > 25 ? '#ffaa00' : '#ff3333';
}

function updateRoundDisplay() {
  const el = document.getElementById('round-display');
  if (el) el.textContent = `Round ${currentRound} / 3  |  ${myRoundWins} - ${opponentRoundWins}`;
}

function updateCountdownDisplay(value) {
  const el = document.getElementById('combat-countdown');
  if (el) {
    el.style.display = 'block';
    el.textContent = value;
  }
}

function hideCountdown() {
  const el = document.getElementById('combat-countdown');
  if (el) el.style.display = 'none';
}

function showRoundEndDisplay(iWon) {
  const overlay = document.getElementById('combat-overlay');
  if (overlay) {
    overlay.style.display = 'flex';
    overlay.innerHTML = `<div class="combat-splash ${iWon ? 'win' : 'lose'}">${iWon ? 'ROUND WON!' : 'ROUND LOST!'}</div>`;
    setTimeout(() => { overlay.style.display = 'none'; }, 2500);
  }
}

function showMatchEndDisplay(iWon, winnerName, loserName) {
  const overlay = document.getElementById('combat-overlay');
  if (overlay) {
    overlay.style.display = 'flex';
    overlay.innerHTML = `
      <div class="combat-splash ${iWon ? 'win' : 'lose'}">
        ${iWon ? 'VICTORY!' : 'DEFEAT!'}
      </div>
      <div class="combat-result">
        ${winnerName} wins!<br>
        Returning to museum...
      </div>
    `;
  }
}

function flashDamage() {
  const el = document.getElementById('damage-flash');
  if (el) {
    el.style.opacity = '0.4';
    setTimeout(() => { el.style.opacity = '0'; }, 150);
  }
}

// ─── HIT COLOR FLASH ON OPPONENT BODY ──────────────────────────────
const originalColors = {};
let hitFlashActive = false;

function flashOpponentHitColor() {
  if (!opponentModel || hitFlashActive) return;
  hitFlashActive = true;

  const hitColor = new THREE.Color(0xff0000);
  const parts = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];

  // Store originals and set hit color
  parts.forEach(part => {
    const mesh = opponentModel[part];
    if (mesh && mesh.material) {
      if (!originalColors[part]) {
        originalColors[part] = mesh.material.color.getHex();
      }
      mesh.material.color.set(hitColor);
      mesh.material.emissive = new THREE.Color(0xff2222);
      mesh.material.emissiveIntensity = 0.6;
    }
  });

  // Flash white briefly then back to red then restore
  setTimeout(() => {
    parts.forEach(part => {
      const mesh = opponentModel?.[part];
      if (mesh && mesh.material) {
        mesh.material.color.set(0xffffff);
      }
    });
  }, 80);

  // Restore original colors
  setTimeout(() => {
    parts.forEach(part => {
      const mesh = opponentModel?.[part];
      if (mesh && mesh.material) {
        mesh.material.color.setHex(originalColors[part] || 0xcccccc);
        mesh.material.emissive = new THREE.Color(0x000000);
        mesh.material.emissiveIntensity = 0;
      }
    });
    hitFlashActive = false;
  }, 200);
}
