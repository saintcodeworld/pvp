import * as THREE from 'three';
import { materials, pixelArt } from './textures.js';

// ─── SHARED STATE ───────────────────────────────────────────────────
export const blockSize = 1;
export const blockGeo = new THREE.BoxGeometry(blockSize, blockSize, blockSize);
export const collisionBlocks = [];
export const interactables = [];
export const billboardLabels = [];

let scene;
export let museumGroup = null;

export function setMuseumScene(s) {
  scene = s;
  museumGroup = new THREE.Group();
  scene.add(museumGroup);
}

// ─── EXHIBIT DATA ───────────────────────────────────────────────────
export const exhibitData = {
  bio_early: {
    title: "The Genesis Block",
    body: `<p>It all started with a single block — the <strong>Genesis Block</strong>. In the beginning, there was nothing but an empty chain and a dream: to build a decentralized arena where warriors fight for onchain glory.</p>
<p>PVP WARS was born from the collision of two worlds — the pixelated battlefields of Minecraft and the wild frontier of <strong>Solana memecoins</strong>. A place where your sword arm matters as much as your diamond hands.</p>
<p>The first block was mined, the first token was minted, and the arena gates opened. Every warrior who enters carries the spirit of the Genesis Block — the belief that anyone can rise from nothing to become a legend onchain.</p>`
  },
  bio_martial: {
    title: "Pump.fun & The Memecoin Revolution",
    body: `<p><strong>Pump.fun</strong> changed everything. The green capsule became the symbol of a new era — where anyone could launch a token and let the community decide its fate.</p>
<p>Born on Solana, Pump.fun introduced <strong>bonding curves</strong> that let tokens launch fair, without presales or VCs. Just pure community energy, raw degen plays, and the dream of catching the next 1000x.</p>
<p>The platform became a cultural phenomenon — spawning legendary coins, viral moments, and an entire ecosystem of traders, snipers, and diamond-handed holders.</p>
<p>In PVP WARS, we honor this spirit. Every battle is a fair fight. No advantages, no presales — just skill, strategy, and the will to win.</p>`
  },
  bio_film: {
    title: "The Solana Battlefield",
    body: `<p>Solana isn't just a blockchain — it's a <strong>battlefield</strong>. With sub-second finality and fees measured in fractions of a cent, it became the perfect arena for onchain combat.</p>
<p>From the early days of <strong>$BONK</strong> to the rise of <strong>$WIF</strong>, <strong>$POPCAT</strong>, and countless others, Solana proved that speed kills — and in the memecoin world, being first matters.</p>
<p>PVP WARS brings this same energy to voxel combat. Fast-paced, high-stakes battles where every swing of the sword could be your last — or your moment of glory.</p>
<p>The Solana battlefield never sleeps. Neither do its warriors.</p>`
  },
  facts_wall: {
    title: "Memecoin Alpha",
    body: `<p>� The first memecoin to reach $1B market cap on Solana did it in under 48 hours.</p>
<p>� Pump.fun has launched over 5 million tokens since its inception.</p>
<p>🚀 Diamond hands don't sell — they HODL through the dip and come out the other side stronger.</p>
<p>� In PVP WARS, your kill streak is worth more than any airdrop.</p>
<p>� The green candle is the universal symbol of hope in the crypto world.</p>
<p>� "Wen moon?" is not a question — it's a battle cry.</p>
<p>� A true degen never sleeps. They just switch from trading to PVP at 3am.</p>
<p>� The best rug pull defense? A diamond sword and fast reflexes.</p>
<p>� Every PVP WARS champion started as a noob with nothing but a fist and a dream.</p>
<p>� WAGMI — We're All Gonna Make It. But first, you gotta survive the arena.</p>`
  },
  delta_force: {
    title: "The Pump Capsule",
    body: `<p>Before you stands a replica of the iconic <strong>Pump.fun capsule</strong> — the green and white symbol that launched a million tokens.</p>
<p>The capsule represents the moment of creation — when a new token is born from the bonding curve and enters the wild. Some will moon. Most will fade. But every single one carries the same electric energy of possibility.</p>
<p>In PVP WARS, we've adopted the capsule as a symbol of <strong>power-ups and loot drops</strong>. When you see a capsule in the arena, grab it — it might just save your life.</p>`
  },
  walker_badge: {
    title: "Diamond Hands Badge",
    body: `<p>The <strong>Diamond Hands Badge</strong> is awarded to warriors who never quit — who hold their ground in the arena even when the odds are stacked against them.</p>
<p>In crypto, diamond hands means holding through the crash, believing in the vision when everyone else is panic selling. In PVP WARS, it means standing your ground when your HP is low and your opponent smells blood.</p>
<p>The greatest PVP warriors share one trait with the greatest traders: <strong>unshakeable conviction</strong>. They don't flinch. They don't run. They swing harder.</p>`
  },
  way_of_dragon: {
    title: "Rug Pull Survivors Guild",
    body: `<p>This exhibit honors the <strong>Rug Pull Survivors</strong> — the battle-hardened degens who lost everything and came back stronger.</p>
<p>Every crypto veteran has a rug pull story. The dev who disappeared. The liquidity that vanished. The chart that went vertical — then straight to zero.</p>
<p>But true warriors don't stay down. They learn, adapt, and come back with sharper instincts and harder resolve. In PVP WARS, every defeat is a lesson. Every loss makes you stronger.</p>
<p>"The arena doesn't care about your bags. It only cares about your blade."</p>`
  },
  training_zone: {
    title: "PVP Training Grounds",
    body: `<p>Welcome to the <strong>PVP Training Grounds</strong> — where future champions forge their skills!</p>
<p>⚔️ <strong>Sword Mastery</strong> — Learn the timing of your swings and combos</p>
<p>🛡️ <strong>Defensive Strafing</strong> — Movement is life in the arena</p>
<p>💎 <strong>Diamond Hands Drill</strong> — Train yourself to never panic, never retreat</p>
<p>🎯 <strong>Sniper Positioning</strong> — Like catching a token early, positioning is everything</p>
<p>"In the arena, as in the markets — the prepared warrior survives. The reckless degen gets rekt." — Ancient PVP Proverb</p>`
  },
  black_belts: {
    title: "Legendary Token Collection",
    body: `<p>This display case showcases the most legendary tokens in memecoin history:</p>
<p>� <strong>$BONK</strong> — The OG Solana memecoin that started the revolution</p>
<p>� <strong>$WIF</strong> — The dog with a hat that conquered the world</p>
<p>� <strong>$POPCAT</strong> — Click. Click. Moon.</p>
<p>� <strong>$PEPE</strong> — The frog that became a financial instrument</p>
<p>� <strong>$DOGE</strong> — The grandfather of all memecoins, blessed by Elon himself</p>
<p>Each of these tokens represents more than just a trade — they represent a <strong>community</strong>, a <strong>movement</strong>, and the raw power of internet culture meeting decentralized finance.</p>`
  }
};

