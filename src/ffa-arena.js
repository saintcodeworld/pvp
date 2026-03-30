import * as THREE from 'three';
import { ws, myPlayerId } from './multiplayer.js';
import { playerPos, yaw, pitch, activeSlot, isSwinging, velocity } from './player.js';

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
let myFFAId = null;

// Remote player models in FFA
const ffaModels = new Map(); // playerId -> { group, head, body, ... }
const ffaTargetPos = new Map();
const ffaTargetYaw = new Map();
const ffaSwingTimes = new Map();
const ffaWalkPhases = new Map();

// Hit flash tracking
const ffaHitFlashTimers = new Map();

// Hearts
const heartMeshes = new Map();

const FFA_ARENA_SIZE = 40;
const FFA_FLOOR_Y = 0; // ground surface Y

export function isInFFA() { return inFFA; }
export function getFFAPhase() { return ffaPhase; }

export function setFFAScene(s) { scene = s; }

// ─── BUILD FFA ARENA (Minecraft-style bright PvP) ───────────────────
function buildFFAArena() {
  if (ffaGroup) {
    scene.remove(ffaGroup);
    ffaGroup = null;
  }
  ffaGroup = new THREE.Group();

  const HALF = FFA_ARENA_SIZE / 2;

  // ── Checkerboard grass floor (like PvP arena) ──
  const grassColor = 0x5b8c33;
  const grassDarkColor = 0x4a7a28;
  for (let x = -HALF; x < HALF; x += 2) {
    for (let z = -HALF; z < HALF; z += 2) {
      const isAlt = (Math.abs(x / 2) + Math.abs(z / 2)) % 2 === 0;
      const blockGeo = new THREE.BoxGeometry(2, 0.5, 2);
      const blockMat = new THREE.MeshLambertMaterial({ color: isAlt ? grassColor : grassDarkColor });
      const block = new THREE.Mesh(blockGeo, blockMat);
      block.position.set(x + 1, FFA_FLOOR_Y - 0.25, z + 1);
      block.receiveShadow = true;
      ffaGroup.add(block);
    }
  }

  // Extended ground beyond arena
  const outerGeo = new THREE.PlaneGeometry(200, 200);
  const outerMat = new THREE.MeshLambertMaterial({ color: 0x5b8c33 });
  const outerGround = new THREE.Mesh(outerGeo, outerMat);
  outerGround.rotation.x = -Math.PI / 2;
  outerGround.position.set(0, FFA_FLOOR_Y - 0.5, 0);
  outerGround.receiveShadow = true;
  ffaGroup.add(outerGround);

  // Dirt layer
  const dirtGeo = new THREE.BoxGeometry(FFA_ARENA_SIZE, 0.3, FFA_ARENA_SIZE);
  const dirtMat = new THREE.MeshLambertMaterial({ color: 0x8B6914 });
  const dirt = new THREE.Mesh(dirtGeo, dirtMat);
  dirt.position.set(0, FFA_FLOOR_Y - 0.65, 0);
  ffaGroup.add(dirt);

  // ── Boundary fence (oak wood fence posts) ──
  const fenceColor = 0x9C7A3C;
  const fencePostGeo = new THREE.BoxGeometry(0.25, 1.5, 0.25);
  const fenceMat = new THREE.MeshLambertMaterial({ color: fenceColor });

  for (let i = -HALF; i <= HALF; i += 3) {
    [[-HALF, i], [HALF, i], [i, -HALF], [i, HALF]].forEach(([px, pz]) => {
      const post = new THREE.Mesh(fencePostGeo, fenceMat);
      post.position.set(px, FFA_FLOOR_Y + 0.75, pz);
      post.castShadow = true;
      ffaGroup.add(post);
    });
  }

  // Fence rails
  const railGeoNS = new THREE.BoxGeometry(0.1, 0.1, 3);
  const railGeoEW = new THREE.BoxGeometry(3, 0.1, 0.1);
  for (let i = -HALF; i < HALF; i += 3) {
    [[-HALF, i + 1.5], [HALF, i + 1.5]].forEach(([ex, midZ]) => {
      [0.4, 1.0].forEach(h => {
        const rail = new THREE.Mesh(railGeoNS, fenceMat);
        rail.position.set(ex, FFA_FLOOR_Y + h, midZ);
        ffaGroup.add(rail);
      });
    });
    [[i + 1.5, -HALF], [i + 1.5, HALF]].forEach(([midX, ez]) => {
      [0.4, 1.0].forEach(h => {
        const rail = new THREE.Mesh(railGeoEW, fenceMat);
        rail.position.set(midX, FFA_FLOOR_Y + h, ez);
        ffaGroup.add(rail);
      });
    });
  }

  // ── Corner pillars (oak log + glowstone) ──
  const logColor = 0x6B4226;
  [[-HALF, -HALF], [HALF, -HALF], [-HALF, HALF], [HALF, HALF]].forEach(([cx, cz]) => {
    for (let y = 0; y < 4; y++) {
      const log = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshLambertMaterial({ color: logColor })
      );
      log.position.set(cx, FFA_FLOOR_Y + y + 0.5, cz);
      log.castShadow = true;
      ffaGroup.add(log);
    }
    const glowstone = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffdd66 })
    );
    glowstone.position.set(cx, FFA_FLOOR_Y + 4.5, cz);
    ffaGroup.add(glowstone);
    const glowLight = new THREE.PointLight(0xffdd66, 1.2, 20);
    glowLight.position.set(cx, FFA_FLOOR_Y + 5.5, cz);
    ffaGroup.add(glowLight);
  });

  // ── Trees around the outside ──
  const treePositions = [
    [-24, -24], [-26, -8], [-23, 10], [-27, 18],
    [24, -24], [26, -6], [23, 10], [27, 16],
    [-24, 24], [0, -26], [0, 26], [24, 24],
    [-28, 0], [28, 0], [-14, -26], [14, -26],
    [-14, 26], [14, 26], [-28, -14], [28, 14],
  ];
  treePositions.forEach(([tx, tz]) => buildTree(tx, tz));

  // ── Flowers scattered on the floor ──
  const flowerColors = [0xff4466, 0xffee44, 0x44aaff, 0xff88cc, 0xffffff, 0xff6600];
  for (let i = 0; i < 60; i++) {
    const fx = (Math.random() - 0.5) * (FFA_ARENA_SIZE - 6);
    const fz = (Math.random() - 0.5) * (FFA_ARENA_SIZE - 6);
    const stemGeo = new THREE.BoxGeometry(0.08, 0.35, 0.08);
    const stemMat = new THREE.MeshLambertMaterial({ color: 0x33aa33 });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.set(fx, FFA_FLOOR_Y + 0.175, fz);
    ffaGroup.add(stem);
    const petalGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const petalMat = new THREE.MeshLambertMaterial({ color: flowerColors[Math.floor(Math.random() * flowerColors.length)] });
    const petal = new THREE.Mesh(petalGeo, petalMat);
    petal.position.set(fx, FFA_FLOOR_Y + 0.4, fz);
    ffaGroup.add(petal);
  }

  // ── Tall grass patches ──
  for (let i = 0; i < 80; i++) {
    const gx = (Math.random() - 0.5) * (FFA_ARENA_SIZE - 4);
    const gz = (Math.random() - 0.5) * (FFA_ARENA_SIZE - 4);
    const bladeGeo = new THREE.BoxGeometry(0.12, 0.5 + Math.random() * 0.3, 0.12);
    const bladeMat = new THREE.MeshLambertMaterial({ color: 0x4da832, transparent: true, opacity: 0.9 });
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.set(gx, FFA_FLOOR_Y + 0.25, gz);
    blade.rotation.y = Math.random() * Math.PI;
    ffaGroup.add(blade);
  }

  // ── Red wool accent lines (arena center cross) ──
  const redWool = new THREE.MeshLambertMaterial({ color: 0xcc2222 });
  const lineH = new THREE.Mesh(new THREE.BoxGeometry(FFA_ARENA_SIZE, 0.02, 0.6), redWool);
  lineH.position.set(0, FFA_FLOOR_Y + 0.01, 0);
  ffaGroup.add(lineH);
  const lineV = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, FFA_ARENA_SIZE), redWool);
  lineV.position.set(0, FFA_FLOOR_Y + 0.01, 0);
  ffaGroup.add(lineV);

  // ── Lighting (sunny day) ──
  const sunLight = new THREE.DirectionalLight(0xfffbe8, 1.4);
  sunLight.position.set(30, 50, 20);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 1024;
  sunLight.shadow.mapSize.height = 1024;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 100;
  sunLight.shadow.camera.left = -40;
  sunLight.shadow.camera.right = 40;
  sunLight.shadow.camera.top = 40;
  sunLight.shadow.camera.bottom = -40;
  ffaGroup.add(sunLight);

  const ambientLight = new THREE.AmbientLight(0x8ec8f0, 0.7);
  ffaGroup.add(ambientLight);

  const fillLight = new THREE.DirectionalLight(0xffd4a0, 0.3);
  fillLight.position.set(-20, 15, -15);
  ffaGroup.add(fillLight);

  scene.add(ffaGroup);
}

