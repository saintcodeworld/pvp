import * as THREE from 'three';

// ─── PICTURE MANAGER ─────────────────────────────────────────────────
// Allows picking up pixel art pictures from walls, moving them to other
// walls, and rotating them freely.
//
// Controls:
//   Right-click on a picture  → pick it up
//   Right-click on a wall     → place the held picture
//   R                         → rotate held picture 90°
//   Q                         → cancel (return picture to original spot)

const registeredPictures = []; // all THREE.Group picture objects
let heldPicture = null;
let heldOriginalPosition = new THREE.Vector3();
let heldOriginalRotation = new THREE.Euler();
let heldOriginalMaterials = new Map(); // mesh → original material
let manualRotation = 0; // accumulated manual rotation while holding

let camera = null;
let collisionBlks = [];
let museumGrp = null;

const raycaster = new THREE.Raycaster();
const screenCenter = new THREE.Vector2(0, 0);

// ─── INIT ────────────────────────────────────────────────────────────
export function initPictureManager(cam, colBlks, musGrp) {
  camera = cam;
  collisionBlks = colBlks;
  museumGrp = musGrp;
}

// ─── REGISTER ────────────────────────────────────────────────────────
export function registerPicture(group) {
  group.traverse(child => {
    if (child.isMesh) {
      child.userData.isPicture = true;
      child.userData.pictureGroup = group;
    }
  });
  registeredPictures.push(group);
}

// ─── STATE QUERIES ───────────────────────────────────────────────────
export function isHoldingPicture() {
  return heldPicture !== null;
}

// Returns the picture group the crosshair is hovering over (or null)
export function getHoveredPicture() {
  if (heldPicture || !camera) return null;

  raycaster.setFromCamera(screenCenter, camera);
  raycaster.far = 12;

  const meshes = [];
  registeredPictures.forEach(g => {
    g.traverse(c => { if (c.isMesh) meshes.push(c); });
  });

  const hits = raycaster.intersectObjects(meshes);
  if (hits.length > 0 && hits[0].object.userData.pictureGroup) {
    return hits[0].object.userData.pictureGroup;
  }
  return null;
}

// ─── PICK UP / PLACE (right-click handler) ───────────────────────────
export function handlePictureAction() {
  if (heldPicture) {
    placePicture();
  } else {
    pickupPicture();
  }
}

function pickupPicture() {
  if (!camera) return;

  raycaster.setFromCamera(screenCenter, camera);
  raycaster.far = 12;

  const meshes = [];
  registeredPictures.forEach(g => {
    g.traverse(c => { if (c.isMesh) meshes.push(c); });
  });

  const hits = raycaster.intersectObjects(meshes);
  if (hits.length === 0) return;

  const group = hits[0].object.userData.pictureGroup;
  if (!group) return;

  heldPicture = group;
  manualRotation = 0;
  heldOriginalPosition.copy(group.position);
  heldOriginalRotation.copy(group.rotation);
  heldOriginalMaterials.clear();

  // Make semi-transparent to indicate "held" state
  group.traverse(child => {
    if (child.isMesh && child.material) {
      heldOriginalMaterials.set(child, child.material);
      const cloned = child.material.clone();
      cloned.transparent = true;
      cloned.opacity = 0.5;
      child.material = cloned;
    }
  });
}

function placePicture() {
  if (!heldPicture || !camera) return;

  raycaster.setFromCamera(screenCenter, camera);
  raycaster.far = 15;

  const hits = raycaster.intersectObjects(collisionBlks);
  if (hits.length === 0) return;

  const hit = hits[0];
  const normal = hit.face.normal.clone();
  normal.transformDirection(hit.object.matrixWorld);

  // Offset picture slightly off the wall surface
  const pos = hit.point.clone().add(normal.clone().multiplyScalar(0.12));
  heldPicture.position.copy(pos);

  // Determine base facing from wall normal, then add manual rotation
  let baseY = 0;
  if (Math.abs(normal.x) > Math.abs(normal.z)) {
    baseY = normal.x > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    baseY = normal.z > 0 ? 0 : Math.PI;
  }
  heldPicture.rotation.set(0, baseY + manualRotation, 0);

  // Restore original materials (full opacity)
  restoreMaterials();
  heldPicture = null;
  manualRotation = 0;
}

// ─── ROTATE (R key) ─────────────────────────────────────────────────
export function rotatePicture() {
  if (!heldPicture) return;
  manualRotation += Math.PI / 2;
}

// ─── CANCEL (Q key) ─────────────────────────────────────────────────
export function cancelPickup() {
  if (!heldPicture) return;
  heldPicture.position.copy(heldOriginalPosition);
  heldPicture.rotation.copy(heldOriginalRotation);
  restoreMaterials();
  heldPicture = null;
  manualRotation = 0;
}

// ─── FRAME UPDATE (call every frame while holding) ───────────────────
export function updatePicturePreview() {
  if (!heldPicture || !camera) return;

  raycaster.setFromCamera(screenCenter, camera);
  raycaster.far = 15;

  const hits = raycaster.intersectObjects(collisionBlks);
  if (hits.length > 0) {
    const hit = hits[0];
    const normal = hit.face.normal.clone();
    normal.transformDirection(hit.object.matrixWorld);

    const pos = hit.point.clone().add(normal.clone().multiplyScalar(0.12));
    heldPicture.position.copy(pos);

    let baseY = 0;
    if (Math.abs(normal.x) > Math.abs(normal.z)) {
      baseY = normal.x > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      baseY = normal.z > 0 ? 0 : Math.PI;
    }
    heldPicture.rotation.set(0, baseY + manualRotation, 0);
  }
}

// ─── SAVE / LOAD (localStorage) ──────────────────────────────────
const STORAGE_KEY = 'pvp_wars_picture_layout';

export function savePictureLayout() {
  const data = registeredPictures.map((group, index) => ({
    index,
    px: group.position.x,
    py: group.position.y,
    pz: group.position.z,
    rx: group.rotation.x,
    ry: group.rotation.y,
    rz: group.rotation.z,
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  return data.length;
}

export function loadPictureLayout() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;

  try {
    const data = JSON.parse(raw);
    data.forEach(entry => {
      const group = registeredPictures[entry.index];
      if (!group) return;
      group.position.set(entry.px, entry.py, entry.pz);
      group.rotation.set(entry.rx, entry.ry, entry.rz);
    });
    return true;
  } catch (e) {
    console.warn('[PictureManager] Failed to load saved layout:', e);
    return false;
  }
}

export function resetPictureLayout() {
  localStorage.removeItem(STORAGE_KEY);
}

// ─── HELPERS ─────────────────────────────────────────────────────
function restoreMaterials() {
  if (!heldPicture) return;
  heldPicture.traverse(child => {
    if (child.isMesh && heldOriginalMaterials.has(child)) {
      child.material = heldOriginalMaterials.get(child);
    }
  });
  heldOriginalMaterials.clear();
}