// ─── BLOCK PLACEMENT ────────────────────────────────────────────────
export function placeBlock(x, y, z, material, addCollision = true) {
  const mesh = new THREE.Mesh(blockGeo, material);
  mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  museumGroup.add(mesh);
  if (addCollision) {
    collisionBlocks.push(mesh);
  }
  return mesh;
}

export function placeWall(x1, z1, x2, z2, yStart, height, material) {
  const dx = Math.sign(x2 - x1);
  const dz = Math.sign(z2 - z1);
  let cx = x1, cz = z1;
  while (true) {
    for (let y = yStart; y < yStart + height; y++) {
      placeBlock(cx, y, cz, material);
    }
    if (cx === x2 && cz === z2) break;
    if (cx !== x2) cx += dx;
    if (cz !== z2) cz += dz;
  }
}

export function placeFloorRect(x1, z1, x2, z2, y, material, collision = false) {
  for (let x = Math.min(x1,x2); x <= Math.max(x1,x2); x++) {
    for (let z = Math.min(z1,z2); z <= Math.max(z1,z2); z++) {
      placeBlock(x, y, z, material, collision);
    }
  }
}

// ─── EXHIBIT MARKER ─────────────────────────────────────────────────
export function createExhibitMarker(x, y, z, key, label) {
  const markerGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xf5a623, transparent: true, opacity: 0.8 });
  const marker = new THREE.Mesh(markerGeo, markerMat);
  marker.position.set(x + 0.5, y + 0.5, z + 0.5);
  museumGroup.add(marker);

  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, 512, 64);
  ctx.fillStyle = '#f5a623';
  ctx.font = 'bold 28px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText(label, 256, 42);
  const labelTex = new THREE.CanvasTexture(canvas);
  labelTex.magFilter = THREE.NearestFilter;
  const labelGeo = new THREE.PlaneGeometry(3, 0.4);
  const labelMat = new THREE.MeshBasicMaterial({ map: labelTex, transparent: true });
  const labelMesh = new THREE.Mesh(labelGeo, labelMat);
  labelMesh.position.set(x + 0.5, y + 1.6, z + 0.5);
  museumGroup.add(labelMesh);
  billboardLabels.push(labelMesh);

  interactables.push({ mesh: marker, key, label, position: new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5) });
  return marker;
}

