import * as THREE from 'three';

// ─── TEXTURE GENERATOR ─────────────────────────────────────────────
export function createPixelTexture(colors, size = 16) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ci = (y * size + x) % colors.length;
      const c = colors[ci];
      const variation = (Math.random() - 0.5) * 15;
      const r = Math.min(255, Math.max(0, c[0] + variation));
      const g = Math.min(255, Math.max(0, c[1] + variation));
      const b = Math.min(255, Math.max(0, c[2] + variation));
      ctx.fillStyle = `rgb(${r|0},${g|0},${b|0})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

export function makeNoiseTex(baseR, baseG, baseB, variation = 20, size = 16) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
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

export function makeBrickTexture(r, g, b) {
  const canvas = document.createElement('canvas');
  canvas.width = 16; canvas.height = 16;
  const ctx = canvas.getContext('2d');
  // fill base
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const v = (Math.random() - 0.5) * 15;
      ctx.fillStyle = `rgb(${(r+v)|0},${(g+v)|0},${(b+v)|0})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // mortar lines
  ctx.fillStyle = `rgb(${(r*0.6)|0},${(g*0.6)|0},${(b*0.6)|0})`;
  ctx.fillRect(0, 0, 16, 1);
  ctx.fillRect(0, 8, 16, 1);
  ctx.fillRect(0, 0, 1, 8);
  ctx.fillRect(8, 0, 1, 8);
  ctx.fillRect(4, 8, 1, 8);
  ctx.fillRect(12, 8, 1, 8);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

export function makeGoldBlockTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 16; canvas.height = 16;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const v = (Math.random() - 0.5) * 30;
      const bright = Math.sin(x * 0.8) * 10 + Math.sin(y * 0.8) * 10;
      ctx.fillStyle = `rgb(${(220+v+bright)|0},${(180+v+bright)|0},${(50+v)|0})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // border
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 15, 16, 1);
  ctx.fillRect(0, 0, 1, 16); ctx.fillRect(15, 0, 1, 16);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

export function makeRedCarpetTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 16; canvas.height = 16;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const v = (Math.random() - 0.5) * 12;
      const stripe = Math.sin(x * 1.2 + y * 0.3) * 8;
      ctx.fillStyle = `rgb(${(140+v+stripe)|0},${(20+v)|0},${(25+v)|0})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

// ─── MATERIALS ──────────────────────────────────────────────────────
export const materials = {};

export function initMaterials() {
  materials.stone = new THREE.MeshLambertMaterial({ map: makeNoiseTex(120, 120, 120) });
  materials.stoneBrick = new THREE.MeshLambertMaterial({ map: makeBrickTexture(130, 130, 130) });
  materials.darkBrick = new THREE.MeshLambertMaterial({ map: makeBrickTexture(60, 50, 50) });
  materials.floor = new THREE.MeshLambertMaterial({ map: makeNoiseTex(45, 40, 35) });
  materials.wood = new THREE.MeshLambertMaterial({ map: makeNoiseTex(100, 70, 40, 15) });
  materials.darkWood = new THREE.MeshLambertMaterial({ map: makeNoiseTex(60, 40, 25, 12) });
  materials.gold = new THREE.MeshLambertMaterial({ map: makeGoldBlockTexture() });
  materials.redCarpet = new THREE.MeshLambertMaterial({ map: makeRedCarpetTexture() });
  materials.glass = new THREE.MeshLambertMaterial({ color: 0x88ccee, transparent: true, opacity: 0.3 });
  materials.obsidian = new THREE.MeshLambertMaterial({ map: makeNoiseTex(20, 15, 30, 8) });
  materials.redWool = new THREE.MeshLambertMaterial({ map: makeNoiseTex(160, 30, 30, 10) });
  materials.blueWool = new THREE.MeshLambertMaterial({ map: makeNoiseTex(30, 50, 160, 10) });
  materials.whiteWool = new THREE.MeshLambertMaterial({ map: makeNoiseTex(220, 220, 220, 8) });
  materials.blackWool = new THREE.MeshLambertMaterial({ map: makeNoiseTex(25, 25, 25, 5) });
  materials.quartz = new THREE.MeshLambertMaterial({ map: makeNoiseTex(230, 225, 220, 6) });
  materials.sandstone = new THREE.MeshLambertMaterial({ map: makeNoiseTex(210, 190, 140, 12) });
  materials.glowstone = new THREE.MeshBasicMaterial({ map: makeNoiseTex(255, 230, 140, 15) });
  materials.lava = new THREE.MeshBasicMaterial({ map: makeNoiseTex(255, 100, 20, 30) });
  materials.greenWool = new THREE.MeshLambertMaterial({ map: makeNoiseTex(30, 120, 30, 10) });
  materials.brownWool = new THREE.MeshLambertMaterial({ map: makeNoiseTex(120, 80, 40, 10) });
  materials.ironBlock = new THREE.MeshLambertMaterial({ map: makeNoiseTex(190, 190, 190, 8) });
  materials.diamondBlock = new THREE.MeshLambertMaterial({ map: makeNoiseTex(80, 220, 230, 12) });
  materials.emeraldBlock = new THREE.MeshLambertMaterial({ map: makeNoiseTex(50, 200, 80, 12) });
  materials.purpleWool = new THREE.MeshLambertMaterial({ map: makeNoiseTex(100, 30, 160, 10) });
  materials.portalPurple = new THREE.MeshBasicMaterial({ map: makeNoiseTex(140, 50, 200, 25), transparent: true, opacity: 0.7 });
}

