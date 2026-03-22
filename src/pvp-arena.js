import * as THREE from 'three';
import { ws } from './multiplayer.js';
import { playerPos, yaw, pitch, activeSlot, isSwinging } from './player.js';

// ─── ARENA STATE ────────────────────────────────────────────────────
let inArena = false;
let arenaGroup = null;
let scene = null;
let matchId = null;
let matchMode = '1v1'; // '1v1' or '2v2'
let myTeam = 1;
let myRole = '';
let onMatchEnd = null;

// All other players in the arena (opponents + teammates in 2v2)
const arenaPlayers = new Map(); // playerId -> { name, team, model, targetPos, targetYaw, swingTime, walkPhase }
let myHp = 100;
let currentRound = 1;
let myTeamWins = 0;
let enemyTeamWins = 0;
let phase = 'waiting';
let countdownValue = 5;
let matchResult = null;

// Legacy 1v1 convenience accessors
function getOpponentId() {
  for (const [pid, data] of arenaPlayers) {
    if (data.team !== myTeam) return pid;
  }
  return null;
}

// Hearts
const heartMeshes = new Map();

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

// ─── ENTER / EXIT ARENA ─────────────────────────────────────────────
export function enterArena(gameData, matchEndCallback) {
  matchId = gameData.lobbyId;
  matchMode = gameData.mode || '1v1';
  myRole = gameData.role;
  myTeam = gameData.team || (myRole === 'creator' ? 1 : 2);
  onMatchEnd = matchEndCallback;
  inArena = true;
  phase = 'waiting';
  myHp = 100;
  currentRound = 1;
  myTeamWins = 0;
  enemyTeamWins = 0;
  matchResult = null;
  heartMeshes.clear();
  arenaPlayers.clear();

  buildArena();
  arenaGroup.visible = true;

  // Create models for all other players
  if (matchMode === '2v2' && gameData.allPlayers) {
    gameData.allPlayers.forEach(p => {
      // Skip self — we figure out self by matching role or checking allPlayers
      // The server doesn't send a specific "myId" but we can infer from teammate/enemies
      const isSelf = (myRole === 'creator' && p.id === gameData.allPlayers.find(x => x.team === myTeam && gameData.role === 'creator')?.id) ||
                     (p.name === gameData.teammateName && p.team === myTeam && false); // complex — use simpler approach
      // Actually, identify self: creator role => first team member, or check via enemies list
      if (gameData.enemies && gameData.enemies.some(e => e.id === p.id)) {
        createArenaPlayerModel(p.id, p.name, p.team);
      } else if (gameData.teammateId === p.id) {
        createArenaPlayerModel(p.id, p.name, p.team);
      }
    });
  } else {
    // 1v1 — single opponent
    if (gameData.opponentId) {
      createArenaPlayerModel(gameData.opponentId, gameData.opponentName, myTeam === 1 ? 2 : 1);
    }
  }

  showCombatHUD();
  updateHPBars();
  updateRoundDisplay();

  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'game_ready', lobbyId: matchId }));
  }
}

export function exitArena() {
  inArena = false;
  phase = 'waiting';
  if (arenaGroup) arenaGroup.visible = false;

  heartMeshes.forEach(mesh => { arenaGroup.remove(mesh); });
  heartMeshes.clear();

  arenaPlayers.forEach((data) => {
    if (data.model) arenaGroup.remove(data.model.group);
  });
  arenaPlayers.clear();

  hideCombatHUD();
}