// ─── WALL ART ───────────────────────────────────────────────────────
// facing: 'south'(+Z), 'north'(-Z), 'east'(+X), 'west'(-X), 'up'
export function createWallArt(x, y, z, text, color, width, height, facing = 'south') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = Math.max(64, (height / width) * 512);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.0)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  const fontSize = Math.min(48, canvas.width / (text.length * 0.52));
  ctx.font = `bold ${fontSize}px Courier New`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const words = text.split(' ');
  const maxWidth = canvas.width - 20;
  let lines = [];
  let currentLine = words[0];
  for (let i = 1; i < words.length; i++) {
    const test = currentLine + ' ' + words[i];
    if (ctx.measureText(test).width < maxWidth) {
      currentLine = test;
    } else {
      lines.push(currentLine);
      currentLine = words[i];
    }
  }
  lines.push(currentLine);
  const lineHeight = fontSize * 1.3;
  const startY = canvas.height / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, canvas.width / 2, startY + i * lineHeight);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  const geo = new THREE.PlaneGeometry(width, height);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);

  switch (facing) {
    case 'north': mesh.rotation.y = Math.PI; break;
    case 'east':  mesh.rotation.y = Math.PI / 2; break;
    case 'west':  mesh.rotation.y = -Math.PI / 2; break;
    case 'up':    mesh.rotation.x = -Math.PI / 2; break;
    case 'south': default: break;
  }
  museumGroup.add(mesh);
  return mesh;
}

// ─── PIXEL ART PICTURE ──────────────────────────────────────────────
export function createPixelArtPicture(x, y, z, pixelData, pixelSize, facing = 'east', frameColor = 0x3a2510) {
  const rows = pixelData.length;
  const cols = pixelData[0].length;
  const canvas = document.createElement('canvas');
  canvas.width = cols * 8;
  canvas.height = rows * 8;
  const ctx = canvas.getContext('2d');

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const color = pixelData[r][c];
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(c * 8, r * 8, 8, 8);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;

  const w = pixelSize * cols / rows;
  const h = pixelSize;

  const frameGeo = new THREE.BoxGeometry(w + 0.15, h + 0.15, 0.08);
  const frameMat = new THREE.MeshLambertMaterial({ color: frameColor });
  const frame = new THREE.Mesh(frameGeo, frameMat);

  const picGeo = new THREE.PlaneGeometry(w, h);
  const picMat = new THREE.MeshBasicMaterial({ map: tex });
  const pic = new THREE.Mesh(picGeo, picMat);
  pic.position.z = 0.05;

  const group = new THREE.Group();
  group.add(frame);
  group.add(pic);
  group.position.set(x, y, z);

  switch (facing) {
    case 'north': group.rotation.y = Math.PI; break;
    case 'east':  group.rotation.y = Math.PI / 2; break;
    case 'west':  group.rotation.y = -Math.PI / 2; break;
    case 'south': default: break;
  }

  museumGroup.add(group);
  return group;
}

// ─── DISPLAY CASE ───────────────────────────────────────────────────
function createDisplayCase(x, y, z, itemMat) {
  placeBlock(x, y, z, materials.darkWood);
  placeBlock(x, y + 1, z, materials.glass);
  placeBlock(x, y + 2, z, materials.darkWood);

  const itemGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
  const item = new THREE.Mesh(itemGeo, itemMat);
  item.position.set(x + 0.5, y + 1.5, z + 0.5);
  museumGroup.add(item);

  const animate = () => {
    item.rotation.y += 0.01;
    requestAnimationFrame(animate);
  };
  animate();
}

