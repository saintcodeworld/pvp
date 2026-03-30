import * as THREE from 'three';
import { collisionBlocks, blockSize } from './museum.js';

// ─── PLAYER STATE ───────────────────────────────────────────────────
export const playerHeight = 1.7;
export const floorY = 1;
export const playerPos = new THREE.Vector3(0, playerHeight + floorY, 2);

export let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
export let canJump = false;
export let spacePressed = false;
export let isLocked = false;
export let yaw = 0, pitch = 0;
export let activeSlot = 0;
export let isSwinging = false;
export let swordSwing = 0;
export let exhibitOpen = false;
export let currentExhibit = null;
export let minimapVisible = false;
export let chatOpen = false;
export let collisionEnabled = true;

export const velocity = new THREE.Vector3();
export const direction = new THREE.Vector3();

const gravity = -30;
const jumpSpeed = 10;
const moveSpeed = 8;

let camera, renderer, scene;
let fistGroup, swordHandGroup;

// ─── SETTERS (for cross-module state updates) ───────────────────────
export function setMoveForward(v) { moveForward = v; }
export function setMoveBackward(v) { moveBackward = v; }
export function setMoveLeft(v) { moveLeft = v; }
export function setMoveRight(v) { moveRight = v; }
export function setCanJump(v) { canJump = v; }
export function setSpacePressed(v) { spacePressed = v; }
export function setIsLocked(v) { isLocked = v; }
export function setYaw(v) { yaw = v; }
export function setPitch(v) { pitch = v; }
export function setActiveSlot(v) { activeSlot = v; }
export function setIsSwinging(v) { isSwinging = v; }
export function setSwordSwing(v) { swordSwing = v; }
export function setExhibitOpen(v) { exhibitOpen = v; }
export function setCurrentExhibit(v) { currentExhibit = v; }
export function setMinimapVisible(v) { minimapVisible = v; }
export function setChatOpen(v) { chatOpen = v; }
export function setCollisionEnabled(v) { collisionEnabled = v; }

export function initPlayer(cam, rend, sc) {
  camera = cam;
  renderer = rend;
  scene = sc;
}

export function getCamera() { return camera; }
export function getRenderer() { return renderer; }

// ─── COLLISION DETECTION ────────────────────────────────────────────
export function checkCollision(newPos) {
  if (!collisionEnabled) return false;
  const playerRadius = 0.35;
  const pMin = new THREE.Vector3(newPos.x - playerRadius, newPos.y - playerHeight, newPos.z - playerRadius);
  const pMax = new THREE.Vector3(newPos.x + playerRadius, newPos.y + 0.1, newPos.z + playerRadius);

  for (const block of collisionBlocks) {
    const bPos = block.position;
    const half = blockSize / 2;
    const bMin = new THREE.Vector3(bPos.x - half, bPos.y - half, bPos.z - half);
    const bMax = new THREE.Vector3(bPos.x + half, bPos.y + half, bPos.z + half);

    if (pMin.x < bMax.x && pMax.x > bMin.x &&
        pMin.y < bMax.y && pMax.y > bMin.y &&
        pMin.z < bMax.z && pMax.z > bMin.z) {
      return true;
    }
  }
  return false;
}

// ─── MOVEMENT UPDATE ────────────────────────────────────────────────
export function updatePlayerMovement(delta) {
  if (!isLocked || exhibitOpen) return;

  velocity.y += gravity * delta;

  direction.set(0, 0, 0);
  if (moveForward) direction.z -= 1;
  if (moveBackward) direction.z += 1;
  if (moveLeft) direction.x -= 1;
  if (moveRight) direction.x += 1;
  direction.normalize();

  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

  const moveVec = new THREE.Vector3();
  moveVec.addScaledVector(forward, -direction.z * moveSpeed * delta);
  moveVec.addScaledVector(right, direction.x * moveSpeed * delta);

  // Apply knockback velocity (horizontal)
  moveVec.x += velocity.x * delta;
  moveVec.z += velocity.z * delta;

  // Decay knockback (friction)
  velocity.x *= Math.max(0, 1 - 8 * delta);
  velocity.z *= Math.max(0, 1 - 8 * delta);
  if (Math.abs(velocity.x) < 0.1) velocity.x = 0;
  if (Math.abs(velocity.z) < 0.1) velocity.z = 0;

  const testPosX = playerPos.clone();
  testPosX.x += moveVec.x;
  if (!checkCollision(testPosX)) {
    playerPos.x = testPosX.x;
  }

  const testPosZ = playerPos.clone();
  testPosZ.z += moveVec.z;
  if (!checkCollision(testPosZ)) {
    playerPos.z = testPosZ.z;
  }

  playerPos.y += velocity.y * delta;

  if (playerPos.y <= playerHeight + floorY) {
    playerPos.y = playerHeight + floorY;
    velocity.y = 0;
    canJump = true;
    
    // Bhop: auto-jump if space is still held
    if (spacePressed && isLocked) {
      velocity.y = jumpSpeed;
      canJump = false;
    }
  }

  // World bounds (museum only — arena/FFA handle their own bounds)
  if (collisionEnabled) {
    playerPos.x = Math.max(-19, Math.min(18, playerPos.x));
    playerPos.z = Math.max(-29, Math.min(29, playerPos.z));
  }
}

