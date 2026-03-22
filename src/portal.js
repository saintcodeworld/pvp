import * as THREE from 'three';
import { materials, pixelArt } from './textures.js';
import { placeBlock, createWallArt, createPixelArtPicture, createExhibitMarker, interactables, billboardLabels, museumGroup } from './museum.js';

let scene;
let portalAnimatedBlocks = [];

export function setPortalScene(s) {
  scene = s;
}

// ─── PVP WARS PORTAL (replaces Sarcophagus at center-north) ────────
export function createPVPPortal() {
  const cx = -1; // center x
  const cz = 22; // center z (north end of museum)

  // ── Gold + obsidian platform ──
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      placeBlock(cx + dx, 0.01, cz + dz, materials.gold, false);
      placeBlock(cx + dx, 1, cz + dz, materials.obsidian);
    }
  }

  // ── Nether-style portal frame (obsidian, 5 wide x 7 tall) ──
  // Bottom row
  for (let dx = -2; dx <= 2; dx++) {
    placeBlock(cx + dx, 2, cz, materials.obsidian);
  }
  // Top row
  for (let dx = -2; dx <= 2; dx++) {
    placeBlock(cx + dx, 8, cz, materials.obsidian);
  }
  // Left column
  for (let y = 2; y <= 8; y++) {
    placeBlock(cx - 2, y, cz, materials.obsidian);
  }
  // Right column
  for (let y = 2; y <= 8; y++) {
    placeBlock(cx + 2, y, cz, materials.obsidian);
  }

  // ── Purple portal interior (shimmering animated blocks) ──
  for (let dx = -1; dx <= 1; dx++) {
    for (let y = 3; y <= 7; y++) {
      const portalGeo = new THREE.BoxGeometry(0.95, 0.95, 0.3);
      const portalMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.55 + Math.random() * 0.15, 0.1, 0.85 + Math.random() * 0.15),
        transparent: true,
        opacity: 0.6 + Math.random() * 0.2,
      });
      const portalBlock = new THREE.Mesh(portalGeo, portalMat);
      portalBlock.position.set(cx + dx + 0.5, y + 0.5, cz + 0.5);
      museumGroup.add(portalBlock);
      portalAnimatedBlocks.push({
        mesh: portalBlock,
        baseOpacity: 0.5 + Math.random() * 0.3,
        phase: Math.random() * Math.PI * 2,
        speed: 1.5 + Math.random() * 1.5,
      });
    }
  }

  // ── Corner accent pillars with glowstone ──
  const pillarOffsets = [[-3, -3], [3, -3], [-3, 3], [3, 3]];
  pillarOffsets.forEach(([dx, dz]) => {
    for (let y = 1; y <= 6; y++) {
      const mat = y === 6 ? materials.glowstone : (y <= 2 ? materials.obsidian : materials.purpleWool);
      placeBlock(cx + dx, y, cz + dz, mat);
    }
  });

  // ── Lava moat (decorative) ──
  for (let dx = -4; dx <= 4; dx++) {
    placeBlock(cx + dx, 0, cz - 4, materials.lava, false);
    placeBlock(cx + dx, 0, cz + 4, materials.lava, false);
  }
  for (let dz = -3; dz <= 3; dz++) {
    placeBlock(cx - 4, 0, cz + dz, materials.lava, false);
    placeBlock(cx + 4, 0, cz + dz, materials.lava, false);
  }

  // ── Big "PVP WARS" text above portal ──
  createWallArt(cx + 0.5, 10, cz - 0.5, "PVP WARS", "#cc44ff", 6, 1.5, 'south');
  createWallArt(cx + 0.5, 8.8, cz - 0.5, "ENTER THE ARENA", "#ffcc00", 5, 0.6, 'south');

  // ── Crossed swords pixel art icon above portal ──
  createPixelArtPicture(cx + 0.5, 11.5, cz - 0.5, pixelArt.pvpSwords, 2.5, 'south', 0x6600cc);

  // ── Side banners ──
  for (let y = 3; y <= 7; y++) {
    placeBlock(cx - 3, y, cz, y % 2 === 0 ? materials.purpleWool : materials.gold);
    placeBlock(cx + 3, y, cz, y % 2 === 0 ? materials.purpleWool : materials.gold);
  }

  // ── "Press E" labels on front and back ──
  createWallArt(cx + 0.5, 2.5, cz - 3.5, "[ Press E to Enter ]", "#f5a623", 4, 0.5, 'south');
  createWallArt(cx + 0.5, 2.5, cz + 3.5, "[ Press E to Enter ]", "#f5a623", 4, 0.5, 'north');

  // ── Portal interactable marker ──
  const markerGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xcc44ff, transparent: true, opacity: 0.8 });
  const marker = new THREE.Mesh(markerGeo, markerMat);
  marker.position.set(cx + 0.5, 3.5, cz - 3.5);
  museumGroup.add(marker);

  // Floating label
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, 512, 64);
  ctx.fillStyle = '#cc44ff';
  ctx.font = 'bold 28px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText('[ PVP WARS PORTAL ]', 256, 42);
  const labelTex = new THREE.CanvasTexture(canvas);
  labelTex.magFilter = THREE.NearestFilter;
  const labelGeo = new THREE.PlaneGeometry(3.5, 0.4);
  const labelMeshMat = new THREE.MeshBasicMaterial({ map: labelTex, transparent: true });
  const labelMesh = new THREE.Mesh(labelGeo, labelMeshMat);
  labelMesh.position.set(cx + 0.5, 5, cz - 3.5);
  museumGroup.add(labelMesh);
  billboardLabels.push(labelMesh);

  interactables.push({
    mesh: marker,
    key: 'pvp_portal',
    label: '[ PVP WARS PORTAL ]',
    position: new THREE.Vector3(cx + 0.5, 3.5, cz - 3.5)
  });
}

// ─── PORTAL ANIMATION (call each frame) ─────────────────────────────
export function updatePortalAnimation(time) {
  portalAnimatedBlocks.forEach(block => {
    const opacity = block.baseOpacity + Math.sin(time * block.speed + block.phase) * 0.2;
    block.mesh.material.opacity = Math.max(0.3, Math.min(0.9, opacity));
    // Slight color shimmer
    const hue = 0.75 + Math.sin(time * 0.5 + block.phase) * 0.05;
    block.mesh.material.color.setHSL(hue, 0.8, 0.5);
  });
}