// ─── MUSEUM BUILDING ────────────────────────────────────────────────
export function buildMuseum() {
  const W = 40;
  const D = 60;

  // ── FLOOR ──
  placeFloorRect(-W/2, -D/2, W/2 - 1, D/2 - 1, 0, materials.floor, false);

  // Red carpet runner
  for (let z = -D/2; z < D/2; z++) {
    placeBlock(-1, 0.01, z, materials.redCarpet, false);
    placeBlock(0, 0.01, z, materials.redCarpet, false);
  }

  // ── OUTER WALLS ──
  for (let x = -W/2; x < W/2; x++) {
    for (let y = 1; y <= 7; y++) {
      if (x >= -2 && x <= 1 && y <= 4) continue;
      placeBlock(x, y, -D/2, materials.stoneBrick);
    }
  }
  placeWall(-W/2, D/2 - 1, W/2 - 1, D/2 - 1, 1, 7, materials.stoneBrick);
  placeWall(-W/2, -D/2, -W/2, D/2 - 1, 1, 7, materials.stoneBrick);
  placeWall(W/2 - 1, -D/2, W/2 - 1, D/2 - 1, 1, 7, materials.stoneBrick);

  // ── ENTRANCE ARCH ──
  placeBlock(-2, 5, -D/2, materials.gold);
  placeBlock(-1, 5, -D/2, materials.gold);
  placeBlock(0, 5, -D/2, materials.gold);
  placeBlock(1, 5, -D/2, materials.gold);

  // ── CEILING ──
  for (let x = -W/2; x < W/2; x++) {
    for (let z = -D/2; z < D/2; z++) {
      const isLight = (x % 5 === 0 && z % 5 === 0);
      placeBlock(x, 8, z, isLight ? materials.glowstone : materials.darkBrick, false);
    }
  }

  // ── PILLARS ──
  const pillarPositions = [];
  for (let z = -D/2 + 5; z < D/2 - 4; z += 8) {
    pillarPositions.push([-W/2 + 4, z]);
    pillarPositions.push([W/2 - 5, z]);
  }
  pillarPositions.forEach(([px, pz]) => {
    for (let y = 1; y <= 7; y++) {
      placeBlock(px, y, pz, y === 1 || y === 7 ? materials.gold : materials.quartz);
    }
  });

  // ── ROOM DIVIDERS ──
  for (let z of [-15, 5]) {
    for (let x = -W/2 + 1; x <= -6; x++) {
      for (let y = 1; y <= 5; y++) {
        placeBlock(x, y, z, materials.darkBrick);
      }
    }
  }
  for (let z of [-15, 5]) {
    for (let x = 5; x <= W/2 - 2; x++) {
      for (let y = 1; y <= 5; y++) {
        placeBlock(x, y, z, materials.darkBrick);
      }
    }
  }

  // ── BUILD ALL SECTIONS ──
  createBiographyPanels();
  createFilmExhibits();
  createFactsWall();
  createTrainingZone();
  createBlackBeltDisplay();
  createDecorations();
}

function createBiographyPanels() {
  const xBase = -17;
  const wallX = xBase + 0.6;
  const picX = xBase + 0.6;

  for (let y = 1; y <= 4; y++) {
    placeBlock(xBase, y, -26, materials.darkWood);
    placeBlock(xBase, y, -25, materials.darkWood);
    placeBlock(xBase, y, -24, materials.darkWood);
    placeBlock(xBase, y, -23, materials.darkWood);
  }
  placeBlock(xBase, 5, -26, materials.gold);
  placeBlock(xBase, 5, -25, materials.gold);
  placeBlock(xBase, 5, -24, materials.gold);
  placeBlock(xBase, 5, -23, materials.gold);
  createWallArt(wallX, 5.5, -24.5, "GENESIS BLOCK", "#f5a623", 3, 0.8, 'east');
  createPixelArtPicture(-16.4, 3.2, -24.5, pixelArt.blockchain, 2.5, 'east');
  createExhibitMarker(xBase + 2, 1, -24, 'bio_early', '[ Genesis Block ]');

  for (let y = 1; y <= 4; y++) {
    placeBlock(xBase, y, -21, materials.darkWood);
    placeBlock(xBase, y, -20, materials.darkWood);
    placeBlock(xBase, y, -19, materials.darkWood);
    placeBlock(xBase, y, -18, materials.darkWood);
  }
  placeBlock(xBase, 5, -21, materials.gold);
  placeBlock(xBase, 5, -20, materials.gold);
  placeBlock(xBase, 5, -19, materials.gold);
  placeBlock(xBase, 5, -18, materials.gold);
  createWallArt(wallX, 5.5, -19.5, "PUMP.FUN", "#00cc66", 3, 0.8, 'east');
  createPixelArtPicture(-16.4, 3.2, -19.5, pixelArt.pumpCapsule, 2.5, 'east');
  createExhibitMarker(xBase + 2, 1, -19, 'bio_martial', '[ Pump.fun ]');

  for (let y = 1; y <= 4; y++) {
    placeBlock(xBase, y, -11, materials.darkWood);
    placeBlock(xBase, y, -10, materials.darkWood);
    placeBlock(xBase, y, -9, materials.darkWood);
    placeBlock(xBase, y, -8, materials.darkWood);
  }
  placeBlock(xBase, 5, -11, materials.gold);
  placeBlock(xBase, 5, -10, materials.gold);
  placeBlock(xBase, 5, -9, materials.gold);
  placeBlock(xBase, 5, -8, materials.gold);
  createWallArt(wallX, 5.5, -9.5, "SOLANA", "#9945ff", 3, 0.8, 'east');
  createPixelArtPicture(-16.4, 3.2, -9.5, pixelArt.solanaLogo, 2.5, 'east');
  createExhibitMarker(xBase + 2, 1, -9, 'bio_film', '[ Solana ]');
}