export function updateCamera() {
  camera.position.copy(playerPos);
  const lookDir = new THREE.Vector3(
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch)
  );
  camera.lookAt(playerPos.clone().add(lookDir));
}

export function tryJump() {
  if (canJump && isLocked) {
    velocity.y = jumpSpeed;
    canJump = false;
  }
}

// ─── HAND & SWORD MODEL ─────────────────────────────────────────────

function makeSteveArmTex() {
  const canvas = document.createElement('canvas');
  canvas.width = 16; canvas.height = 16;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const v = (Math.random() - 0.5) * 8;
      ctx.fillStyle = `rgb(${(196 + v)|0},${(152 + v)|0},${(108 + v)|0})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

function makeSteveShirtTex() {
  const canvas = document.createElement('canvas');
  canvas.width = 16; canvas.height = 16;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const v = (Math.random() - 0.5) * 6;
      ctx.fillStyle = `rgb(${(58 + v)|0},${(178 + v)|0},${(178 + v)|0})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

function buildSteveArm() {
  const group = new THREE.Group();
  const px = 0.0625;
  const skinMat = new THREE.MeshLambertMaterial({ map: makeSteveArmTex() });
  const shirtMat = new THREE.MeshLambertMaterial({ map: makeSteveShirtTex() });

  const armW = 4 * px;
  const armH = 12 * px;
  const armD = 4 * px;

  const sleeve = new THREE.Mesh(
    new THREE.BoxGeometry(armW + 0.01, 4 * px, armD + 0.01),
    shirtMat
  );
  sleeve.position.set(0, -2 * px, 0);
  group.add(sleeve);

  const forearm = new THREE.Mesh(
    new THREE.BoxGeometry(armW, 8 * px, armD),
    skinMat
  );
  forearm.position.set(0, -8 * px, 0);
  group.add(forearm);

  return { group, skinMat, armW, armH, armD, px };
}

export function createHandModel() {
  const fistArm = buildSteveArm();
  fistGroup = fistArm.group;
  fistGroup.position.set(0.672, -0.508, -1.196);
  fistGroup.rotation.set(-1.440, -3.139, 0.104);
  camera.add(fistGroup);

  swordHandGroup = new THREE.Group();
  swordHandGroup.position.set(0.210, -0.110, -0.250);
  swordHandGroup.rotation.set(0.260, -1.440, -0.360);
  swordHandGroup.visible = false;
  camera.add(swordHandGroup);

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
      depthWrite: false,
    });
    const swordPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.430, 0.540), swordMat);
    swordHandGroup.add(swordPlane);
  };
  swordImg.src = 'assets/Sprite-0001.png';

  scene.add(camera);
}

export function swingSword(sendSwingFn) {
  if (isSwinging) return;
  isSwinging = true;
  swordSwing = 0.90;
  if (sendSwingFn) sendSwingFn();
}

export function hideHandModels() {
  if (fistGroup) fistGroup.visible = false;
  if (swordHandGroup) swordHandGroup.visible = false;
}

export function showHandModels() {
  if (fistGroup) fistGroup.visible = (activeSlot === 0);
  if (swordHandGroup) swordHandGroup.visible = (activeSlot === 1);
}

export function selectHotbarSlot(index) {
  activeSlot = index;
  const slots = document.querySelectorAll('.hotbar-slot');
  slots.forEach((s, i) => s.classList.toggle('active', i === index));

  if (fistGroup) fistGroup.visible = (index === 0);
  if (swordHandGroup) swordHandGroup.visible = (index === 1);
}

function getActiveHandGroup() {
  if (activeSlot === 1 && swordHandGroup) return swordHandGroup;
  if (fistGroup) return fistGroup;
  return null;
}

export function updateHandAnimation(delta, time) {
  const hand = getActiveHandGroup();
  if (!hand) return;

  const isSword = (activeSlot === 1);
  const baseX = isSword ? 0.210 : 0.672;
  const baseY = isSword ? -0.110 : -0.508;
  const baseRotX = isSword ? 0.260 : -1.440;
  const baseRotZ = isSword ? -0.360 : 0.104;

  hand.position.x = baseX;
  hand.position.y = baseY;

  if (isSwinging) {
    swordSwing -= delta * 2.2;
    if (swordSwing <= 0) {
      swordSwing = 0;
      isSwinging = false;
    }
    if (isSword) {
      const swingCurve = Math.sin(swordSwing * Math.PI);
      hand.rotation.x = baseRotX - swingCurve * 0.27;
      hand.rotation.z = baseRotZ + swingCurve * 0.27;
    } else {
      hand.rotation.x = baseRotX;
      hand.rotation.z = baseRotZ;
    }
  } else {
    hand.rotation.x = baseRotX;
    hand.rotation.z = baseRotZ;
  }
}