function buildTree(x, z) {
  const trunkColor = 0x6B4226;
  const leafColor = 0x2D8C2D;
  const leafAltColor = 0x3BA33B;
  const trunkHeight = 4 + Math.floor(Math.random() * 2);

  for (let y = 0; y < trunkHeight; y++) {
    const trunkBlock = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: trunkColor })
    );
    trunkBlock.position.set(x, FFA_FLOOR_Y + y + 0.5, z);
    trunkBlock.castShadow = true;
    ffaGroup.add(trunkBlock);
  }

  const leafStart = trunkHeight - 1;
  for (let ly = 0; ly < 3; ly++) {
    const radius = ly === 2 ? 1 : 2;
    for (let lx = -radius; lx <= radius; lx++) {
      for (let lz = -radius; lz <= radius; lz++) {
        if (lx === 0 && lz === 0 && ly < 2) continue;
        if (Math.abs(lx) === radius && Math.abs(lz) === radius && Math.random() > 0.5) continue;
        const leafBlock = new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshLambertMaterial({ color: Math.random() > 0.3 ? leafColor : leafAltColor })
        );
        leafBlock.position.set(x + lx, FFA_FLOOR_Y + leafStart + ly + 0.5, z + lz);
        leafBlock.castShadow = true;
        ffaGroup.add(leafBlock);
      }
    }
  }
  const topLeaf = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ color: leafColor })
  );
  topLeaf.position.set(x, FFA_FLOOR_Y + leafStart + 3.5, z);
  ffaGroup.add(topLeaf);
}