function createFilmExhibits() {
  const xBase = 16;
  const wallX = xBase + 0.4;
  const picX = xBase + 0.4;

  for (let y = 1; y <= 4; y++) {
    placeBlock(xBase, y, -26, materials.darkWood);
    placeBlock(xBase, y, -25, materials.darkWood);
    placeBlock(xBase, y, -24, materials.darkWood);
    placeBlock(xBase, y, -23, materials.darkWood);
  }
  placeBlock(xBase, 5, -26, materials.gold);
  placeBlock(xBase, 5, -25, materials.gold);
  placeBlock(xBase, 5, -24, materials.gold);
  placeBlock(xBase, 5, -23, materials.gold);
  createDisplayCase(xBase - 1, 1, -24, materials.ironBlock);
  createWallArt(wallX, 5.5, -24.5, "PUMP CAPSULE", "#00cc66", 3, 0.8, 'west');
  createPixelArtPicture(16.4, 3.2, -24.5, pixelArt.pumpCapsule, 2.5, 'west');
  createExhibitMarker(xBase - 2, 1, -24, 'delta_force', '[ Pump Capsule ]');

  for (let y = 1; y <= 4; y++) {
    placeBlock(xBase, y, -21, materials.darkWood);
    placeBlock(xBase, y, -20, materials.darkWood);
    placeBlock(xBase, y, -19, materials.darkWood);
    placeBlock(xBase, y, -18, materials.darkWood);
  }
  placeBlock(xBase, 5, -21, materials.gold);
  placeBlock(xBase, 5, -20, materials.gold);
  placeBlock(xBase, 5, -19, materials.gold);
  placeBlock(xBase, 5, -18, materials.gold);
  createDisplayCase(xBase - 1, 1, -19, materials.gold);
  createWallArt(wallX, 5.5, -19.5, "DIAMOND HANDS", "#44ccff", 3, 0.8, 'west');
  createPixelArtPicture(16.4, 3.2, -19.5, pixelArt.diamondHands, 2.5, 'west');
  createExhibitMarker(xBase - 2, 1, -19, 'walker_badge', '[ Diamond Hands ]');

  for (let y = 1; y <= 4; y++) {
    placeBlock(xBase, y, -11, materials.darkWood);
    placeBlock(xBase, y, -10, materials.darkWood);
    placeBlock(xBase, y, -9, materials.darkWood);
    placeBlock(xBase, y, -8, materials.darkWood);
  }
  placeBlock(xBase, 5, -11, materials.gold);
  placeBlock(xBase, 5, -10, materials.gold);
  placeBlock(xBase, 5, -9, materials.gold);
  placeBlock(xBase, 5, -8, materials.gold);
  createDisplayCase(xBase - 1, 1, -9, materials.redWool);
  createWallArt(wallX, 5.5, -9.5, "RUG SURVIVORS", "#ff6600", 3, 0.8, 'west');
  createPixelArtPicture(16.4, 3.2, -9.5, pixelArt.skullPvp, 2.5, 'west');
  createExhibitMarker(xBase - 2, 1, -9, 'way_of_dragon', '[ Rug Survivors ]');
}

function createFactsWall() {
  const xBase = -17;
  const zBase = 10;
  const wallX = xBase + 0.6;

  for (let dz = -1; dz < 9; dz++) {
    for (let y = 1; y <= 6; y++) {
      const mat = (y === 1 || y === 6) ? materials.gold : materials.redWool;
      placeBlock(xBase, y, zBase + dz, mat);
    }
  }

  createWallArt(wallX, 5.5, zBase + 4, "MEMECOIN ALPHA", "#ffcc00", 5, 0.8, 'east');

  const facts = [
    "Diamond hands never fold.",
    "WAGMI is a way of life.",
    "Wen moon? Right now.",
    "Green candles only."
  ];
  facts.forEach((fact, i) => {
    createWallArt(wallX, 4.2 - i * 0.6, zBase + 4, fact, "#ffffff", 5, 0.4, 'east');
  });

  createPixelArtPicture(-16.4, 3.5, 11, pixelArt.fireIcon, 1.8, 'east', 0x8B0000);
  createPixelArtPicture(-16.4, 3.5, 17, pixelArt.fireIcon, 1.8, 'east', 0x8B0000);

  createExhibitMarker(xBase + 2, 1, zBase + 4, 'facts_wall', '[ Memecoin Alpha ]');
}