// ─── PIXEL ART DATA ─────────────────────────────────────────────────
export const pixelArt = {
  // Pump.fun capsule logo (green & white, 16x16)
  pumpCapsule: (() => {
    const _ = null, G = '#00cc66', W = '#ffffff', L = '#66ffaa', D = '#009944', B = '#222';
    return [
      [_,_,_,_,_,G,G,G,G,G,G,_,_,_,_,_],
      [_,_,_,_,G,G,L,L,L,L,G,G,_,_,_,_],
      [_,_,_,G,G,L,L,L,L,L,L,G,G,_,_,_],
      [_,_,G,G,L,L,W,W,W,W,L,L,G,G,_,_],
      [_,_,G,L,L,W,W,W,W,W,W,L,L,G,_,_],
      [_,_,G,L,W,W,W,W,W,W,W,W,L,G,_,_],
      [_,_,G,G,D,D,D,D,D,D,D,D,G,G,_,_],
      [_,_,G,G,B,B,B,B,B,B,B,B,G,G,_,_],
      [_,_,G,D,G,G,G,G,G,G,G,G,D,G,_,_],
      [_,_,G,D,G,G,G,G,G,G,G,G,D,G,_,_],
      [_,_,G,D,G,G,G,G,G,G,G,G,D,G,_,_],
      [_,_,G,D,D,G,G,G,G,G,G,D,D,G,_,_],
      [_,_,_,G,D,D,G,G,G,G,D,D,G,_,_,_],
      [_,_,_,_,G,G,D,D,D,D,G,G,_,_,_,_],
      [_,_,_,_,_,G,G,G,G,G,G,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    ];
  })(),

  // Diamond hands (crypto meme, 16x16)
  diamondHands: (() => {
    const _ = null, D = '#44ccff', L = '#88eeff', W = '#fff', S = '#d4a574', B = '#222', K = '#b8916a';
    return [
      [_,_,_,_,_,_,D,D,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,D,L,L,D,_,_,_,_,_,_,_],
      [_,_,_,_,D,L,W,W,L,D,_,_,_,_,_,_],
      [_,_,_,D,L,W,W,W,W,L,D,_,_,_,_,_],
      [_,_,D,L,W,W,L,L,W,W,L,D,_,_,_,_],
      [_,_,D,D,L,L,D,D,L,L,D,D,_,_,_,_],
      [_,_,_,D,D,D,_,_,D,D,D,_,_,_,_,_],
      [_,_,_,_,S,S,S,_,_,S,S,_,_,_,_,_],
      [_,_,_,S,S,S,S,S,S,S,S,S,_,_,_,_],
      [_,_,S,S,K,S,K,S,K,S,S,S,S,_,_,_],
      [_,_,S,S,S,S,S,S,S,S,S,S,S,_,_,_],
      [_,_,_,S,S,S,S,S,S,S,S,S,_,_,_,_],
      [_,_,_,_,S,S,S,S,S,S,S,_,_,_,_,_],
      [_,_,_,_,_,S,S,S,S,S,_,_,_,_,_,_],
      [_,_,_,_,_,_,S,S,S,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    ];
  })(),

  // Solana logo (purple gradient, 16x16)
  solanaLogo: (() => {
    const _ = null, P = '#9945ff', L = '#14f195', D = '#7b3fe4', W = '#fff', B = '#222';
    return [
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,P,P,P,P,P,P,P,P,P,P,P,P,P,P,_],
      [_,_,P,D,D,D,D,D,D,D,D,D,D,P,_,_],
      [_,_,_,P,P,P,P,P,P,P,P,P,P,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,L,L,L,L,L,L,L,L,L,L,L,L,_,_],
      [_,L,L,P,P,P,P,P,P,P,P,P,L,_,_,_],
      [L,L,P,P,P,P,P,P,P,P,P,L,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,P,P,P,P,P,P,P,P,P,P,P,P,P,P,_],
      [_,_,P,L,L,L,L,L,L,L,L,L,L,P,_,_],
      [_,_,_,P,P,P,P,P,P,P,P,P,P,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    ];
  })(),

  // Trading chart (green candles, 16x16)
  tradingChart: (() => {
    const _ = null, G = '#00cc44', R = '#cc2222', B = '#222', D = '#333', W = '#555';
    return [
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,G,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,G,G,_],
      [_,_,_,_,_,_,_,_,_,_,_,G,_,G,G,_],
      [_,_,_,_,_,_,_,_,_,_,G,G,_,G,G,_],
      [_,_,_,_,_,_,R,_,_,G,G,G,_,G,G,_],
      [_,_,_,_,_,R,R,_,G,G,G,G,_,G,G,_],
      [_,_,G,_,R,R,R,_,G,G,_,G,_,G,G,_],
      [_,G,G,_,R,R,_,G,G,_,_,G,_,G,_,_],
      [_,G,G,_,R,_,G,G,_,_,_,_,_,_,_,_],
      [_,G,_,_,_,G,G,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,G,G,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,G,G,_,_,_,_,_,_,_,_,_,_,_],
      [B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B],
      [D,D,D,D,D,D,D,D,D,D,D,D,D,D,D,D],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    ];
  })(),

  // Token coin (gold memecoin, 16x16)
  tokenCoin: (() => {
    const _ = null, G = '#ffd700', D = '#b8860b', B = '#8B6914', W = '#fff', K = '#222';
    return [
      [_,_,_,_,_,G,G,G,G,G,G,_,_,_,_,_],
      [_,_,_,G,G,G,G,G,G,G,G,G,G,_,_,_],
      [_,_,G,G,G,G,G,G,G,G,G,G,G,G,_,_],
      [_,G,G,G,G,G,D,D,D,D,G,G,G,G,G,_],
      [_,G,G,G,G,D,D,K,K,D,D,G,G,G,G,_],
      [G,G,G,G,D,D,K,K,K,K,D,D,G,G,G,G],
      [G,G,G,G,D,K,K,K,_,_,D,D,G,G,G,G],
      [G,G,G,G,D,K,K,K,K,_,D,D,G,G,G,G],
      [G,G,G,G,D,D,_,K,K,K,D,D,G,G,G,G],
      [G,G,G,G,D,D,_,_,K,K,D,D,G,G,G,G],
      [_,G,G,G,G,D,D,K,K,D,D,G,G,G,G,_],
      [_,G,G,G,G,G,D,D,D,D,G,G,G,G,G,_],
      [_,_,G,G,G,G,G,G,G,G,G,G,G,G,_,_],
      [_,_,_,G,G,G,G,G,G,G,G,G,G,_,_,_],
      [_,_,_,_,_,G,G,G,G,G,G,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    ];
  })(),

  // Rocket to the moon (crypto meme, 16x16)
  rocketMoon: (() => {
    const _ = null, W = '#fff', R = '#cc2222', O = '#ff6622', Y = '#ffcc00', G = '#888', B = '#222', M = '#ffd700';
    return [
      [_,_,_,_,_,_,_,W,W,_,_,_,_,M,M,_],
      [_,_,_,_,_,_,W,W,W,W,_,_,M,M,M,M],
      [_,_,_,_,_,W,G,W,W,G,W,_,M,M,M,M],
      [_,_,_,_,_,W,W,B,B,W,W,_,_,M,M,_],
      [_,_,_,_,_,W,W,W,W,W,W,_,_,_,_,_],
      [_,_,_,_,R,W,W,W,W,W,W,R,_,_,_,_],
      [_,_,_,_,R,R,W,W,W,W,R,R,_,_,_,_],
      [_,_,_,_,_,R,G,G,G,G,R,_,_,_,_,_],
      [_,_,_,_,_,R,G,G,G,G,R,_,_,_,_,_],
      [_,_,_,_,_,R,R,R,R,R,R,_,_,_,_,_],
      [_,_,_,_,R,R,_,R,R,_,R,R,_,_,_,_],
      [_,_,_,R,R,_,_,Y,Y,_,_,R,R,_,_,_],
      [_,_,_,_,_,_,Y,O,O,Y,_,_,_,_,_,_],
      [_,_,_,_,_,_,O,R,R,O,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,R,R,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    ];
  })(),

  // Treasure chest (loot/rewards, 16x16)
  treasureChest: (() => {
    const _ = null, B = '#5c3a1e', D = '#3d2510', G = '#ffd700', Y = '#f5a623', W = '#222', K = '#8B6914';
    return [
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,B,B,B,B,B,B,B,B,B,B,_,_,_],
      [_,_,B,B,D,D,D,D,D,D,D,D,B,B,_,_],
      [_,_,B,D,D,D,D,D,D,D,D,D,D,B,_,_],
      [_,G,G,G,G,G,G,G,G,G,G,G,G,G,G,_],
      [_,B,B,B,B,B,G,Y,Y,G,B,B,B,B,B,_],
      [_,B,D,D,D,B,G,G,G,G,B,D,D,D,B,_],
      [_,B,D,G,D,B,B,B,B,B,B,D,G,D,B,_],
      [_,B,D,D,D,D,D,D,D,D,D,D,D,D,B,_],
      [_,B,D,D,D,D,D,D,D,D,D,D,D,D,B,_],
      [_,B,B,B,B,B,B,B,B,B,B,B,B,B,B,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    ];
  })(),

  fireIcon: (() => {
    const _ = null, R = '#cc2222', O = '#ee6622', Y = '#ffcc00', W = '#fff';
    return [
      [_,_,_,_,_,_,_,Y,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,Y,Y,Y,_,_,_,_,_,_,_],
      [_,_,_,_,_,Y,Y,Y,Y,_,_,_,_,_,_,_],
      [_,_,_,_,_,Y,O,Y,Y,Y,_,_,_,_,_,_],
      [_,_,_,_,Y,O,O,O,Y,Y,_,_,_,_,_,_],
      [_,_,_,Y,Y,O,O,O,O,Y,Y,_,_,_,_,_],
      [_,_,_,Y,O,R,O,O,R,O,Y,_,_,_,_,_],
      [_,_,Y,O,O,R,R,R,R,O,O,Y,_,_,_,_],
      [_,_,Y,O,R,R,R,R,R,R,O,Y,_,_,_,_],
      [_,Y,O,O,R,R,R,R,R,R,O,O,Y,_,_,_],
      [_,Y,O,R,R,R,R,R,R,R,R,O,Y,_,_,_],
      [_,Y,O,R,R,R,R,R,R,R,R,O,Y,_,_,_],
      [_,_,Y,O,R,R,R,R,R,R,O,Y,_,_,_,_],
      [_,_,_,Y,O,O,R,R,O,O,Y,_,_,_,_,_],
      [_,_,_,_,Y,Y,O,O,Y,Y,_,_,_,_,_,_],
      [_,_,_,_,_,Y,Y,Y,Y,_,_,_,_,_,_,_],
    ];
  })(),

  // Blockchain blocks (chain links, 16x16)
  blockchain: (() => {
    const _ = null, P = '#9933ff', L = '#cc66ff', D = '#6600aa', W = '#fff', G = '#888';
    return [
      [_,_,P,P,P,P,_,_,_,_,_,_,_,_,_,_],
      [_,P,P,L,L,P,P,_,_,_,_,_,_,_,_,_],
      [_,P,L,W,W,L,P,_,_,_,_,_,_,_,_,_],
      [_,P,P,L,L,P,P,_,_,_,_,_,_,_,_,_],
      [_,_,P,P,P,P,G,G,G,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,G,_,G,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,P,P,P,P,P,_,_,_,_,_],
      [_,_,_,_,_,P,P,L,L,P,P,_,_,_,_,_],
      [_,_,_,_,_,P,L,W,W,L,P,_,_,_,_,_],
      [_,_,_,_,_,P,P,L,L,P,P,_,_,_,_,_],
      [_,_,_,_,_,_,P,P,P,P,G,G,G,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,G,_,G,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,P,P,P,P,P,_],
      [_,_,_,_,_,_,_,_,_,P,P,L,L,P,P,_],
      [_,_,_,_,_,_,_,_,_,P,L,W,W,L,P,_],
      [_,_,_,_,_,_,_,_,_,P,P,P,P,P,P,_],
    ];
  })(),

  fistIcon: (() => {
    const _ = null, S = '#d4a574', D = '#b8916a', B = '#222';
    return [
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,S,S,S,_,_,_,_,_,_,_,_],
      [_,_,_,_,S,S,S,S,S,_,_,_,_,_,_,_],
      [_,_,_,S,S,S,S,S,S,S,S,_,_,_,_,_],
      [_,_,S,S,D,S,D,S,D,S,S,S,_,_,_,_],
      [_,_,S,S,S,S,S,S,S,S,S,S,_,_,_,_],
      [_,S,S,S,D,S,D,S,D,S,S,S,S,_,_,_],
      [_,S,S,S,S,S,S,S,S,S,S,S,S,_,_,_],
      [_,_,S,S,S,S,S,S,S,S,S,S,_,_,_,_],
      [_,_,_,S,S,S,S,S,S,S,S,_,_,_,_,_],
      [_,_,_,_,S,S,S,S,S,S,_,_,_,_,_,_],
      [_,_,_,_,_,S,S,S,S,S,_,_,_,_,_,_],
      [_,_,_,_,_,_,S,S,S,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,S,S,S,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,S,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    ];
  })(),

  // Doge coin meme face (16x16)
  dogeCoin: (() => {
    const _ = null, Y = '#f5c542', D = '#c49a2a', B = '#222', W = '#fff', N = '#333', T = '#e8b830';
    return [
      [_,_,_,_,_,Y,Y,Y,Y,Y,Y,_,_,_,_,_],
      [_,_,_,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,_,_,_],
      [_,_,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,_,_],
      [_,Y,Y,Y,Y,T,T,Y,Y,T,T,Y,Y,Y,Y,_],
      [_,Y,Y,Y,T,B,B,T,T,B,B,T,Y,Y,Y,_],
      [Y,Y,Y,Y,T,W,B,T,T,W,B,T,Y,Y,Y,Y],
      [Y,Y,Y,Y,Y,T,T,Y,Y,T,T,Y,Y,Y,Y,Y],
      [Y,Y,Y,Y,Y,Y,Y,N,N,Y,Y,Y,Y,Y,Y,Y],
      [Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y],
      [Y,Y,Y,T,T,T,T,T,T,T,T,T,T,Y,Y,Y],
      [_,Y,Y,Y,Y,D,D,Y,Y,D,D,Y,Y,Y,Y,_],
      [_,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,_],
      [_,_,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,_,_],
      [_,_,_,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,_,_,_],
      [_,_,_,_,_,D,D,D,D,D,D,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    ];
  })(),

  // Candlestick chart (bull candles, 16x16)
  candleChart: (() => {
    const _ = null, G = '#00cc44', R = '#cc2222', D = '#006622', K = '#661111', W = '#333';
    return [
      [_,_,_,_,_,_,_,_,_,_,_,_,_,G,_,_],
      [_,_,_,_,_,_,R,_,_,_,_,_,G,G,G,_],
      [_,_,_,_,_,R,R,R,_,_,G,_,G,G,G,_],
      [_,_,G,_,_,R,R,R,_,G,G,_,G,G,G,_],
      [_,G,G,G,_,R,R,R,_,G,G,G,_,G,_,_],
      [_,G,G,G,_,K,R,K,_,G,G,G,_,_,_,_],
      [_,G,G,G,_,_,K,_,_,G,G,G,_,_,_,_],
      [_,_,G,_,_,_,_,_,_,D,G,D,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,D,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    ];
  })(),

  // Pepe the frog face (meme, 16x16)
  pepeFrog: (() => {
    const _ = null, G = '#4a8c3f', L = '#6abf5e', D = '#2d6625', W = '#fff', B = '#222', R = '#cc3333';
    return [
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,G,G,G,G,G,G,G,G,_,_,_,_],
      [_,_,_,G,G,L,L,G,G,L,L,G,G,_,_,_],
      [_,_,G,G,W,W,L,G,G,W,W,L,G,G,_,_],
      [_,_,G,W,W,B,L,G,G,W,B,L,G,G,_,_],
      [_,_,G,G,L,L,L,G,G,L,L,L,G,G,_,_],
      [_,G,G,G,G,G,G,G,G,G,G,G,G,G,G,_],
      [_,G,L,L,L,L,L,L,L,L,L,L,L,L,G,_],
      [_,G,L,R,R,R,R,R,R,R,R,R,R,L,G,_],
      [_,_,G,G,L,L,L,L,L,L,L,L,G,G,_,_],
      [_,_,_,G,G,G,G,G,G,G,G,G,G,_,_,_],
      [_,_,_,_,G,G,_,_,_,_,G,G,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    ];
  })(),

  trophy: (() => {
    const _ = null, G = '#ffd700', D = '#b8860b', B = '#8B6914', W = '#fff';
    return [
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,G,G,G,G,G,G,_,_,_,_,_],
      [_,_,_,_,G,G,W,W,W,W,G,G,_,_,_,_],
      [_,_,G,G,G,G,W,W,W,W,G,G,G,G,_,_],
      [_,_,G,_,G,G,W,W,W,W,G,G,_,G,_,_],
      [_,_,G,_,G,G,G,G,G,G,G,G,_,G,_,_],
      [_,_,G,G,_,G,G,G,G,G,G,_,G,G,_,_],
      [_,_,_,_,_,_,G,G,G,G,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,G,G,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,D,D,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,D,D,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,D,D,D,D,_,_,_,_,_,_],
      [_,_,_,_,_,B,B,B,B,B,B,_,_,_,_,_],
      [_,_,_,_,B,B,B,B,B,B,B,B,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    ];
  })(),

  yinYang: (() => {
    const _ = null, B = '#222', W = '#eee', G = '#888';
    return [
      [_,_,_,_,_,G,G,G,G,G,G,_,_,_,_,_],
      [_,_,_,G,G,G,W,W,W,W,G,G,G,_,_,_],
      [_,_,G,W,W,W,W,W,W,W,W,B,G,G,_,_],
      [_,G,W,W,W,W,W,W,W,W,B,B,B,G,_,_],
      [_,G,W,W,W,W,B,W,W,B,B,B,B,G,_,_],
      [G,W,W,W,W,W,B,W,B,B,B,B,B,B,G,_],
      [G,W,W,W,W,W,W,W,B,B,B,B,B,B,G,_],
      [G,W,W,W,W,W,W,W,B,B,B,B,B,B,G,_],
      [G,W,W,W,W,W,W,B,B,B,B,B,B,B,G,_],
      [G,B,B,B,B,B,B,B,B,B,B,B,B,B,G,_],
      [G,B,B,B,B,B,W,B,B,B,B,B,B,G,_,_],
      [_,G,B,B,B,B,W,B,W,W,W,W,G,G,_,_],
      [_,G,B,B,B,B,B,B,W,W,W,W,G,_,_,_],
      [_,_,G,B,B,B,B,W,W,W,W,G,G,_,_,_],
      [_,_,_,G,G,G,G,W,W,G,G,G,_,_,_,_],
      [_,_,_,_,_,G,G,G,G,G,_,_,_,_,_,_],
    ];
  })(),

  // Skull crossbones (PVP death icon, 16x16)
  skullPvp: (() => {
    const _ = null, W = '#eee', B = '#222', G = '#888', D = '#555';
    return [
      [_,_,_,_,_,W,W,W,W,W,W,_,_,_,_,_],
      [_,_,_,W,W,W,W,W,W,W,W,W,W,_,_,_],
      [_,_,W,W,W,W,W,W,W,W,W,W,W,W,_,_],
      [_,W,W,W,W,W,W,W,W,W,W,W,W,W,W,_],
      [_,W,W,W,B,B,W,W,W,W,B,B,W,W,W,_],
      [_,W,W,W,B,B,W,W,W,W,B,B,W,W,W,_],
      [_,W,W,W,W,W,W,G,G,W,W,W,W,W,W,_],
      [_,_,W,W,W,W,W,W,W,W,W,W,W,W,_,_],
      [_,_,_,W,W,B,W,B,B,W,B,W,W,_,_,_],
      [_,_,_,_,W,W,W,W,W,W,W,_,_,_,_,_],
      [_,_,D,D,_,_,_,_,_,_,_,_,D,D,_,_],
      [_,D,D,D,D,_,_,_,_,_,_,D,D,D,D,_],
      [D,D,_,D,D,D,_,_,_,_,D,D,D,_,D,D],
      [_,_,_,_,D,D,D,D,D,D,D,D,_,_,_,_],
      [_,_,_,_,_,D,D,_,_,D,D,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    ];
  })(),

  // Memecoin warrior (PVP character with sword, 16x16)
  pvpWarrior: (() => {
    const _ = null, P = '#9933ff', L = '#cc66ff', G = '#ffd700', W = '#ccc', B = '#222', S = '#d4a574', R = '#cc2222';
    return [
      [_,_,_,_,_,_,_,_,_,_,_,_,_,W,W,_],
      [_,_,_,_,_,_,P,P,P,P,_,_,W,W,_,_],
      [_,_,_,_,_,P,P,P,P,P,P,W,W,_,_,_],
      [_,_,_,_,_,S,S,B,S,B,S,W,_,_,_,_],
      [_,_,_,_,_,S,S,S,S,S,S,_,_,_,_,_],
      [_,_,_,_,_,_,S,S,S,S,_,_,_,_,_,_],
      [_,_,_,_,_,P,P,P,P,P,P,_,_,_,_,_],
      [_,_,_,_,P,P,P,G,G,P,P,P,_,_,_,_],
      [_,_,_,S,P,P,P,P,P,P,P,P,S,_,_,_],
      [_,_,_,_,_,P,P,P,P,P,P,_,_,_,_,_],
      [_,_,_,_,_,B,B,_,B,B,_,_,_,_,_,_],
      [_,_,_,_,_,B,B,_,B,B,_,_,_,_,_,_],
      [_,_,_,_,_,B,B,_,B,B,_,_,_,_,_,_],
      [_,_,_,_,_,L,L,_,L,L,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    ];
  })(),

  // Lightning bolt (power/speed, 16x16)
  lightning: (() => {
    const _ = null, Y = '#ffcc00', O = '#ff9900', W = '#fff', D = '#cc8800';
    return [
      [_,_,_,_,_,_,_,_,_,Y,Y,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,Y,Y,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,Y,Y,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,Y,Y,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,Y,Y,O,_,_,_,_,_,_,_,_],
      [_,_,_,_,Y,Y,O,O,_,_,_,_,_,_,_,_],
      [_,_,_,Y,Y,Y,Y,Y,Y,Y,Y,_,_,_,_,_],
      [_,_,_,O,O,O,O,Y,Y,Y,_,_,_,_,_,_],
      [_,_,_,_,_,_,Y,Y,O,_,_,_,_,_,_,_],
      [_,_,_,_,_,Y,Y,O,_,_,_,_,_,_,_,_],
      [_,_,_,_,Y,Y,O,_,_,_,_,_,_,_,_,_],
      [_,_,_,Y,Y,O,_,_,_,_,_,_,_,_,_,_],
      [_,_,Y,Y,O,_,_,_,_,_,_,_,_,_,_,_],
      [_,Y,Y,O,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,Y,O,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    ];
  })(),

  // Pickaxe (mining/crypto mining, 16x16)
  pickaxe: (() => {
    const _ = null, B = '#5c3a1e', D = '#3d2510', G = '#888', L = '#ccc', W = '#aaa';
    return [
      [_,_,_,_,_,_,_,_,_,_,_,G,L,L,_,_],
      [_,_,_,_,_,_,_,_,_,_,G,G,L,_,_,_],
      [_,_,_,_,_,_,_,_,_,G,G,W,_,_,_,_],
      [_,_,_,_,_,_,_,_,G,G,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,G,G,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,G,G,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,B,B,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,B,B,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,B,B,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,B,B,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,B,B,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [B,B,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [B,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    ];
  })(),

  // Moon (to the moon meme, 16x16)
  moonIcon: (() => {
    const _ = null, Y = '#ffd700', W = '#fff8dc', L = '#ffe680', D = '#ccaa00', G = '#b8960a';
    return [
      [_,_,_,_,_,Y,Y,Y,Y,Y,Y,_,_,_,_,_],
      [_,_,_,Y,Y,Y,L,L,L,L,Y,Y,Y,_,_,_],
      [_,_,Y,Y,L,L,W,W,L,L,L,L,Y,Y,_,_],
      [_,Y,Y,L,W,W,W,W,L,L,L,L,L,Y,Y,_],
      [_,Y,L,W,W,W,L,L,D,L,L,L,L,L,Y,_],
      [Y,Y,L,W,W,L,L,L,L,L,D,L,L,L,Y,Y],
      [Y,L,L,L,L,L,D,L,L,L,L,L,L,L,L,Y],
      [Y,L,L,L,D,L,L,L,L,L,L,D,L,L,L,Y],
      [Y,L,L,L,L,L,L,L,D,L,L,L,L,L,L,Y],
      [Y,Y,L,L,L,L,L,L,L,L,L,L,L,L,Y,Y],
      [_,Y,L,L,L,D,L,L,L,D,L,L,L,L,Y,_],
      [_,Y,Y,L,L,L,L,L,L,L,L,L,L,Y,Y,_],
      [_,_,Y,Y,L,L,L,L,L,L,L,L,Y,Y,_,_],
      [_,_,_,Y,Y,Y,L,L,L,L,Y,Y,Y,_,_,_],
      [_,_,_,_,_,Y,Y,Y,Y,Y,Y,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    ];
  })(),

  // PVP WARS sword icon (16x16)
  pvpSwords: (() => {
    const _ = null, S = '#ccc', W = '#fff', G = '#ffd700', R = '#cc2222', P = '#9933ff';
    return [
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,W,_],
      [W,_,_,_,_,_,_,_,_,_,_,_,_,W,S,_],
      [S,W,_,_,_,_,_,_,_,_,_,_,W,S,_,_],
      [_,S,W,_,_,_,_,_,_,_,_,W,S,_,_,_],
      [_,_,S,W,_,_,_,_,_,_,W,S,_,_,_,_],
      [_,_,_,S,W,_,_,_,_,W,S,_,_,_,_,_],
      [_,_,_,_,S,W,_,_,W,S,_,_,_,_,_,_],
      [_,_,_,_,_,G,G,G,G,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,R,R,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,R,P,P,R,_,_,_,_,_,_,_],
      [_,_,_,_,R,P,_,_,P,R,_,_,_,_,_,_],
      [_,_,_,R,P,_,_,_,_,P,R,_,_,_,_,_],
      [_,_,_,P,_,_,_,_,_,_,P,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    ];
  })(),
};