function createArenaPlayerModel(playerId, name, team) {
  const group = new THREE.Group();
  const px = 0.0625;
  const bodyColor = team === myTeam ? 0x4488ff : 0xff4444; // blue = ally, red = enemy

  const headGeo = new THREE.BoxGeometry(8*px, 8*px, 8*px);
  const headMat = new THREE.MeshLambertMaterial({ color: 0xc4986c });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.5 + 4*px;
  group.add(head);

  const eyeGeo = new THREE.BoxGeometry(2*px, 2*px, 0.5*px);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-1.5*px, 1.5+5*px, 4.3*px);
  group.add(leftEye);
  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(1.5*px, 1.5+5*px, 4.3*px);
  group.add(rightEye);

  const bodyGeo = new THREE.BoxGeometry(8*px, 12*px, 4*px);
  const bodyMeshMat = new THREE.MeshLambertMaterial({ color: bodyColor });
  const body = new THREE.Mesh(bodyGeo, bodyMeshMat);
  body.position.y = 0.75 + 6*px;
  group.add(body);

  const armGeo = new THREE.BoxGeometry(4*px, 12*px, 4*px);
  const armMat = new THREE.MeshLambertMaterial({ color: bodyColor });
  const leftArm = new THREE.Mesh(armGeo, armMat);
  leftArm.position.set(-6*px, 0.75+6*px, 0);
  group.add(leftArm);
  const rightArm = new THREE.Mesh(armGeo, armMat.clone());
  rightArm.position.set(6*px, 0.75+6*px, 0);
  group.add(rightArm);

  const swordGroup = new THREE.Group();
  const swordImg = new Image();
  swordImg.crossOrigin = 'anonymous';
  swordImg.onload = () => {
    const tex = new THREE.Texture(swordImg);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.needsUpdate = true;
    const sMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide });
    swordGroup.add(new THREE.Mesh(new THREE.PlaneGeometry(1.14, 1.63), sMat));
  };
  swordImg.src = 'assets/Sprite-0001.png';
  swordGroup.position.set(-0.082, -0.176, 0.287);
  swordGroup.rotation.set(0.21, 1.06, -0.2);
  leftArm.add(swordGroup);

  const legGeo = new THREE.BoxGeometry(4*px, 12*px, 4*px);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x333350 });
  const leftLeg = new THREE.Mesh(legGeo, legMat);
  leftLeg.position.set(-2*px, 6*px, 0);
  group.add(leftLeg);
  const rightLeg = new THREE.Mesh(legGeo, legMat.clone());
  rightLeg.position.set(2*px, 6*px, 0);
  group.add(rightLeg);

  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 48;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 8, 256, 32);
  ctx.fillStyle = team === myTeam ? '#4488ff' : '#ff4444';
  ctx.font = 'bold 22px Courier New';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(name, 128, 24);
  const labelTex = new THREE.CanvasTexture(canvas);
  labelTex.magFilter = THREE.NearestFilter;
  const labelGeo = new THREE.PlaneGeometry(1.6, 0.3);
  const labelMeshMat = new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, depthTest: false });
  const nameLabel = new THREE.Mesh(labelGeo, labelMeshMat);
  nameLabel.position.set(0, 2.2, 0); nameLabel.renderOrder = 999;
  group.add(nameLabel);

  const model = { group, head, body, leftArm, rightArm, leftLeg, rightLeg, nameLabel, swordGroup };
  arenaGroup.add(group);

  arenaPlayers.set(playerId, {
    name, team, model, hp: 100,
    targetPos: new THREE.Vector3(),
    targetYaw: 0, swingTime: 0, walkPhase: 0,
  });
}

// ─── SPAWN POSITIONS ────────────────────────────────────────────────
export function getSpawnPosition(side) {
  if (side === 'left') return new THREE.Vector3(-10, 1.7, 0);
  return new THREE.Vector3(10, 1.7, 0);
}