function createTrainingZone() {
  const xBase = 10;
  const zBase = 10;

  for (let dx = 0; dx < 8; dx++) {
    for (let dz = 0; dz < 8; dz++) {
      placeBlock(xBase + dx, 0.01, zBase + dz, materials.greenWool, false);
    }
  }

  const dummyPositions = [[xBase + 2, zBase + 3], [xBase + 5, zBase + 5], [xBase + 4, zBase + 1]];
  dummyPositions.forEach(([dx, dz]) => {
    placeBlock(dx, 1, dz, materials.brownWool);
    placeBlock(dx, 2, dz, materials.whiteWool);
    placeBlock(dx, 3, dz, materials.sandstone);
  });

  for (let y = 1; y <= 4; y++) {
    placeBlock(xBase + 7, y, zBase, materials.darkWood);
    placeBlock(xBase + 7, y, zBase + 7, materials.darkWood);
  }
  for (let dz = 0; dz <= 7; dz++) {
    placeBlock(xBase + 7, 4, zBase + dz, materials.darkWood);
  }

  createWallArt(xBase + 4, 5.5, zBase - 0.5, "PVP TRAINING", "#00ff88", 4, 0.8, 'south');
  createPixelArtPicture(14.88, 5.894516967553987, 15.496080646147455, pixelArt.pvpSwords, 2, 'west');
  createPixelArtPicture(18.88, 3.596570717676938, 20.003916764357015, pixelArt.pvpWarrior, 2, 'west');
  createExhibitMarker(xBase + 4, 1, zBase + 4, 'training_zone', '[ PVP Training ]');
}

function createBlackBeltDisplay() {
  const cx = -1;
  const cz = -5;

  for (let dx = -2; dx <= 2; dx++) {
    placeBlock(cx + dx, 1, cz, materials.darkWood);
    placeBlock(cx + dx, 1, cz + 1, materials.darkWood);
  }

  for (let dx = -2; dx <= 2; dx++) {
    placeBlock(cx + dx, 2, cz, materials.glass);
    const beltColors = [0x000000, 0x8B0000, 0x1a1a2e, 0xffd700, 0x333333];
    const beltMat = new THREE.MeshLambertMaterial({ color: beltColors[dx + 2] });
    const beltGeo = new THREE.BoxGeometry(0.6, 0.15, 0.3);
    const belt = new THREE.Mesh(beltGeo, beltMat);
    belt.position.set(cx + dx + 0.5, 2.5, cz + 0.5);
    museumGroup.add(belt);
  }

  placeBlock(cx, 3, cz, materials.darkWood);
  createWallArt(cx + 0.5, 4.5, cz - 0.5, "LEGENDARY TOKENS", "#ffd700", 4, 0.7, 'south');
  createPixelArtPicture(-0.6741650915183786, 3.3233845147688785, -5.12, pixelArt.tokenCoin, 1.8, 'north');
  createPixelArtPicture(-0.5755018163553962, 3.378262245476017, -3.88, pixelArt.tokenCoin, 1.8, 'south');
  createExhibitMarker(cx, 1, cz + 2, 'black_belts', '[ Legendary Tokens ]');
}

function createDecorations() {
  const torchZ = [];
  for (let z = -25; z < 25; z += 6) torchZ.push(z);

  torchZ.forEach(z => {
    placeBlock(-19, 4, z, materials.darkWood);
    placeBlock(-19, 5, z, materials.glowstone);
    placeBlock(18, 4, z, materials.darkWood);
    placeBlock(18, 5, z, materials.glowstone);
  });

  const bannerZ = [-22, -12, 0, 12, 22];
  bannerZ.forEach(z => {
    for (let y = 3; y <= 6; y++) {
      placeBlock(-19, y, z, y % 2 === 0 ? materials.redWool : materials.gold);
      placeBlock(18, y, z, y % 2 === 0 ? materials.redWool : materials.gold);
    }
  });

  createWallArt(0, 6.5, -29.4, "PVP WARS — MEMECOIN ARENA", "#f5a623", 10, 1.2, 'south');
  createWallArt(0, 5.2, -29.4, "Onchain Combat · Degen Glory", "#cccccc", 6, 0.6, 'south');
  createPixelArtPicture(-9.748698086257955, 3.3121428307383045, -15.12, pixelArt.pvpSwords, 3, 'north', 0x9933ff);

  createWallArt(-10, 0.52, -2, "← LORE WING", "#dddddd", 3, 0.5, 'up');
  createWallArt(10, 0.52, -2, "ARSENAL WING →", "#dddddd", 3, 0.5, 'up');
  createWallArt(0, 0.52, 15, "↑ PVP WARS PORTAL", "#9933ff", 3, 0.5, 'up');

  createWallGallery();
}

