import * as THREE from 'three';
import { ws } from './multiplayer.js';
import { playerPos, yaw, pitch, activeSlot, isSwinging, setYaw, velocity } from './player.js';

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
  const GROUND_EXTEND = 80;

  // ── Grass floor (Minecraft flat world style) ──
  const grassColor = 0x5b8c33;
  const grassDarkColor = 0x4a7a28;

  // Main arena floor — checkerboard grass blocks
  for (let x = -HALF; x < HALF; x += 1) {
    for (let z = -HALF; z < HALF; z += 1) {
      const isAlt = (Math.abs(x) + Math.abs(z)) % 2 === 0;
      const blockGeo = new THREE.BoxGeometry(1, 0.5, 1);
      const blockMat = new THREE.MeshLambertMaterial({ color: isAlt ? grassColor : grassDarkColor });
      const block = new THREE.Mesh(blockGeo, blockMat);
      block.position.set(x + 0.5, -0.25, z + 0.5);
      block.receiveShadow = true;
      arenaGroup.add(block);
    }
  }

  // Extended ground plane beyond the arena (lower detail, flat grass)
  const outerGeo = new THREE.PlaneGeometry(GROUND_EXTEND * 2, GROUND_EXTEND * 2);
  const outerMat = new THREE.MeshLambertMaterial({ color: 0x5b8c33 });
  const outerGround = new THREE.Mesh(outerGeo, outerMat);
  outerGround.rotation.x = -Math.PI / 2;
  outerGround.position.set(0, -0.5, 0);
  outerGround.receiveShadow = true;
  arenaGroup.add(outerGround);

  // Dirt layer visible at edges
  const dirtGeo = new THREE.BoxGeometry(ARENA_SIZE, 0.3, ARENA_SIZE);
  const dirtMat = new THREE.MeshLambertMaterial({ color: 0x8B6914 });
  const dirt = new THREE.Mesh(dirtGeo, dirtMat);
  dirt.position.set(0, -0.65, 0);
  arenaGroup.add(dirt);

  // ── Boundary fence (oak wood fence posts) ──
  const fenceColor = 0x9C7A3C;
  const fencePostGeo = new THREE.BoxGeometry(0.25, 1.2, 0.25);
  const fenceRailGeo = new THREE.BoxGeometry(0.15, 0.15, 1);
  const fenceMat = new THREE.MeshLambertMaterial({ color: fenceColor });

  for (let i = -HALF; i <= HALF; i += 2) {
    // North & South edges
    [[-HALF, i], [HALF, i]].forEach(([edgeX, edgeZ]) => {
      const post = new THREE.Mesh(fencePostGeo, fenceMat);
      post.position.set(edgeX, 0.6, edgeZ);
      post.castShadow = true;
      arenaGroup.add(post);
    });
    // East & West edges
    [[i, -HALF], [i, HALF]].forEach(([edgeX, edgeZ]) => {
      const post = new THREE.Mesh(fencePostGeo, fenceMat);
      post.position.set(edgeX, 0.6, edgeZ);
      post.castShadow = true;
      arenaGroup.add(post);
    });
  }

  // Fence rails connecting posts
  for (let i = -HALF; i < HALF; i += 2) {
    const railGeo2 = new THREE.BoxGeometry(0.1, 0.1, 2);
    // North/South rails
    [[-HALF, i + 1], [HALF, i + 1]].forEach(([edgeX, midZ]) => {
      [0.35, 0.85].forEach(h => {
        const rail = new THREE.Mesh(railGeo2, fenceMat);
        rail.position.set(edgeX, h, midZ);
        arenaGroup.add(rail);
      });
    });
    const railGeoH = new THREE.BoxGeometry(2, 0.1, 0.1);
    // East/West rails
    [[i + 1, -HALF], [i + 1, HALF]].forEach(([midX, edgeZ]) => {
      [0.35, 0.85].forEach(h => {
        const rail = new THREE.Mesh(railGeoH, fenceMat);
        rail.position.set(midX, h, edgeZ);
        arenaGroup.add(rail);
      });
    });
  }

  // ── Trees (Minecraft oak-style, blocky) ──
  function createTree(x, z) {
    const trunkColor = 0x6B4226;
    const leafColor = 0x2D8C2D;
    const leafAltColor = 0x3BA33B;

    // Trunk (3-5 blocks tall)
    const trunkHeight = 4 + Math.floor(Math.random() * 2);
    for (let y = 0; y < trunkHeight; y++) {
      const trunkBlock = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshLambertMaterial({ color: trunkColor })
      );
      trunkBlock.position.set(x, y + 0.5, z);
      trunkBlock.castShadow = true;
      arenaGroup.add(trunkBlock);
    }

    // Leaf canopy (blocky sphere-ish shape)
    const leafStart = trunkHeight - 1;
    for (let ly = 0; ly < 3; ly++) {
      const radius = ly === 2 ? 1 : 2;
      for (let lx = -radius; lx <= radius; lx++) {
        for (let lz = -radius; lz <= radius; lz++) {
          if (lx === 0 && lz === 0 && ly < 2) continue; // trunk passes through
          if (Math.abs(lx) === radius && Math.abs(lz) === radius && Math.random() > 0.5) continue;
          const leafBlock = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshLambertMaterial({ color: Math.random() > 0.3 ? leafColor : leafAltColor })
          );
          leafBlock.position.set(x + lx, leafStart + ly + 0.5, z + lz);
          leafBlock.castShadow = true;
          arenaGroup.add(leafBlock);
        }
      }
    }
    // Top leaf
    const topLeaf = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: leafColor })
    );
    topLeaf.position.set(x, leafStart + 3.5, z);
    arenaGroup.add(topLeaf);
  }

  // Place trees around the arena (outside the play area)
  const treePositions = [
    [-18, -18], [-20, -5], [-17, 8], [-22, 16],
    [18, -18], [20, -3], [17, 10], [22, 15],
    [-18, 18], [0, -20], [0, 20], [18, 18],
    [-25, 0], [25, 0], [-10, -22], [10, -22],
    [-10, 22], [10, 22], [-25, -12], [25, 12],
    [-30, -25], [30, -25], [-30, 25], [30, 25],
  ];
  treePositions.forEach(([tx, tz]) => createTree(tx, tz));

  // ── Flowers scattered on the arena floor ──
  const flowerColors = [0xff4466, 0xffee44, 0x44aaff, 0xff88cc, 0xffffff, 0xff6600];
  for (let i = 0; i < 40; i++) {
    const fx = (Math.random() - 0.5) * (ARENA_SIZE - 4);
    const fz = (Math.random() - 0.5) * (ARENA_SIZE - 4);
    const stemGeo = new THREE.BoxGeometry(0.08, 0.35, 0.08);
    const stemMat = new THREE.MeshLambertMaterial({ color: 0x33aa33 });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.set(fx, 0.175, fz);
    arenaGroup.add(stem);

    const petalGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const petalMat = new THREE.MeshLambertMaterial({ color: flowerColors[Math.floor(Math.random() * flowerColors.length)] });
    const petal = new THREE.Mesh(petalGeo, petalMat);
    petal.position.set(fx, 0.4, fz);
    arenaGroup.add(petal);
  }

  // ── Tall grass patches ──
  const tallGrassColor = 0x4da832;
  for (let i = 0; i < 60; i++) {
    const gx = (Math.random() - 0.5) * (ARENA_SIZE - 2);
    const gz = (Math.random() - 0.5) * (ARENA_SIZE - 2);
    const bladeGeo = new THREE.BoxGeometry(0.12, 0.5 + Math.random() * 0.3, 0.12);
    const bladeMat = new THREE.MeshLambertMaterial({ color: tallGrassColor, transparent: true, opacity: 0.9 });
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.set(gx, 0.25, gz);
    blade.rotation.y = Math.random() * Math.PI;
    arenaGroup.add(blade);
  }

  // ── Corner oak logs (decorative boundary markers) ──
  const logColor = 0x6B4226;
  const logTopColor = 0x8B6914;
  [[-HALF, -HALF], [HALF, -HALF], [-HALF, HALF], [HALF, HALF]].forEach(([cx, cz]) => {
    for (let y = 0; y < 3; y++) {
      const log = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshLambertMaterial({ color: logColor })
      );
      log.position.set(cx, y + 0.5, cz);
      log.castShadow = true;
      arenaGroup.add(log);
    }
    // Glowstone on top
    const glowstone = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffdd66 })
    );
    glowstone.position.set(cx, 3.5, cz);
    arenaGroup.add(glowstone);
    const glowLight = new THREE.PointLight(0xffdd66, 1.0, 15);
    glowLight.position.set(cx, 4.5, cz);
    arenaGroup.add(glowLight);
  });

  // ── Lighting (sunny day) ──
  const sunLight = new THREE.DirectionalLight(0xfffbe8, 1.4);
  sunLight.position.set(20, 40, 15);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 1024;
  sunLight.shadow.mapSize.height = 1024;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 80;
  sunLight.shadow.camera.left = -30;
  sunLight.shadow.camera.right = 30;
  sunLight.shadow.camera.top = 30;
  sunLight.shadow.camera.bottom = -30;
  arenaGroup.add(sunLight);

  const ambientLight = new THREE.AmbientLight(0x8ec8f0, 0.7);
  arenaGroup.add(ambientLight);

  const fillLight = new THREE.DirectionalLight(0xffd4a0, 0.3);
  fillLight.position.set(-15, 10, -10);
  arenaGroup.add(fillLight);

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
      myHp = 100;
      const spawnPos = getSpawnPosition(msg.spawnSide);
      playerPos.set(spawnPos.x, spawnPos.y, spawnPos.z);
      // Face toward arena center (+X from left spawn, −X from right spawn)
      const faceCenter = msg.spawnSide === 'left' ? -Math.PI / 2 : Math.PI / 2;
      setYaw(faceCenter);
      // New round: show everyone again (elimination hides meshes until next setup)
      arenaPlayers.forEach((pd) => {
        pd.hp = 100;
        if (pd.model && pd.model.group) pd.model.group.visible = true;
      });
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
      arenaPlayers.forEach((pd) => {
        if (pd.model && pd.model.group) pd.model.group.visible = true;
      });
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
        // Knockback remote model (clamped to arena)
        if (defender.model && msg.attackerX != null) {
          const dx = defender.targetPos.x - msg.attackerX;
          const dz = defender.targetPos.z - msg.attackerZ;
          const dist = Math.sqrt(dx * dx + dz * dz) || 1;
          defender.targetPos.x = Math.max(-14, Math.min(14, defender.targetPos.x + (dx / dist) * 1.2));
          defender.targetPos.z = Math.max(-14, Math.min(14, defender.targetPos.z + (dz / dist) * 1.2));
        }
      } else {
        // I'm the defender — apply knockback
        myHp = msg.defenderHp;
        flashDamage();
        if (msg.attackerX != null) {
          const dx = playerPos.x - msg.attackerX;
          const dz = playerPos.z - msg.attackerZ;
          const dist = Math.sqrt(dx * dx + dz * dz) || 1;
          velocity.x = (dx / dist) * 6;
          velocity.z = (dz / dist) * 6;
          velocity.y = 4;
        }
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

    const targetRotY = pd.targetYaw + Math.PI;
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