// ─── PLAYER MODELS ──────────────────────────────────────────────────
function createFFAPlayerModel(playerId, playerName) {
  if (ffaModels.has(playerId)) return;

  const group = new THREE.Group();
  const px = 0.0625;

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

  // Scale up models for FFA visibility
  group.scale.set(1.5, 1.5, 1.5);

  const model = { group, head, body, leftArm, rightArm, leftLeg, rightLeg, nameLabel, swordGroup, bodyColor };
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
  ffaHitFlashTimers.delete(playerId);
}

// ─── HIT FLASH (full body turns red) ────────────────────────────────
function flashPlayerModel(playerId) {
  const model = ffaModels.get(playerId);
  if (!model || ffaHitFlashTimers.has(playerId)) return;
  ffaHitFlashTimers.set(playerId, true);

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
    ffaHitFlashTimers.delete(playerId);
  }, 200);
}

// ─── ARENA BOUNDS HELPER ─────────────────────────────────────────────
const ARENA_INNER_HALF = FFA_ARENA_SIZE / 2 - 1;

function clampToArena(x, z) {
  return {
    x: Math.max(-ARENA_INNER_HALF, Math.min(ARENA_INNER_HALF, x)),
    z: Math.max(-ARENA_INNER_HALF, Math.min(ARENA_INNER_HALF, z)),
  };
}

// ─── KNOCKBACK ──────────────────────────────────────────────────────
const KNOCKBACK_STRENGTH = 6;
const KNOCKBACK_UP = 4;

function applyLocalKnockback(attackerX, attackerZ) {
  if (attackerX == null || attackerZ == null) return;
  const dx = playerPos.x - attackerX;
  const dz = playerPos.z - attackerZ;
  const dist = Math.sqrt(dx * dx + dz * dz) || 1;
  const nx = dx / dist;
  const nz = dz / dist;
  velocity.x = nx * KNOCKBACK_STRENGTH;
  velocity.z = nz * KNOCKBACK_STRENGTH;
  velocity.y = KNOCKBACK_UP;
}

function applyRemoteKnockback(playerId, attackerX, attackerZ) {
  if (attackerX == null || attackerZ == null) return;
  const tp = ffaTargetPos.get(playerId);
  if (!tp) return;
  const dx = tp.x - attackerX;
  const dz = tp.z - attackerZ;
  const dist = Math.sqrt(dx * dx + dz * dz) || 1;
  const nx = dx / dist;
  const nz = dz / dist;
  const clamped = clampToArena(tp.x + nx * 1.2, tp.z + nz * 1.2);
  tp.x = clamped.x;
  tp.z = clamped.z;
}