function createWallGallery() {
  // [13] moonIcon — left wall
  createPixelArtPicture(-18.9, 3.5, -15, pixelArt.moonIcon, 2, 'east', 0x3a2510);
  // [14] candleChart — moved
  createPixelArtPicture(-15.88, 5.054619563307842, 13.852329551758087, pixelArt.candleChart, 1.5, 'east', 0x3a2510);
  // [15] dogeCoin — moved
  createPixelArtPicture(-9.601849540611504, 3.1397454543088075, 6.12, pixelArt.dogeCoin, 2, 'south', 0x3a2510);
  // [16] pickaxe — moved
  createPixelArtPicture(14.88, 5.172534840321373, 7.533677624671428, pixelArt.pickaxe, 1.5, 'west', 0x3a2510);
  // [17] pvpWarrior — moved
  createPixelArtPicture(-15.88, 3.3063530544270345, 17.55608278895283, pixelArt.pvpWarrior, 2.2, 'east', 0x9933ff);
  // [18] blockchain — moved
  createPixelArtPicture(-14.88, 3.750666965310887, -24.329381019127503, pixelArt.blockchain, 1.5, 'east', 0x3a2510);
  // [19] lightning — moved
  createPixelArtPicture(-15.88, 5.04370742497703, 11.38115450391551, pixelArt.lightning, 1.5, 'east', 0x3a2510);
  // [20] rocketMoon — moved
  createPixelArtPicture(6.587615403186869, 3.6241854676513823, 4.88, pixelArt.rocketMoon, 2, 'north', 0x3a2510);
  // [21] trophy — moved
  createPixelArtPicture(-15.88, 3.0551966241011916, 11.324485596411748, pixelArt.trophy, 1.8, 'east', 0xffd700);
  // [22] pumpCapsule — moved
  createPixelArtPicture(14.88, 4.054966324901768, -24.446814563469133, pixelArt.pumpCapsule, 2, 'west', 0x00cc66);

  // [23] pepeFrog — moved
  createPixelArtPicture(6.967625628885413, 4.273359063626671, -15.12, pixelArt.pepeFrog, 2, 'north', 0x3a2510);
  // [24] lightning (right) — moved
  createPixelArtPicture(-14.88, 4.1774478207358055, -0.5066223227072095, pixelArt.lightning, 1.5, 'east', 0x3a2510);
  // [25] moonIcon (right) — moved
  createPixelArtPicture(-0.6589591322344591, 4.328564390141684, 28.88, pixelArt.moonIcon, 2, 'north', 0x3a2510);
  // [26] candleChart (right) — moved
  createPixelArtPicture(14.88, 3.6423381009310454, -8.412764189421223, pixelArt.candleChart, 1.5, 'west', 0x3a2510);
  // [27] diamondHands (right) — moved
  createPixelArtPicture(18.88, 3.544130750161025, -3.4195215867794486, pixelArt.diamondHands, 2.2, 'west', 0x44ccff);
  // [28] pickaxe (right) — moved
  createPixelArtPicture(18.88, 3.245606343155157, 2.937810512911297, pixelArt.pickaxe, 1.5, 'west', 0x3a2510);
  // [29] pvpWarrior (right) — moved
  createPixelArtPicture(8.98208729735849, 3.454451599614784, 6.12, pixelArt.pvpWarrior, 2, 'south', 0x9933ff);
  // [30] trophy (right) — moved
  createPixelArtPicture(13.868488180100405, 5.324904865189199, 28.88, pixelArt.trophy, 1.8, 'north', 0xffd700);
  // [31] rocketMoon (right) — moved
  createPixelArtPicture(18.88, 3.5283826976256116, 26.90043177594205, pixelArt.rocketMoon, 2, 'west', 0x3a2510);
  // [32] tokenCoin (right) — moved
  createPixelArtPicture(18.88, 2.7694363678287726, 14.626364095069501, pixelArt.tokenCoin, 1.8, 'west', 0xffd700);

  // [33] pumpCapsule (back) — moved
  createPixelArtPicture(-15.88, 3.273629526966379, -18.856696949846167, pixelArt.pumpCapsule, 3, 'east', 0x00cc66);
  // [34] dogeCoin (back) — moved
  createPixelArtPicture(-18.88, 3.139938500946675, -3.6132352049096323, pixelArt.dogeCoin, 3, 'east', 0xffd700);
  // [35] pvpWarrior (back large) — same position
  createPixelArtPicture(0, 7.5, 28.9, pixelArt.pvpWarrior, 3.5, 'south', 0x9933ff);

  // [36] diamondHands (front) — moved
  createPixelArtPicture(14.88, 3.4860092288607403, -18.557242565221017, pixelArt.diamondHands, 2.5, 'west', 0x44ccff);
  // [37] pvpWarrior (front) — moved
  createPixelArtPicture(-6.868463031907483, 3.637011460193957, 4.88, pixelArt.pvpWarrior, 2.5, 'north', 0x9933ff);
  // [38] solanaLogo (front left) — moved
  createPixelArtPicture(6.153797171980651, 5.221379829538648, 28.88, pixelArt.solanaLogo, 2, 'north', 0x9945ff);
  // [39] solanaLogo (front right) — moved
  createPixelArtPicture(-14.88, 4.337796583302514, -8.464346197549446, pixelArt.solanaLogo, 2, 'east', 0x9945ff);
  // [40] extra — moved high
  createPixelArtPicture(-0.5, 11.5, 21.5, pixelArt.pvpWarrior, 2, 'south', 0x9933ff);
}