// ─── HANDLE SERVER MESSAGES ─────────────────────────────────────────
export function handleArenaMessage(msg) {
  switch (msg.type) {
    case 'arena_setup': {
      matchId = msg.matchId;
      matchMode = msg.mode || '1v1';
      currentRound = msg.round;
      myTeam = msg.team || myTeam;
      const spawnPos = getSpawnPosition(msg.spawnSide);
      playerPos.set(spawnPos.x, spawnPos.y, spawnPos.z);
      // Set other players positions
      if (msg.otherPlayerIds) {
        msg.otherPlayerIds.forEach(pid => {
          const pd = arenaPlayers.get(pid);
          if (pd) {
            const oppSide = pd.team === myTeam ? msg.spawnSide : (msg.spawnSide === 'left' ? 'right' : 'left');
            const oppSpawn = getSpawnPosition(oppSide);
            pd.targetPos.set(oppSpawn.x, oppSpawn.y - 1.7, oppSpawn.z);
            if (pd.model) pd.model.group.position.copy(pd.targetPos);
          }
        });
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
      const pd = arenaPlayers.get(msg.id);
      if (pd) {
        pd.targetPos.set(msg.x, (msg.y || 1.7) - 1.7, msg.z);
        pd.targetYaw = msg.yaw;
      }
      break;
    }

    case 'player_swing': {
      const pd2 = arenaPlayers.get(msg.id);
      if (pd2) pd2.swingTime = 0.5;
      break;
    }

    case 'player_eliminated': {
      const pd3 = arenaPlayers.get(msg.playerId);
      if (pd3 && pd3.model) pd3.model.group.visible = false;
      break;
    }

    case 'hit': {
      const defender = arenaPlayers.get(msg.defenderId);
      if (defender) {
        defender.hp = msg.defenderHp;
        flashOpponentHitColor(msg.defenderId);
      } else {
        // I'm the defender
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
      const picker = arenaPlayers.get(msg.playerId);
      if (picker) {
        picker.hp = msg.hp;
      } else {
        myHp = msg.hp;
      }
      updateHPBars();
      break;
    }

    case 'round_end': {
      phase = 'round_end';
      if (msg.roundWins) {
        myTeamWins = msg.roundWins[myTeam] || 0;
        enemyTeamWins = msg.roundWins[myTeam === 1 ? 2 : 1] || 0;
      }
      showRoundEndDisplay(msg.winningTeam === myTeam);
      updateRoundDisplay();
      heartMeshes.forEach(mesh => arenaGroup.remove(mesh));
      heartMeshes.clear();
      break;
    }

    case 'match_end': {
      phase = 'match_end';
      matchResult = msg;
      const iWon = msg.winningTeam === myTeam;
      const winNames = (msg.winnerNames || []).join(' & ');
      const loseNames = (msg.loserNames || []).join(' & ');
      showMatchEndDisplay(iWon, winNames, loseNames);
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
  if (!inArena) return;

  const lerpFactor = Math.min(1, delta * 12);

  // Animate all arena players
  arenaPlayers.forEach((pd) => {
    const model = pd.model;
    if (!model || !model.group.visible) return;

    const group = model.group;
    const prevX = group.position.x;
    const prevZ = group.position.z;

    group.position.x += (pd.targetPos.x - group.position.x) * lerpFactor;
    group.position.y += (pd.targetPos.y - group.position.y) * lerpFactor;
    group.position.z += (pd.targetPos.z - group.position.z) * lerpFactor;

    const dx = group.position.x - prevX;
    const dz = group.position.z - prevZ;
    const speed = delta > 0 ? Math.sqrt(dx * dx + dz * dz) / delta : 0;

    const targetRotY = -pd.targetYaw + Math.PI;
    let rotDiff = targetRotY - group.rotation.y;
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    group.rotation.y += rotDiff * lerpFactor;

    if (speed > 0.5) {
      pd.walkPhase += delta * speed * 2;
      const swing = Math.sin(pd.walkPhase) * 0.6;
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

    if (pd.swingTime > 0) {
      pd.swingTime -= delta * 2;
      const swingCurve = Math.sin(pd.swingTime * Math.PI * 2) * 1.2;
      model.leftArm.rotation.x = swingCurve;
    }

    if (model.nameLabel && camera) {
      model.nameLabel.lookAt(camera.position);
    }
  });

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
  const myText = document.getElementById('my-hp-text');
  if (myBar) myBar.style.width = myHp + '%';
  if (myText) myText.textContent = Math.round(myHp) + '%';
  if (myBar) myBar.style.background = myHp > 50 ? '#00cc44' : myHp > 25 ? '#ffaa00' : '#ff3333';

  // For 1v1, show single opponent bar; for 2v2, show first enemy HP
  const oppBar = document.getElementById('opp-hp-bar');
  const oppText = document.getElementById('opp-hp-text');
  let oppHp = 100;
  for (const [, pd] of arenaPlayers) {
    if (pd.team !== myTeam) { oppHp = pd.hp; break; }
  }
  if (oppBar) oppBar.style.width = oppHp + '%';
  if (oppText) oppText.textContent = Math.round(oppHp) + '%';
  if (oppBar) oppBar.style.background = oppHp > 50 ? '#00cc44' : oppHp > 25 ? '#ffaa00' : '#ff3333';
}

function updateRoundDisplay() {
  const el = document.getElementById('round-display');
  if (el) el.textContent = `Round ${currentRound} / 3  |  ${myTeamWins} - ${enemyTeamWins}`;
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

// ─── HIT COLOR FLASH ON PLAYER BODY ──────────────────────────────
const hitFlashTimers = new Map();

function flashOpponentHitColor(playerId) {
  const pd = arenaPlayers.get(playerId);
  if (!pd || !pd.model || hitFlashTimers.has(playerId)) return;
  hitFlashTimers.set(playerId, true);

  const model = pd.model;
  const hitColor = new THREE.Color(0xff0000);
  const parts = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
  const origColors = {};

  parts.forEach(part => {
    const mesh = model[part];
    if (mesh && mesh.material) {
      origColors[part] = mesh.material.color.getHex();
      mesh.material.color.set(hitColor);
      mesh.material.emissive = new THREE.Color(0xff2222);
      mesh.material.emissiveIntensity = 0.6;
    }
  });

  setTimeout(() => {
    parts.forEach(part => {
      const mesh = model?.[part];
      if (mesh && mesh.material) mesh.material.color.set(0xffffff);
    });
  }, 80);

  setTimeout(() => {
    parts.forEach(part => {
      const mesh = model?.[part];
      if (mesh && mesh.material) {
        mesh.material.color.setHex(origColors[part] || 0xcccccc);
        mesh.material.emissive = new THREE.Color(0x000000);
        mesh.material.emissiveIntensity = 0;
      }
    });
    hitFlashTimers.delete(playerId);
  }, 200);
}