// ─── ENTER / EXIT FFA ───────────────────────────────────────────────
function finishFFAReturnToMuseum() {
  if (!inFFA) return;
  exitFFA();
  if (onFFAEnd) onFFAEnd(ffaResult);
}

export function enterFFA(setupData, endCallback) {
  matchId = setupData.matchId;
  myFFAId = setupData.myId != null ? setupData.myId : myPlayerId;
  allPlayers = setupData.allPlayers || [];
  alivePlayers = new Set(allPlayers.map(p => p.id));
  onFFAEnd = endCallback;
  inFFA = true;
  ffaPhase = 'countdown';
  myHp = 100;
  ffaResult = null;
  heartMeshes.clear();
  ffaHitFlashTimers.clear();

  buildFFAArena();

  // Set spawn position (eye height above FFA floor)
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
  myFFAId = null;
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
  ffaHitFlashTimers.clear();
  hideFFAHUD();
}

// ─── HANDLE SERVER MESSAGES ─────────────────────────────────────────
export function handleFFAMessage(msg) {
  switch (msg.type) {
    case 'ffa_arena_setup': {
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
        const clamped = clampToArena(msg.x, msg.z);
        tp.set(clamped.x, (msg.y || 1.7) - 1.7 + FFA_FLOOR_Y, clamped.z);
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
        const myId = allPlayers.find(p => ffaModels.has(p.id) === false)?.id;
        const isMe = msg.defenderId === myId || (!ffaModels.has(msg.defenderId) && allPlayers.length > 0);
        if (isMe) {
          myHp = msg.defenderHp;
          flashFFADamage();
          applyLocalKnockback(msg.attackerX, msg.attackerZ);
          if (msg.defenderHp <= 0) {
            finishFFAReturnToMuseum();
          }
        }
        // Flash the defender model red (full body) + knockback remote model
        if (ffaModels.has(msg.defenderId)) {
          flashPlayerModel(msg.defenderId);
          applyRemoteKnockback(msg.defenderId, msg.attackerX, msg.attackerZ);
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
      if (!ffaModels.has(msg.playerId)) {
        myHp = msg.hp;
      }
      updateFFAHPBar();
      break;
    }

    case 'ffa_player_eliminated': {
      if (!inFFA) break;
      alivePlayers.delete(msg.playerId);
      updateAliveCount();
      showEliminationNotif(msg.eliminatedName, msg.killerName);
      if (ffaModels.has(msg.playerId)) {
        const model = ffaModels.get(msg.playerId);
        if (model) model.group.visible = false;
      }
      if (msg.playerId === myFFAId || msg.playerId === myPlayerId) {
        finishFFAReturnToMuseum();
      }
      break;
    }

    case 'ffa_match_end': {
      if (!inFFA) break;
      ffaPhase = 'match_end';
      ffaResult = msg;
      showFFAMatchEnd(msg);
      break;
    }

    case 'returned_to_museum': {
      finishFFAReturnToMuseum();
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
  const mat = new THREE.MeshBasicMaterial({ color: 0xff3366 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(heart.x, FFA_FLOOR_Y + 0.5, heart.z);
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

    // Hard clamp visual position inside fence
    group.position.x = Math.max(-ARENA_INNER_HALF, Math.min(ARENA_INNER_HALF, group.position.x));
    group.position.z = Math.max(-ARENA_INNER_HALF, Math.min(ARENA_INNER_HALF, group.position.z));

    const dx = group.position.x - prevX;
    const dz = group.position.z - prevZ;
    const speed = delta > 0 ? Math.sqrt(dx * dx + dz * dz) / delta : 0;

    // Rotation
    const targetRotY = (ffaTargetYaw.get(pid) || 0) + Math.PI;
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
    mesh.position.y = FFA_FLOOR_Y + 0.5 + Math.sin(time * 3 + mesh.userData.phase) * 0.15;
  });

  // Arena bounds — keep everyone inside the fence
  if (ffaPhase === 'fighting') {
    playerPos.x = Math.max(-ARENA_INNER_HALF, Math.min(ARENA_INNER_HALF, playerPos.x));
    playerPos.z = Math.max(-ARENA_INNER_HALF, Math.min(ARENA_INNER_HALF, playerPos.z));
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