// ─── LIGHTING ───────────────────────────────────────────────────────
export function setupLighting() {
  const ambient = new THREE.AmbientLight(0xffffff, 1.4);
  museumGroup.add(ambient);

  const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x8B7355, 0.8);
  museumGroup.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xfff8ee, 1.5);
  dirLight.position.set(10, 20, 10);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 100;
  dirLight.shadow.camera.left = -40;
  dirLight.shadow.camera.right = 40;
  dirLight.shadow.camera.top = 40;
  dirLight.shadow.camera.bottom = -40;
  museumGroup.add(dirLight);

  const warmPositions = [
    [0, 6, -20], [0, 6, 0], [0, 6, 20],
    [-12, 6, -10], [12, 6, -10],
    [-12, 6, 15], [12, 6, 15],
    [0, 6, 22]
  ];
  warmPositions.forEach(pos => {
    const pl = new THREE.PointLight(0xffcc77, 1.0, 25);
    pl.position.set(...pos);
    museumGroup.add(pl);
  });

  // Portal area lighting (purple glow replaces sarcophagus lighting)
  const portalLight = new THREE.PointLight(0x9933ff, 2.0, 20);
  portalLight.position.set(0, 7, 22);
  museumGroup.add(portalLight);

  const portalGlow = new THREE.PointLight(0xaa44ff, 1.0, 12);
  portalGlow.position.set(0, 3, 22);
  museumGroup.add(portalGlow);
}

// ─── SKYBOX ─────────────────────────────────────────────────────────
export function createSkybox() {
  const skyGeo = new THREE.BoxGeometry(200, 200, 200);
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, '#4a90d9');
  grad.addColorStop(0.3, '#87ceeb');
  grad.addColorStop(0.7, '#b0e0f0');
  grad.addColorStop(1, '#d4efc8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  for (let i = 0; i < 8; i++) {
    const cx = Math.random() * 64;
    const cy = 8 + Math.random() * 20;
    ctx.fillRect(cx, cy, 6 + Math.random() * 8, 2);
  }
  const skyTex = new THREE.CanvasTexture(canvas);
  skyTex.magFilter = THREE.NearestFilter;
  const skyMats = Array(6).fill(null).map(() =>
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide })
  );
  const sky = new THREE.Mesh(skyGeo, skyMats);
  museumGroup.add(sky);
}

// ─── PARTICLE SYSTEM ────────────────────────────────────────────────
let particles;
export function createParticles() {
  const count = 200;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 10;
    positions[i * 3 + 1] = Math.random() * 8 + 1;
    positions[i * 3 + 2] = 22 + (Math.random() - 0.5) * 10;
    // Purple-tinted particles for portal
    colors[i * 3] = 0.6 + Math.random() * 0.3;
    colors[i * 3 + 1] = 0.2 + Math.random() * 0.2;
    colors[i * 3 + 2] = 0.9 + Math.random() * 0.1;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.08, vertexColors: true, transparent: true, opacity: 0.6
  });
  particles = new THREE.Points(geo, mat);
  museumGroup.add(particles);
}

export function updateParticles(time) {
  if (!particles) return;
  const pos = particles.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.array[i * 3 + 1] += Math.sin(time * 2 + i) * 0.003;
    if (pos.array[i * 3 + 1] > 9) pos.array[i * 3 + 1] = 1;
  }
  pos.needsUpdate = true;
}
