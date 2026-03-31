import * as THREE from 'three';

// ─── GLOBALS ────────────────────────────────────────────────────────
let camera, scene, renderer, clock;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let canJump = false, velocity = new THREE.Vector3(), direction = new THREE.Vector3();
let isLocked = false;
let playerHeight = 1.7;
let gravity = -30;
let jumpSpeed = 10;
let moveSpeed = 8;
let yaw = 0, pitch = 0;
const floorY = 1; // top surface of floor blocks
const playerPos = new THREE.Vector3(0, playerHeight + floorY, 2);
const raycaster = new THREE.Raycaster();
const interactables = [];
let currentExhibit = null;
let exhibitOpen = false;
let minimapVisible = false;
let worldBlocks = [];
const blockSize = 1;
let fistGroup, swordHandGroup, swordSwing = 0, isSwinging = false;
const billboardLabels = [];
let activeSlot = 0; // 0 = fist, 1 = sword

// ─── MULTIPLAYER GLOBALS ─────────────────────────────────────────────
let ws = null;
let myPlayerId = null;
let myPlayerName = 'Player';
let myPlayerColor = '#ff4444';
const remotePlayers = new Map(); // id -> { group, nameLabel, data, targetPos, targetYaw }
let chatOpen = false;
let lastSendTime = 0;
const SEND_RATE = 50; // ms between position updates
let onlineCount = 1;

// ─── TEXTURE GENERATOR ─────────────────────────────────────────────
function createPixelTexture(colors, size = 16) {
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

function makeNoiseTex(baseR, baseG, baseB, variation = 20, size = 16) {
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

function makeBrickTexture(r, g, b) {
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

function makeGoldBlockTexture() {
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

function makeRedCarpetTexture() {
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
const materials = {};
function initMaterials() {
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
}

// ─── BLOCK PLACEMENT ────────────────────────────────────────────────
const blockGeo = new THREE.BoxGeometry(blockSize, blockSize, blockSize);
const collisionBlocks = [];

function placeBlock(x, y, z, material, addCollision = true) {
  const mesh = new THREE.Mesh(blockGeo, material);
  mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  if (addCollision) {
    collisionBlocks.push(mesh);
  }
  return mesh;
}

function placeWall(x1, z1, x2, z2, yStart, height, material) {
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

function placeFloorRect(x1, z1, x2, z2, y, material, collision = false) {
  for (let x = Math.min(x1,x2); x <= Math.max(x1,x2); x++) {
    for (let z = Math.min(z1,z2); z <= Math.max(z1,z2); z++) {
      placeBlock(x, y, z, material, collision);
    }
  }
}

// ─── EXHIBIT SYSTEM ─────────────────────────────────────────────────
const exhibitData = {
  bio_early: {
    title: "Early Life",
    body: `<p>Carlos Ray Norris was born on March 10, 1940, in Ryan, Oklahoma. Growing up in humble circumstances, young Carlos faced hardship that would forge his legendary resilience.</p>
<p>His father, Ray, was a World War II veteran and mechanic. After his parents' divorce, Chuck and his brothers were raised by their mother Wilma in Wilson and later Prairie Village, Kansas.</p>
<p>Chuck describes himself as a shy and average student — a far cry from the unstoppable force he would become. He graduated from North Torrance High School in 1958 and enlisted in the United States Air Force.</p>`
  },
  bio_martial: {
    title: "Martial Arts Mastery",
    body: `<p>While stationed at Osan Air Base in South Korea, Norris began training in Tang Soo Do, eventually earning a black belt. This was the spark that ignited a legend.</p>
<p>After returning to the U.S., he opened a chain of karate schools and trained celebrities like Steve McQueen and Priscilla Presley. He won numerous karate championships and was undefeated for six consecutive years as a middleweight champion.</p>
<p>He created his own martial art, <strong>Chun Kuk Do</strong> ("The Universal Way"), blending elements from multiple disciplines. He holds black belts in Tang Soo Do, Brazilian Jiu-Jitsu, and Judo.</p>
<p>He was the first Westerner to be awarded an 8th-degree black belt Grand Master in Tae Kwon Do.</p>`
  },
  bio_film: {
    title: "Film & Television Career",
    body: `<p>Chuck's film career began with a legendary battle: his fight against Bruce Lee in <strong>Way of the Dragon</strong> (1972) at the Roman Colosseum — widely considered one of the greatest fight scenes in cinema history.</p>
<p>He went on to star in action classics including <strong>Missing in Action</strong> (1984), <strong>Code of Silence</strong> (1985), <strong>The Delta Force</strong> (1986), and <strong>Lone Wolf McQuade</strong> (1983).</p>
<p>From 1993 to 2001, he starred as Cordell Walker in <strong>Walker, Texas Ranger</strong>, one of the most successful TV shows of the era, running for 8 seasons and 203 episodes.</p>
<p>Later appearances include <strong>The Expendables 2</strong> (2012), where he played the aptly named "Booker."</p>`
  },
  facts_wall: {
    title: "Chuck Norris Facts",
    body: `<p>🔥 Chuck Norris counted to infinity. Twice.</p>
<p>🔥 When Chuck Norris does a pushup, he isn't pushing himself up — he's pushing the Earth down.</p>
<p>🔥 Chuck Norris can divide by zero.</p>
<p>🔥 Chuck Norris doesn't read books. He stares them down until he gets the information he wants.</p>
<p>🔥 When the Boogeyman goes to sleep, he checks his closet for Chuck Norris.</p>
<p>🔥 Chuck Norris can slam a revolving door.</p>
<p>🔥 Chuck Norris once kicked a horse in the chin. Its descendants are known today as giraffes.</p>
<p>🔥 There is no theory of evolution. Just a list of creatures Chuck Norris has allowed to live.</p>
<p>🔥 Chuck Norris can hear sign language.</p>
<p>🔥 When Chuck Norris enters a room, he doesn't turn the lights on. He turns the dark off.</p>`
  },
  delta_force: {
    title: "The Delta Force Patch",
    body: `<p>This exhibit showcases a replica of the iconic <strong>Delta Force</strong> shoulder patch worn by Colonel Scott McCoy, Chuck's character in the 1986 action film.</p>
<p>In the movie, Chuck leads an elite counter-terrorism unit to rescue hostages from a hijacked airplane. The film was inspired by real-world events — the TWA Flight 847 hijacking.</p>
<p>The Delta Force spawned a sequel and cemented Chuck's status as America's premier action hero of the 1980s.</p>`
  },
  walker_badge: {
    title: "Walker, Texas Ranger Badge",
    body: `<p>The legendary badge of <strong>Cordell Walker</strong>, Texas Ranger Company B. For eight seasons, Chuck Norris brought justice to the Lone Star State with his signature roundhouse kick.</p>
<p>The show combined martial arts action with classic Western themes, creating a unique genre that captivated millions of viewers worldwide.</p>
<p>"Walker" became a cultural phenomenon, spawning a TV movie and a reboot series. The original remains the definitive version — because you don't improve on Chuck Norris.</p>`
  },
  way_of_dragon: {
    title: "Way of the Dragon — The Gi",
    body: `<p>This exhibit features a replica of Chuck Norris's fighting gi from his legendary bout against Bruce Lee in <strong>Way of the Dragon</strong> (1972).</p>
<p>The fight scene in the Roman Colosseum is considered one of the greatest martial arts sequences ever filmed. Chuck played Colt, the American karate champion hired to defeat Lee's character.</p>
<p>Despite losing the fight on screen, Chuck won something greater — eternal cinematic immortality alongside Bruce Lee.</p>`
  },
  training_zone: {
    title: "Interactive Training Zone",
    body: `<p>Welcome to the <strong>Chuck Norris Training Zone</strong>!</p>
<p>In this area, we honor the disciplines that made Chuck Norris a legend:</p>
<p>🥋 <strong>Tang Soo Do</strong> — The Korean martial art where it all began</p>
<p>🥊 <strong>Chun Kuk Do</strong> — Chuck's own creation, "The Universal Way"</p>
<p>🤼 <strong>Brazilian Jiu-Jitsu</strong> — Grappling mastery under the Machado family</p>
<p>⚔️ <strong>Judo</strong> — The gentle way... until Chuck does it</p>
<p>"I've always found that anything worth achieving will always have obstacles in the way and you've got to have that drive and determination to overcome those obstacles on route to whatever it is that you want to accomplish." — Chuck Norris</p>`
  },
  sarcophagus: {
    title: "The Chuck Norris Sarcophagus",
    body: `<p>Before you stands the <strong>Chuck Norris Sarcophagus</strong> — a monumental tribute to the man, the myth, the legend.</p>
<p>Crafted from the finest obsidian and gold blocks, this symbolic tomb represents not death, but <strong>eternal invincibility</strong>. For Chuck Norris cannot truly be contained — not by time, not by space, and certainly not by a voxel-based sarcophagus.</p>
<p>The four pillars represent his four core virtues:</p>
<p>⚡ <strong>Strength</strong> — Physical and spiritual power</p>
<p>🛡️ <strong>Honor</strong> — Unwavering moral code</p>
<p>🔥 <strong>Courage</strong> — Fearlessness in all endeavors</p>
<p>❤️ <strong>Compassion</strong> — His charitable work through Kickstart Kids and other foundations</p>
<p>Legend says that if you stand here long enough, you can hear the faint sound of a roundhouse kick echoing through eternity.</p>`
  },
  black_belts: {
    title: "Black Belt Collection",
    body: `<p>This display case houses replicas of Chuck Norris's most prestigious martial arts belts and honors:</p>
<p>🥋 <strong>1st Degree Black Belt, Tang Soo Do</strong> — Earned in South Korea, 1962</p>
<p>🥋 <strong>8th Degree Grand Master, Tae Kwon Do</strong> — First Westerner to receive this honor</p>
<p>🥋 <strong>3rd Degree Black Belt, Brazilian Jiu-Jitsu</strong> — Under the Machado brothers</p>
<p>🥋 <strong>Black Belt, Judo</strong> — Classical Japanese grappling</p>
<p>🥋 <strong>10th Degree Black Belt, Chun Kuk Do</strong> — Founder's rank in his own system</p>
<p>Chuck Norris has stated: "A lot of people give up just before they're about to make it. You know you never know when that next obstacle is going to be the last one."</p>`
  }
};

function createExhibitMarker(x, y, z, key, label) {
  // Glowing marker block
  const markerGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xf5a623, transparent: true, opacity: 0.8 });
  const marker = new THREE.Mesh(markerGeo, markerMat);
  marker.position.set(x + 0.5, y + 0.5, z + 0.5);
  scene.add(marker);

  // Floating label
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
  scene.add(labelMesh);
  billboardLabels.push(labelMesh);

  interactables.push({ mesh: marker, key, label, position: new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5) });
  return marker;
}

// ─── MUSEUM BUILDING ────────────────────────────────────────────────
function buildMuseum() {
  // Museum dimensions
  const W = 40; // width (x)
  const D = 60; // depth (z)

  // ── FLOOR ──
  placeFloorRect(-W/2, -D/2, W/2 - 1, D/2 - 1, 0, materials.floor, false);

  // Red carpet runner down the center
  for (let z = -D/2; z < D/2; z++) {
    placeBlock(-1, 0.01, z, materials.redCarpet, false);
    placeBlock(0, 0.01, z, materials.redCarpet, false);
  }

  // ── OUTER WALLS ──
  // Front wall (south, z = -D/2) with entrance
  for (let x = -W/2; x < W/2; x++) {
    for (let y = 1; y <= 7; y++) {
      if (x >= -2 && x <= 1 && y <= 4) continue; // door opening
      placeBlock(x, y, -D/2, materials.stoneBrick);
    }
  }
  // Back wall (north, z = D/2 - 1)
  placeWall(-W/2, D/2 - 1, W/2 - 1, D/2 - 1, 1, 7, materials.stoneBrick);
  // Left wall (west, x = -W/2)
  placeWall(-W/2, -D/2, -W/2, D/2 - 1, 1, 7, materials.stoneBrick);
  // Right wall (east, x = W/2 - 1)
  placeWall(W/2 - 1, -D/2, W/2 - 1, D/2 - 1, 1, 7, materials.stoneBrick);

  // ── ENTRANCE ARCH ──
  placeBlock(-2, 5, -D/2, materials.gold);
  placeBlock(-1, 5, -D/2, materials.gold);
  placeBlock(0, 5, -D/2, materials.gold);
  placeBlock(1, 5, -D/2, materials.gold);

  // ── CEILING with glowstone lights ──
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

  // ── ROOM DIVIDERS (partial walls to create exhibit rooms) ──
  // Left wing divider
  for (let z of [-15, 5]) {
    for (let x = -W/2 + 1; x <= -6; x++) {
      for (let y = 1; y <= 5; y++) {
        placeBlock(x, y, z, materials.darkBrick);
      }
    }
  }
  // Right wing divider
  for (let z of [-15, 5]) {
    for (let x = 5; x <= W/2 - 2; x++) {
      for (let y = 1; y <= 5; y++) {
        placeBlock(x, y, z, materials.darkBrick);
      }
    }
  }

  // ── BIOGRAPHY WING (left side, south section) ──
  // Biography panels along left wall
  createBiographyPanels();

  // ── FILM MEMORABILIA WING (right side, south section) ──
  createFilmExhibits();

  // ── CHUCK NORRIS FACTS WALL (left side, north section) ──
  createFactsWall();

  // ── MARTIAL ARTS / TRAINING ZONE (right side, north section) ──
  createTrainingZone();

  // ── THE SARCOPHAGUS (center, north end) ──
  createSarcophagus();

  // ── BLACK BELT DISPLAY (center area) ──
  createBlackBeltDisplay();

  // ── DECORATIVE ELEMENTS ──
  createDecorations();
}

function createBiographyPanels() {
  // Panel stands along the left wall area — signs face EAST (toward center)
  const xBase = -17;
  const wallX = xBase + 0.6; // offset slightly from wall for signs
  const picX = xBase + 0.6;  // pictures on wall

  // Early life panel
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
  createWallArt(wallX, 5.5, -24.5, "EARLY LIFE", "#f5a623", 3, 0.8, 'east');
  createPixelArtPicture(picX, 3.2, -24.5, pixelArt.chuckFace, 2.5, 'east');
  createExhibitMarker(xBase + 2, 1, -24, 'bio_early', '[ Early Life ]');

  // Martial arts panel
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
  createWallArt(wallX, 5.5, -19.5, "MARTIAL ARTS", "#ff4444", 3, 0.8, 'east');
  createPixelArtPicture(picX, 3.2, -19.5, pixelArt.karateKick, 2.5, 'east');
  createExhibitMarker(xBase + 2, 1, -19, 'bio_martial', '[ Martial Arts ]');

  // Film career panel
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
  createWallArt(wallX, 5.5, -9.5, "FILM CAREER", "#44aaff", 3, 0.8, 'east');
  createPixelArtPicture(picX, 3.2, -9.5, pixelArt.filmClapper, 2.5, 'east');
  createExhibitMarker(xBase + 2, 1, -9, 'bio_film', '[ Film Career ]');
}

function createFilmExhibits() {
  // Right side — signs face WEST (toward center)
  const xBase = 16;
  const wallX = xBase + 0.4;
  const picX = xBase + 0.4;

  // Delta Force exhibit
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
  createWallArt(wallX, 5.5, -24.5, "DELTA FORCE", "#f5a623", 3, 0.8, 'west');
  createPixelArtPicture(picX, 3.2, -24.5, pixelArt.deltaPatch, 2.5, 'west');
  createExhibitMarker(xBase - 2, 1, -24, 'delta_force', '[ Delta Force ]');

  // Walker badge exhibit
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
  createWallArt(wallX, 5.5, -19.5, "WALKER BADGE", "#ffd700", 3, 0.8, 'west');
  createPixelArtPicture(picX, 3.2, -19.5, pixelArt.rangerBadge, 2.5, 'west');
  createExhibitMarker(xBase - 2, 1, -19, 'walker_badge', '[ Walker Badge ]');

  // Way of the Dragon exhibit
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
  createWallArt(wallX, 5.5, -9.5, "WAY OF DRAGON", "#ff6600", 3, 0.8, 'west');
  createPixelArtPicture(picX, 3.2, -9.5, pixelArt.dragon, 2.5, 'west');
  createExhibitMarker(xBase - 2, 1, -9, 'way_of_dragon', '[ Way of Dragon ]');
}

function createDisplayCase(x, y, z, itemMat) {
  // Glass case
  placeBlock(x, y, z, materials.darkWood);
  placeBlock(x, y + 1, z, materials.glass);
  placeBlock(x, y + 2, z, materials.darkWood);

  // Item inside (smaller block)
  const itemGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
  const item = new THREE.Mesh(itemGeo, itemMat);
  item.position.set(x + 0.5, y + 1.5, z + 0.5);
  scene.add(item);

  // Slow rotation animation
  const animate = () => {
    item.rotation.y += 0.01;
    requestAnimationFrame(animate);
  };
  animate();
}

function createFactsWall() {
  // Left side, north section — faces EAST (toward center)
  const xBase = -17;
  const zBase = 10;
  const wallX = xBase + 0.6;

  // Build a decorative wall panel
  for (let dz = -1; dz < 9; dz++) {
    for (let y = 1; y <= 6; y++) {
      const mat = (y === 1 || y === 6) ? materials.gold : materials.redWool;
      placeBlock(xBase, y, zBase + dz, mat);
    }
  }

  createWallArt(wallX, 5.5, zBase + 4, "CHUCK NORRIS FACTS", "#ffcc00", 5, 0.8, 'east');

  // Facts text panels — each on its own line, properly faced
  const facts = [
    "Counted to infinity. Twice.",
    "Can divide by zero.",
    "Slams revolving doors.",
    "Hears sign language."
  ];
  facts.forEach((fact, i) => {
    createWallArt(wallX, 4.2 - i * 0.6, zBase + 4, fact, "#ffffff", 5, 0.4, 'east');
  });

  // Pixel art fire icon
  createPixelArtPicture(wallX, 3.5, zBase + 1, pixelArt.fireIcon, 1.8, 'east', 0x8B0000);
  createPixelArtPicture(wallX, 3.5, zBase + 7, pixelArt.fireIcon, 1.8, 'east', 0x8B0000);

  createExhibitMarker(xBase + 2, 1, zBase + 4, 'facts_wall', '[ Chuck Norris Facts ]');
}

function createTrainingZone() {
  const xBase = 10;
  const zBase = 10;

  // Training mat (green floor area)
  for (let dx = 0; dx < 8; dx++) {
    for (let dz = 0; dz < 8; dz++) {
      placeBlock(xBase + dx, 0.01, zBase + dz, materials.greenWool, false);
    }
  }

  // Training dummies (stacked blocks)
  const dummyPositions = [[xBase + 2, zBase + 3], [xBase + 5, zBase + 5], [xBase + 4, zBase + 1]];
  dummyPositions.forEach(([dx, dz]) => {
    placeBlock(dx, 1, dz, materials.brownWool); // legs
    placeBlock(dx, 2, dz, materials.whiteWool); // torso
    placeBlock(dx, 3, dz, materials.sandstone); // head
  });

  // Weapon rack
  for (let y = 1; y <= 4; y++) {
    placeBlock(xBase + 7, y, zBase, materials.darkWood);
    placeBlock(xBase + 7, y, zBase + 7, materials.darkWood);
  }
  for (let dz = 0; dz <= 7; dz++) {
    placeBlock(xBase + 7, 4, zBase + dz, materials.darkWood);
  }

  // Sign faces SOUTH (toward entrance / center aisle) + pixel art
  createWallArt(xBase + 4, 5.5, zBase - 0.5, "TRAINING ZONE", "#00ff88", 4, 0.8, 'south');
  createPixelArtPicture(xBase + 4, 3.5, zBase - 0.5, pixelArt.fistIcon, 2, 'south');
  createPixelArtPicture(xBase + 4, 3.5, zBase + 8.5, pixelArt.karateKick, 2, 'north');
  createExhibitMarker(xBase + 4, 1, zBase + 4, 'training_zone', '[ Training Zone ]');
}

function createSarcophagus() {
  const cx = -1; // center x
  const cz = 22; // center z (north end of museum)

  // Platform
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      placeBlock(cx + dx, 0.01, cz + dz, materials.gold, false);
      placeBlock(cx + dx, 1, cz + dz, materials.obsidian);
    }
  }

  // Sarcophagus base
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      placeBlock(cx + dx, 2, cz + dz, materials.obsidian);
      placeBlock(cx + dx, 3, cz + dz, materials.gold);
    }
  }

  // Sarcophagus top (lid)
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      placeBlock(cx + dx, 4, cz + dz, materials.obsidian);
    }
  }
  // Gold trim on top
  placeBlock(cx, 5, cz, materials.gold);
  placeBlock(cx, 5, cz - 2, materials.diamondBlock);
  placeBlock(cx, 5, cz + 2, materials.diamondBlock);

  // Four corner pillars
  const pillarOffsets = [[-3, -3], [3, -3], [-3, 3], [3, 3]];
  const pillarLabels = ["STRENGTH", "HONOR", "COURAGE", "COMPASSION"];
  const pillarMats = [materials.redWool, materials.blueWool, materials.gold, materials.emeraldBlock];

  pillarOffsets.forEach(([dx, dz], i) => {
    for (let y = 1; y <= 6; y++) {
      const mat = y === 6 ? materials.glowstone : (y <= 2 ? materials.obsidian : pillarMats[i]);
      placeBlock(cx + dx, y, cz + dz, mat);
    }
    // Labels face SOUTH (toward approaching player)
    const labelZ = cz + dz + (dz < 0 ? 1.1 : -0.1);
    const labelFacing = dz < 0 ? 'south' : 'north';
    createWallArt(cx + dx + 0.5, 4, labelZ, pillarLabels[i], "#f5a623", 1.8, 0.5, labelFacing);
  });

  // Lava moat (decorative, just 1 block deep around the platform)
  for (let dx = -4; dx <= 4; dx++) {
    placeBlock(cx + dx, 0, cz - 4, materials.lava, false);
    placeBlock(cx + dx, 0, cz + 4, materials.lava, false);
  }
  for (let dz = -3; dz <= 3; dz++) {
    placeBlock(cx - 4, 0, cz + dz, materials.lava, false);
    placeBlock(cx + 4, 0, cz + dz, materials.lava, false);
  }

  // Sarcophagus pixel art icon on south-facing approach
  createPixelArtPicture(cx + 0.5, 6.5, cz - 4.5, pixelArt.sarcIcon, 2.5, 'south', 0xffd700);

  createExhibitMarker(cx, 3, cz - 4, 'sarcophagus', '[ The Sarcophagus ]');
}

function createBlackBeltDisplay() {
  const cx = -1;
  const cz = -5;

  // Display podium
  for (let dx = -2; dx <= 2; dx++) {
    placeBlock(cx + dx, 1, cz, materials.darkWood);
    placeBlock(cx + dx, 1, cz + 1, materials.darkWood);
  }

  // Glass cases with belts
  for (let dx = -2; dx <= 2; dx++) {
    placeBlock(cx + dx, 2, cz, materials.glass);
    // Belt item
    const beltColors = [0x000000, 0x8B0000, 0x1a1a2e, 0xffd700, 0x333333];
    const beltMat = new THREE.MeshLambertMaterial({ color: beltColors[dx + 2] });
    const beltGeo = new THREE.BoxGeometry(0.6, 0.15, 0.3);
    const belt = new THREE.Mesh(beltGeo, beltMat);
    belt.position.set(cx + dx + 0.5, 2.5, cz + 0.5);
    scene.add(belt);
  }

  placeBlock(cx, 3, cz, materials.darkWood);
  // Sign faces SOUTH (toward entrance)
  createWallArt(cx + 0.5, 4.5, cz - 0.5, "BLACK BELT COLLECTION", "#ffd700", 4, 0.7, 'south');
  createPixelArtPicture(cx - 2.5, 3.5, cz - 0.5, pixelArt.blackBelt, 1.8, 'south');
  createPixelArtPicture(cx + 3.5, 3.5, cz - 0.5, pixelArt.blackBelt, 1.8, 'south');
  createExhibitMarker(cx, 1, cz + 2, 'black_belts', '[ Black Belts ]');
}

function createDecorations() {
  // Torches (glowstone on dark wood sticks) along walls
  const torchZ = [];
  for (let z = -25; z < 25; z += 6) torchZ.push(z);

  torchZ.forEach(z => {
    // Left wall torches
    placeBlock(-19, 4, z, materials.darkWood);
    placeBlock(-19, 5, z, materials.glowstone);
    // Right wall torches
    placeBlock(18, 4, z, materials.darkWood);
    placeBlock(18, 5, z, materials.glowstone);
  });

  // Banners (colored wool strips) on walls
  const bannerZ = [-22, -12, 0, 12, 22];
  bannerZ.forEach(z => {
    for (let y = 3; y <= 6; y++) {
      placeBlock(-19, y, z, y % 2 === 0 ? materials.redWool : materials.gold);
      placeBlock(18, y, z, y % 2 === 0 ? materials.redWool : materials.gold);
    }
  });

  // Entrance sign — faces SOUTH (toward player approaching from outside)
  createWallArt(0, 6.5, -29.4, "CHUCK NORRIS MEMORIAL MUSEUM", "#f5a623", 10, 1.2, 'south');
  createWallArt(0, 5.2, -29.4, "Est. 1940 — Forever", "#cccccc", 6, 0.6, 'south');
  // Large Chuck portrait on entrance wall (visible from inside, faces SOUTH toward player)
  createPixelArtPicture(0, 3.5, -28.5, pixelArt.chuckFace, 3, 'south', 0xffd700);

  // Floor markers / directional signs — face UP
  createWallArt(-10, 0.52, -2, "← BIOGRAPHY WING", "#dddddd", 3, 0.5, 'up');
  createWallArt(10, 0.52, -2, "FILM MEMORABILIA →", "#dddddd", 3, 0.5, 'up');
  createWallArt(0, 0.52, 15, "↑ THE SARCOPHAGUS", "#f5a623", 3, 0.5, 'up');

  // ── WALL GALLERY — many pictures along both walls ──
  createWallGallery();
}

function createWallGallery() {
  // Left wall (x=-19) — pictures face EAST (toward center)
  const leftX = -18.9;
  // Right wall (x=18) — pictures face WEST (toward center)
  const rightX = 18.9;
  // Back wall (z=29) — pictures face SOUTH
  const backZ = 28.9;
  // Front wall (z=-29) — pictures face NORTH (visible from inside)
  const frontZ = -28.9;

  // ── LEFT WALL GALLERY (between exhibits) ──
  // Between Early Life and Martial Arts panels
  createPixelArtPicture(leftX, 3.5, -15, pixelArt.chuckBeard, 2, 'east', 0x3a2510);
  createPixelArtPicture(leftX, 3.5, -13, pixelArt.nunchucks, 1.5, 'east', 0x3a2510);

  // Between Martial Arts and Film Career
  createPixelArtPicture(leftX, 3.5, -5, pixelArt.roundhouse, 2, 'east', 0x3a2510);
  createPixelArtPicture(leftX, 3.5, -3, pixelArt.katana, 1.5, 'east', 0x3a2510);

  // Between Film Career and Facts Wall
  createPixelArtPicture(leftX, 3.5, 2, pixelArt.chuckFull, 2.2, 'east', 0xffd700);
  createPixelArtPicture(leftX, 3.5, 5, pixelArt.yinYang, 1.5, 'east', 0x3a2510);
  createPixelArtPicture(leftX, 3.5, 7, pixelArt.shuriken, 1.5, 'east', 0x3a2510);

  // After Facts Wall (north end, left wall)
  createPixelArtPicture(leftX, 3.5, 20, pixelArt.usFlag, 2, 'east', 0x3a2510);
  createPixelArtPicture(leftX, 3.5, 23, pixelArt.trophy, 1.8, 'east', 0xffd700);
  createPixelArtPicture(leftX, 3.5, 26, pixelArt.chuckFace, 2, 'east', 0x3a2510);

  // ── RIGHT WALL GALLERY (between exhibits) ──
  // Between Delta Force and Walker Badge
  createPixelArtPicture(rightX, 3.5, -15, pixelArt.cowboyHat, 2, 'west', 0x3a2510);
  createPixelArtPicture(rightX, 3.5, -13, pixelArt.shuriken, 1.5, 'west', 0x3a2510);

  // Between Walker Badge and Way of Dragon
  createPixelArtPicture(rightX, 3.5, -5, pixelArt.chuckBeard, 2, 'west', 0x3a2510);
  createPixelArtPicture(rightX, 3.5, -3, pixelArt.nunchucks, 1.5, 'west', 0x3a2510);

  // Between Way of Dragon and Training Zone
  createPixelArtPicture(rightX, 3.5, 2, pixelArt.roundhouse, 2.2, 'west', 0xffd700);
  createPixelArtPicture(rightX, 3.5, 5, pixelArt.katana, 1.5, 'west', 0x3a2510);
  createPixelArtPicture(rightX, 3.5, 7, pixelArt.chuckFull, 2, 'west', 0x3a2510);

  // After Training Zone (north end, right wall)
  createPixelArtPicture(rightX, 3.5, 20, pixelArt.trophy, 1.8, 'west', 0xffd700);
  createPixelArtPicture(rightX, 3.5, 23, pixelArt.usFlag, 2, 'west', 0x3a2510);
  createPixelArtPicture(rightX, 3.5, 26, pixelArt.yinYang, 1.8, 'west', 0x3a2510);

  // ── BACK WALL (north end behind sarcophagus) — face SOUTH ──
  createPixelArtPicture(-8, 4, backZ, pixelArt.chuckFull, 3, 'south', 0xffd700);
  createPixelArtPicture(8, 4, backZ, pixelArt.roundhouse, 3, 'south', 0xffd700);
  createPixelArtPicture(0, 7.5, backZ, pixelArt.chuckBeard, 3.5, 'south', 0xffd700);

  // ── FRONT WALL (inside entrance, flanking the entrance sign) — face SOUTH toward inside ──
  createPixelArtPicture(-8, 3.5, frontZ, pixelArt.karateKick, 2.5, 'south', 0x3a2510);
  createPixelArtPicture(8, 3.5, frontZ, pixelArt.chuckFull, 2.5, 'south', 0x3a2510);
  createPixelArtPicture(-14, 3.5, frontZ, pixelArt.usFlag, 2, 'south', 0x3a2510);
  createPixelArtPicture(14, 3.5, frontZ, pixelArt.usFlag, 2, 'south', 0x3a2510);
}

// facing: 'south'(+Z), 'north'(-Z), 'east'(+X), 'west'(-X), 'up'
function createWallArt(x, y, z, text, color, width, height, facing = 'south') {
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

  // Word wrap for long text
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
  scene.add(mesh);
  return mesh;
}

// ─── PIXEL ART PICTURE GENERATOR ────────────────────────────────────
function createPixelArtPicture(x, y, z, pixelData, pixelSize, facing = 'east', frameColor = 0x3a2510) {
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

  // Frame
  const frameGeo = new THREE.BoxGeometry(w + 0.15, h + 0.15, 0.08);
  const frameMat = new THREE.MeshLambertMaterial({ color: frameColor });
  const frame = new THREE.Mesh(frameGeo, frameMat);

  // Picture
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

  scene.add(group);
  return group;
}

// ─── PIXEL ART DATA ─────────────────────────────────────────────────
const pixelArt = {
  // Chuck Norris face (16x16 pixel art)
  chuckFace: (() => {
    const _ = null, S = '#d4a574', H = '#4a3020', E = '#222', W = '#fff', R = '#cc3333', B = '#333';
    return [
      [_,_,_,_,H,H,H,H,H,H,H,H,_,_,_,_],
      [_,_,_,H,H,H,H,H,H,H,H,H,H,_,_,_],
      [_,_,H,H,H,H,H,H,H,H,H,H,H,H,_,_],
      [_,_,H,H,S,S,S,S,S,S,S,S,H,H,_,_],
      [_,H,S,S,S,S,S,S,S,S,S,S,S,S,H,_],
      [_,H,S,S,E,E,S,S,S,S,E,E,S,S,H,_],
      [_,H,S,S,W,E,S,S,S,S,W,E,S,S,H,_],
      [_,_,S,S,S,S,S,B,B,S,S,S,S,S,_,_],
      [_,_,S,S,S,S,S,S,S,S,S,S,S,S,_,_],
      [_,_,S,S,H,H,H,H,H,H,H,H,S,S,_,_],
      [_,_,S,S,S,H,H,H,H,H,H,S,S,S,_,_],
      [_,_,_,S,S,S,R,R,R,R,S,S,S,_,_,_],
      [_,_,_,S,S,S,S,S,S,S,S,S,S,_,_,_],
      [_,_,_,_,S,S,S,S,S,S,S,S,_,_,_,_],
      [_,_,_,_,_,B,B,B,B,B,B,_,_,_,_,_],
      [_,_,_,_,B,B,B,B,B,B,B,B,_,_,_,_],
    ];
  })(),

  // Karate kick pose (16x16)
  karateKick: (() => {
    const _ = null, S = '#d4a574', W = '#fff', B = '#222', R = '#cc3333', G = '#333';
    return [
      [_,_,_,_,_,_,S,S,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,S,S,S,S,_,_,_,_,_,_,_],
      [_,_,_,_,_,S,B,S,B,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,S,S,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,W,W,W,_,_,_,_,_,_,_,_],
      [_,_,_,_,W,W,W,W,W,_,_,_,_,_,_,_],
      [_,_,_,S,W,W,R,W,W,S,_,_,_,_,_,_],
      [_,_,S,S,_,W,W,W,_,_,S,_,_,_,_,_],
      [_,_,_,_,_,W,W,W,_,_,_,S,_,_,_,_],
      [_,_,_,_,_,G,_,G,_,_,_,_,S,_,_,_],
      [_,_,_,_,G,G,_,_,G,G,G,G,G,S,_,_],
      [_,_,_,G,G,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,G,G,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,G,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    ];
  })(),

  // Film reel / clapperboard (16x16)
  filmClapper: (() => {
    const _ = null, B = '#222', W = '#ddd', G = '#888', Y = '#f5a623';
    return [
      [B,W,B,W,B,W,B,W,B,W,B,W,B,W,B,W],
      [W,B,W,B,W,B,W,B,W,B,W,B,W,B,W,B],
      [B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B],
      [B,W,W,W,W,W,W,W,W,W,W,W,W,W,W,B],
      [B,W,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,W,B],
      [B,W,W,W,W,W,W,W,W,W,W,W,W,W,W,B],
      [B,G,G,G,G,G,G,G,G,G,G,G,G,G,G,B],
      [B,G,W,W,W,W,W,W,W,W,W,W,W,W,G,B],
      [B,G,W,W,W,W,W,W,W,W,W,W,W,W,G,B],
      [B,G,W,W,W,W,W,W,W,W,W,W,W,W,G,B],
      [B,G,W,W,W,W,W,W,W,W,W,W,W,W,G,B],
      [B,G,W,W,W,W,W,W,W,W,W,W,W,W,G,B],
      [B,G,G,G,G,G,G,G,G,G,G,G,G,G,G,B],
      [B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    ];
  })(),

  // Delta Force star/patch (16x16)
  deltaPatch: (() => {
    const _ = null, G = '#2a4a2a', Y = '#f5a623', B = '#222', W = '#ddd', R = '#cc3333';
    return [
      [_,_,_,_,_,G,G,G,G,G,G,_,_,_,_,_],
      [_,_,_,G,G,G,G,G,G,G,G,G,G,_,_,_],
      [_,_,G,G,G,G,G,Y,G,G,G,G,G,G,_,_],
      [_,G,G,G,G,G,Y,Y,Y,G,G,G,G,G,G,_],
      [_,G,G,G,G,Y,Y,Y,Y,Y,G,G,G,G,G,_],
      [G,G,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,G,G],
      [G,G,G,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,G,G,G],
      [G,G,G,G,Y,Y,Y,Y,Y,Y,Y,Y,G,G,G,G],
      [G,G,G,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,G,G,G],
      [G,G,Y,Y,Y,Y,R,R,R,Y,Y,Y,Y,Y,G,G],
      [_,G,Y,Y,G,G,R,R,R,G,G,Y,Y,G,G,_],
      [_,G,G,G,G,G,R,R,R,G,G,G,G,G,G,_],
      [_,_,G,G,G,G,G,G,G,G,G,G,G,G,_,_],
      [_,_,_,G,G,G,G,G,G,G,G,G,G,_,_,_],
      [_,_,_,_,_,G,G,G,G,G,G,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    ];
  })(),

  // Texas Ranger badge (star shape, 16x16)
  rangerBadge: (() => {
    const _ = null, Y = '#ffd700', B = '#b8860b', W = '#fff', D = '#8B6914';
    return [
      [_,_,_,_,_,_,_,Y,Y,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,Y,Y,Y,Y,_,_,_,_,_,_],
      [_,_,_,_,_,_,Y,Y,Y,Y,_,_,_,_,_,_],
      [Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y],
      [_,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,_],
      [_,_,Y,Y,Y,Y,B,B,B,B,Y,Y,Y,Y,_,_],
      [_,_,_,Y,Y,B,B,W,W,B,B,Y,Y,_,_,_],
      [_,_,_,Y,Y,B,W,W,W,W,B,Y,Y,_,_,_],
      [_,_,_,Y,Y,B,W,W,W,W,B,Y,Y,_,_,_],
      [_,_,_,Y,Y,B,B,W,W,B,B,Y,Y,_,_,_],
      [_,_,Y,Y,Y,Y,B,B,B,B,Y,Y,Y,Y,_,_],
      [_,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,_],
      [Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y],
      [_,_,_,_,_,_,Y,D,D,Y,_,_,_,_,_,_],
      [_,_,_,_,_,_,Y,Y,Y,Y,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,Y,Y,_,_,_,_,_,_,_],
    ];
  })(),

  // Dragon (Way of the Dragon, 16x16)
  dragon: (() => {
    const _ = null, R = '#cc2222', O = '#ee6622', Y = '#ffaa00', B = '#222', W = '#fff';
    return [
      [_,_,_,_,_,_,_,_,_,_,R,R,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,R,R,R,R,_,_,_],
      [_,_,_,_,_,R,R,_,R,R,W,B,R,_,_,_],
      [_,_,_,_,R,R,R,R,R,R,R,R,R,R,_,_],
      [_,_,_,R,R,R,R,R,R,R,Y,R,R,_,_,_],
      [_,_,R,R,O,R,R,R,R,R,R,R,_,_,_,_],
      [_,R,R,R,R,O,R,R,R,R,R,_,_,_,_,_],
      [R,R,_,R,R,R,O,R,R,R,_,_,_,_,_,_],
      [R,_,_,_,R,R,R,R,R,_,_,_,_,_,_,_],
      [_,_,_,_,R,R,R,R,R,R,_,_,_,_,_,_],
      [_,_,_,R,R,_,R,R,_,R,R,_,_,_,_,_],
      [_,_,R,R,_,_,R,R,_,_,R,R,_,_,_,_],
      [_,R,R,_,_,_,R,R,_,_,_,R,R,_,_,_],
      [R,R,_,_,_,_,_,R,R,_,_,_,R,R,_,_],
      [O,O,_,_,_,_,_,O,O,_,_,_,_,O,O,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    ];
  })(),

  // Black belt (16x16)
  blackBelt: (() => {
    const _ = null, B = '#111', G = '#888', Y = '#ffd700', W = '#ddd';
    return [
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,B,B,B,B,B,B,B,B,B,B,B,B,B,B,_],
      [B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B],
      [B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B],
      [_,B,B,B,B,B,B,Y,Y,B,B,B,B,B,B,_],
      [_,_,_,_,_,_,B,Y,Y,B,_,_,_,_,_,_],
      [_,_,_,_,_,_,B,Y,Y,B,_,_,_,_,_,_],
      [_,_,_,_,_,B,B,B,B,B,B,_,_,_,_,_],
      [_,_,_,_,B,B,G,G,G,G,B,B,_,_,_,_],
      [_,_,_,_,B,B,B,B,B,B,B,B,_,_,_,_],
      [_,_,_,_,_,B,B,B,B,B,B,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    ];
  })(),

  // Fire / facts icon (16x16)
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

  // Sarcophagus icon (16x16)
  sarcIcon: (() => {
    const _ = null, G = '#ffd700', O = '#333', D = '#b8860b', B = '#111';
    return [
      [_,_,_,_,G,G,G,G,G,G,G,G,_,_,_,_],
      [_,_,_,G,G,D,D,D,D,D,D,G,G,_,_,_],
      [_,_,G,G,D,D,G,G,G,G,D,D,G,G,_,_],
      [_,G,G,D,D,D,D,D,D,D,D,D,D,G,G,_],
      [_,G,O,O,O,O,O,O,O,O,O,O,O,O,G,_],
      [_,G,O,O,O,O,O,G,G,O,O,O,O,O,G,_],
      [_,G,O,O,O,O,G,G,G,G,O,O,O,O,G,_],
      [_,G,O,O,O,O,G,B,B,G,O,O,O,O,G,_],
      [_,G,O,O,O,O,G,B,B,G,O,O,O,O,G,_],
      [_,G,O,O,O,O,G,G,G,G,O,O,O,O,G,_],
      [_,G,O,O,O,O,O,G,G,O,O,O,O,O,G,_],
      [_,G,O,O,O,O,O,O,O,O,O,O,O,O,G,_],
      [_,G,G,D,D,D,D,D,D,D,D,D,D,G,G,_],
      [_,_,G,G,G,G,G,G,G,G,G,G,G,G,_,_],
      [_,_,_,G,G,G,G,G,G,G,G,G,G,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    ];
  })(),

  // Training / fist icon (16x16)
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

  // Roundhouse kick (16x16)
  roundhouse: (() => {
    const _ = null, S = '#d4a574', W = '#fff', B = '#222', R = '#cc3333', G = '#444';
    return [
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,S,S,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,S,S,S,S,_,_,_,_,_,_],
      [_,_,_,_,_,_,S,B,S,B,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,S,S,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,W,W,W,_,_,_,_,_,_,_],
      [_,_,_,_,_,W,W,R,W,W,_,_,_,_,_,_],
      [_,_,_,_,S,W,W,W,W,W,S,_,_,_,_,_],
      [_,_,_,S,_,_,W,W,W,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,G,_,G,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,G,_,_,G,G,G,G,S,S,_],
      [_,_,_,_,_,G,G,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,G,G,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,G,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    ];
  })(),

  // Nunchucks (16x16)
  nunchucks: (() => {
    const _ = null, B = '#5c3a1e', D = '#3d2510', C = '#888', G = '#666';
    return [
      [_,_,_,B,B,_,_,_,_,_,_,B,B,_,_,_],
      [_,_,_,B,B,_,_,_,_,_,_,B,B,_,_,_],
      [_,_,_,B,B,_,_,_,_,_,_,B,B,_,_,_],
      [_,_,_,D,D,_,_,_,_,_,_,D,D,_,_,_],
      [_,_,_,B,B,_,_,_,_,_,_,B,B,_,_,_],
      [_,_,_,B,B,_,_,_,_,_,_,B,B,_,_,_],
      [_,_,_,D,D,_,_,_,_,_,_,D,D,_,_,_],
      [_,_,_,B,B,_,_,_,_,_,_,B,B,_,_,_],
      [_,_,_,B,B,_,_,_,_,_,_,B,B,_,_,_],
      [_,_,_,_,B,C,_,_,_,_,C,B,_,_,_,_],
      [_,_,_,_,_,B,C,_,_,C,B,_,_,_,_,_],
      [_,_,_,_,_,_,C,C,C,C,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,G,G,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    ];
  })(),

  // Cowboy hat / Walker (16x16)
  cowboyHat: (() => {
    const _ = null, B = '#8B6914', D = '#6B4F12', L = '#c4a44a', G = '#ffd700';
    return [
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,B,B,B,B,_,_,_,_,_,_],
      [_,_,_,_,_,B,B,B,B,B,B,_,_,_,_,_],
      [_,_,_,_,B,B,L,L,L,L,B,B,_,_,_,_],
      [_,_,_,_,B,L,L,L,L,L,L,B,_,_,_,_],
      [_,_,_,B,B,L,L,G,G,L,L,B,B,_,_,_],
      [_,_,B,B,D,D,D,D,D,D,D,D,B,B,_,_],
      [_,B,B,D,D,D,D,D,D,D,D,D,D,B,B,_],
      [B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B],
      [_,B,B,B,B,B,B,B,B,B,B,B,B,B,B,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    ];
  })(),

  // Trophy (16x16)
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

  // Yin-yang (16x16)
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

  // US Flag (16x16)
  usFlag: (() => {
    const _ = null, R = '#cc2222', W = '#eee', B = '#1a3a6a', S = '#fff';
    return [
      [B,S,B,S,B,S,B,R,R,R,R,R,R,R,R,R],
      [S,B,S,B,S,B,S,W,W,W,W,W,W,W,W,W],
      [B,S,B,S,B,S,B,R,R,R,R,R,R,R,R,R],
      [S,B,S,B,S,B,S,W,W,W,W,W,W,W,W,W],
      [B,S,B,S,B,S,B,R,R,R,R,R,R,R,R,R],
      [S,B,S,B,S,B,S,W,W,W,W,W,W,W,W,W],
      [B,S,B,S,B,S,B,R,R,R,R,R,R,R,R,R],
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
      [R,R,R,R,R,R,R,R,R,R,R,R,R,R,R,R],
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
      [R,R,R,R,R,R,R,R,R,R,R,R,R,R,R,R],
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
      [R,R,R,R,R,R,R,R,R,R,R,R,R,R,R,R],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    ];
  })(),

  // Chuck Norris standing full body (16x16)
  chuckFull: (() => {
    const _ = null, S = '#d4a574', H = '#4a3020', B = '#222', W = '#333', R = '#cc3333', Bl = '#111', Sh = '#555';
    return [
      [_,_,_,_,_,_,H,H,H,H,_,_,_,_,_,_],
      [_,_,_,_,_,H,H,H,H,H,H,_,_,_,_,_],
      [_,_,_,_,_,H,S,S,S,S,H,_,_,_,_,_],
      [_,_,_,_,_,S,S,B,S,B,S,_,_,_,_,_],
      [_,_,_,_,_,S,H,S,S,H,S,_,_,_,_,_],
      [_,_,_,_,_,_,S,R,R,S,_,_,_,_,_,_],
      [_,_,_,_,_,_,S,S,S,S,_,_,_,_,_,_],
      [_,_,_,_,W,W,W,W,W,W,W,W,_,_,_,_],
      [_,_,_,S,W,W,W,R,R,W,W,W,S,_,_,_],
      [_,_,S,S,_,W,W,W,W,W,W,_,S,S,_,_],
      [_,_,_,_,_,W,W,W,W,W,W,_,_,_,_,_],
      [_,_,_,_,_,Bl,Bl,_,Bl,Bl,_,_,_,_,_],
      [_,_,_,_,_,Bl,Bl,_,Bl,Bl,_,_,_,_,_],
      [_,_,_,_,_,Bl,Bl,_,Bl,Bl,_,_,_,_,_],
      [_,_,_,_,_,Sh,Sh,_,Sh,Sh,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    ];
  })(),

  // Shuriken / throwing star (16x16)
  shuriken: (() => {
    const _ = null, M = '#888', D = '#555', L = '#ccc';
    return [
      [_,_,_,_,_,_,_,M,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,M,M,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,M,D,M,_,_,_,_,_,_,_,_],
      [_,_,_,_,M,D,D,M,_,_,_,_,_,_,_,_],
      [_,_,_,M,D,D,L,M,_,_,_,M,_,_,_,_],
      [_,_,M,D,D,L,L,M,M,M,M,D,M,_,_,_],
      [_,M,D,D,L,L,L,L,D,D,D,D,D,M,_,_],
      [M,M,M,M,M,M,L,L,L,M,M,M,M,M,M,_],
      [_,_,M,D,D,D,D,L,L,L,L,D,D,M,_,_],
      [_,_,_,M,D,M,M,M,L,L,D,D,M,_,_,_],
      [_,_,_,_,M,_,_,_,M,L,D,D,M,_,_,_],
      [_,_,_,_,_,_,_,_,M,D,D,M,_,_,_,_],
      [_,_,_,_,_,_,_,_,M,D,M,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,M,M,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,M,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    ];
  })(),

  // Katana sword (16x16)
  katana: (() => {
    const _ = null, B = '#333', S = '#ccc', W = '#fff', G = '#8B6914', R = '#8B0000', D = '#222';
    return [
      [_,_,_,_,_,_,_,_,_,_,_,_,_,_,W,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,_,W,S,_],
      [_,_,_,_,_,_,_,_,_,_,_,_,W,S,_,_],
      [_,_,_,_,_,_,_,_,_,_,_,W,S,_,_,_],
      [_,_,_,_,_,_,_,_,_,_,W,S,_,_,_,_],
      [_,_,_,_,_,_,_,_,_,W,S,_,_,_,_,_],
      [_,_,_,_,_,_,_,_,W,S,_,_,_,_,_,_],
      [_,_,_,_,_,_,_,W,S,_,_,_,_,_,_,_],
      [_,_,_,_,_,_,W,S,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,W,S,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,G,G,G,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,_,R,_,_,_,_,_,_,_,_,_,_],
      [_,_,_,_,R,D,R,_,_,_,_,_,_,_,_,_],
      [_,_,_,R,D,R,_,_,_,_,_,_,_,_,_,_],
      [_,_,R,D,R,_,_,_,_,_,_,_,_,_,_,_],
      [_,_,R,R,_,_,_,_,_,_,_,_,_,_,_,_],
    ];
  })(),

  // Chuck Norris beard close-up (16x16)
  chuckBeard: (() => {
    const _ = null, S = '#d4a574', H = '#4a3020', E = '#222', W = '#fff', R = '#b8916a';
    return [
      [_,_,H,H,H,H,H,H,H,H,H,H,H,H,_,_],
      [_,H,H,H,H,H,H,H,H,H,H,H,H,H,H,_],
      [H,H,H,H,H,H,H,H,H,H,H,H,H,H,H,H],
      [H,H,S,S,S,S,S,S,S,S,S,S,S,S,H,H],
      [H,S,S,S,S,S,S,S,S,S,S,S,S,S,S,H],
      [S,S,S,E,W,S,S,S,S,S,S,E,W,S,S,S],
      [S,S,S,E,E,S,S,S,S,S,S,E,E,S,S,S],
      [S,S,S,S,S,S,S,R,R,S,S,S,S,S,S,S],
      [S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S],
      [S,S,H,H,H,H,H,H,H,H,H,H,H,H,S,S],
      [S,H,H,H,H,H,H,H,H,H,H,H,H,H,H,S],
      [_,H,H,H,H,H,H,H,H,H,H,H,H,H,H,_],
      [_,_,H,H,H,H,H,H,H,H,H,H,H,H,_,_],
      [_,_,_,H,H,H,H,H,H,H,H,H,H,_,_,_],
      [_,_,_,_,H,H,H,H,H,H,H,H,_,_,_,_],
      [_,_,_,_,_,_,H,H,H,H,_,_,_,_,_,_],
    ];
  })(),
};

// ─── LIGHTING ───────────────────────────────────────────────────────
function setupLighting() {
  const ambient = new THREE.AmbientLight(0xffffff, 1.4);
  scene.add(ambient);

  // Hemisphere light for natural sky/ground fill
  const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x8B7355, 0.8);
  scene.add(hemiLight);

  // Main directional light (sun)
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
  scene.add(dirLight);

  // Warm point lights for atmosphere
  const warmPositions = [
    [0, 6, -20], [0, 6, 0], [0, 6, 20],
    [-12, 6, -10], [12, 6, -10],
    [-12, 6, 15], [12, 6, 15],
    [0, 6, 22]
  ];
  warmPositions.forEach(pos => {
    const pl = new THREE.PointLight(0xffcc77, 1.0, 25);
    pl.position.set(...pos);
    scene.add(pl);
  });

  // Sarcophagus special lighting
  const sarcLight = new THREE.PointLight(0xf5a623, 2.0, 20);
  sarcLight.position.set(0, 7, 22);
  scene.add(sarcLight);

  // Lava glow
  const lavaLight = new THREE.PointLight(0xff4400, 1.0, 12);
  lavaLight.position.set(0, 1, 22);
  scene.add(lavaLight);
}

// ─── SKYBOX ─────────────────────────────────────────────────────────
function createSkybox() {
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
  // Clouds
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
  scene.add(sky);
}

// ─── FIRST-PERSON CONTROLS ─────────────────────────────────────────
function setupControls() {
  const blocker = document.getElementById('blocker');
  const canvas = renderer.domElement;

  blocker.addEventListener('click', () => {
    canvas.requestPointerLock();
  });

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) {
      isLocked = true;
      blocker.style.display = 'none';
      document.getElementById('crosshair').style.display = 'block';
      document.getElementById('hud').style.display = 'block';
      document.getElementById('social-bar').style.display = 'flex';
      if (minimapVisible) document.getElementById('minimap').style.display = 'block';
    } else {
      if (!exhibitOpen) {
        isLocked = false;
        blocker.style.display = 'flex';
        document.getElementById('crosshair').style.display = 'none';
        document.getElementById('hud').style.display = 'none';
        document.getElementById('minimap').style.display = 'none';
        document.getElementById('social-bar').style.display = 'none';
      }
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (!isLocked) return;
    const sensitivity = 0.002;
    yaw -= e.movementX * sensitivity;
    pitch -= e.movementY * sensitivity;
    pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
  });

  document.addEventListener('keydown', (e) => {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': moveForward = true; break;
      case 'KeyS': case 'ArrowDown': moveBackward = true; break;
      case 'KeyA': case 'ArrowLeft': moveLeft = true; break;
      case 'KeyD': case 'ArrowRight': moveRight = true; break;
      case 'Space':
        if (canJump && isLocked) { velocity.y = jumpSpeed; canJump = false; }
        break;
      case 'KeyE':
        if (isLocked) handleInteract();
        break;
      case 'KeyM':
        minimapVisible = !minimapVisible;
        document.getElementById('minimap').style.display = minimapVisible && isLocked ? 'block' : 'none';
        break;
      case 'KeyT':
        if (isLocked && !exhibitOpen && !chatOpen) {
          e.preventDefault();
          openChat();
        }
        break;
      case 'Escape':
        if (exhibitOpen) {
          closeExhibit();
          e.preventDefault();
        }
        break;
      case 'Digit1': selectHotbarSlot(0); break;
      case 'Digit2': selectHotbarSlot(1); break;
    }
  });

  document.addEventListener('keyup', (e) => {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': moveForward = false; break;
      case 'KeyS': case 'ArrowDown': moveBackward = false; break;
      case 'KeyA': case 'ArrowLeft': moveLeft = false; break;
      case 'KeyD': case 'ArrowRight': moveRight = false; break;
    }
  });

  // Chat input handlers
  const chatInput = document.getElementById('chat-input');
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation(); // Prevent game controls while typing
      if (e.code === 'Enter') {
        sendChatMessage();
      } else if (e.code === 'Escape') {
        closeChat();
        renderer.domElement.requestPointerLock();
      }
    });
  }
}

function handleInteract() {
  if (exhibitOpen) {
    closeExhibit();
    return;
  }

  if (currentExhibit) {
    openExhibit(currentExhibit);
  }
}

function openExhibit(key) {
  const data = exhibitData[key];
  if (!data) return;
  exhibitOpen = true;
  document.getElementById('exhibit-title').textContent = data.title;
  document.getElementById('exhibit-body').innerHTML = data.body;
  document.getElementById('exhibit-panel').style.display = 'block';
  document.getElementById('interact-prompt').style.display = 'none';
}

function closeExhibit() {
  exhibitOpen = false;
  document.getElementById('exhibit-panel').style.display = 'none';
}

// ─── COLLISION DETECTION ────────────────────────────────────────────
function checkCollision(newPos) {
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

// ─── MINIMAP ────────────────────────────────────────────────────────
function updateMinimap() {
  if (!minimapVisible) return;
  const canvas = document.getElementById('minimap-canvas');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, 140, 140);

  const scale = 1.5;
  const ox = 70 - playerPos.x * scale;
  const oz = 70 - playerPos.z * scale;

  // Draw walls (simplified)
  ctx.fillStyle = '#555';
  ctx.fillRect(ox + (-20) * scale, oz + (-30) * scale, 40 * scale, 60 * scale);
  ctx.fillStyle = '#222';
  ctx.fillRect(ox + (-19) * scale, oz + (-29) * scale, 38 * scale, 58 * scale);

  // Draw exhibit markers
  ctx.fillStyle = '#f5a623';
  interactables.forEach(item => {
    const sx = ox + item.position.x * scale;
    const sy = oz + item.position.z * scale;
    ctx.fillRect(sx - 2, sy - 2, 4, 4);
  });

  // Draw player
  ctx.fillStyle = '#00ff00';
  ctx.beginPath();
  ctx.arc(70, 70, 3, 0, Math.PI * 2);
  ctx.fill();

  // Draw direction
  ctx.strokeStyle = '#00ff00';
  ctx.beginPath();
  ctx.moveTo(70, 70);
  ctx.lineTo(70 + Math.sin(yaw) * 10, 70 - Math.cos(yaw) * 10);
  ctx.stroke();
}

// ─── AUDIO ──────────────────────────────────────────────────────────
let audioCtx, backgroundMusic;
function initAudio() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  playAmbientMusic();
}

function playAmbientMusic() {
  if (!audioCtx) return;

  // Generate a simple ambient track using oscillators
  const now = audioCtx.currentTime;

  function playNote(freq, start, dur, type = 'sine', vol = 0.03) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now + start);
    gain.gain.linearRampToValueAtTime(vol, now + start + 0.1);
    gain.gain.setValueAtTime(vol, now + start + dur - 0.2);
    gain.gain.linearRampToValueAtTime(0, now + start + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now + start);
    osc.stop(now + start + dur);
  }

  // Epic ambient melody loop
  const melody = [
    [220, 0], [261.63, 2], [329.63, 4], [293.66, 6],
    [261.63, 8], [220, 10], [196, 12], [220, 14],
    [261.63, 16], [329.63, 18], [349.23, 20], [329.63, 22],
    [293.66, 24], [261.63, 26], [220, 28], [196, 30]
  ];

  melody.forEach(([freq, start]) => {
    playNote(freq, start, 2.5, 'sine', 0.025);
    playNote(freq / 2, start, 3, 'triangle', 0.015);
  });

  // Pad drone
  playNote(110, 0, 32, 'triangle', 0.02);
  playNote(82.41, 0, 32, 'sine', 0.015);

  // Loop it
  setTimeout(() => {
    if (audioCtx && audioCtx.state === 'running') {
      playAmbientMusic();
    }
  }, 31000);
}

// ─── SOCIAL SHARING ─────────────────────────────────────────────────
window.shareTo = function(platform) {
  const url = encodeURIComponent(window.location.href);
  const text = encodeURIComponent("I'm exploring PVP WARS! ⚔️🚀");
  switch (platform) {
    case 'twitter':
      window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
      break;
    case 'facebook':
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
      break;
    case 'clipboard':
      navigator.clipboard.writeText(window.location.href);
      break;
  }
};

// ─── LOADING ────────────────────────────────────────────────────────
function updateLoading(pct, text) {
  document.getElementById('load-bar').style.width = pct + '%';
  document.getElementById('load-text').textContent = text;
}

// ─── PARTICLE SYSTEM (sarcophagus aura) ─────────────────────────────
let particles;
function createParticles() {
  const count = 200;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 10;
    positions[i * 3 + 1] = Math.random() * 8 + 1;
    positions[i * 3 + 2] = 22 + (Math.random() - 0.5) * 10;
    colors[i * 3] = 0.96;
    colors[i * 3 + 1] = 0.65 + Math.random() * 0.2;
    colors[i * 3 + 2] = 0.14;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.08, vertexColors: true, transparent: true, opacity: 0.6
  });
  particles = new THREE.Points(geo, mat);
  scene.add(particles);
}

function updateParticles(time) {
  if (!particles) return;
  const pos = particles.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.array[i * 3 + 1] += Math.sin(time * 2 + i) * 0.003;
    if (pos.array[i * 3 + 1] > 9) pos.array[i * 3 + 1] = 1;
  }
  pos.needsUpdate = true;
}

// ─── HAND & SWORD MODEL ─────────────────────────────────────────────

// Minecraft Steve skin-tone texture (4px arm mapped to 3D)
function makeSteveArmTex() {
  const canvas = document.createElement('canvas');
  canvas.width = 16; canvas.height = 16;
  const ctx = canvas.getContext('2d');
  // Skin base
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
  // Teal shirt like Steve's
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

// Build a Minecraft Steve arm (4x12x4 pixel proportions, scaled)
function buildSteveArm() {
  const group = new THREE.Group();
  const px = 0.0625; // 1 pixel unit
  const skinMat = new THREE.MeshLambertMaterial({ map: makeSteveArmTex() });
  const shirtMat = new THREE.MeshLambertMaterial({ map: makeSteveShirtTex() });

  // Arm dimensions: 4x12x4 px = 0.25 x 0.75 x 0.25 world units
  const armW = 4 * px;
  const armH = 12 * px;
  const armD = 4 * px;

  // Upper arm (shirt sleeve) — top 4px
  const sleeve = new THREE.Mesh(
    new THREE.BoxGeometry(armW + 0.01, 4 * px, armD + 0.01),
    shirtMat
  );
  sleeve.position.set(0, -2 * px, 0);
  group.add(sleeve);

  // Lower arm (skin) — bottom 8px
  const forearm = new THREE.Mesh(
    new THREE.BoxGeometry(armW, 8 * px, armD),
    skinMat
  );
  forearm.position.set(0, -8 * px, 0);
  group.add(forearm);

  return { group, skinMat, armW, armH, armD, px };
}

// Diamond sword texture — flat pixel art on a plane
function makeDiamondSwordTex() {
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Transparent background
  ctx.clearRect(0, 0, size, size);

  // Sword pixel art (16x16, drawn bottom-left handle to top-right tip)
  const _ = null;
  const B = [101, 67, 33];   // brown handle
  const D = [50, 33, 16];    // dark handle wrap
  const G = [255, 215, 0];   // gold guard
  const C = [80, 210, 230];  // cyan blade
  const L = [130, 240, 255]; // light blade edge
  const W = [200, 250, 255]; // white highlight

  const pixels = [
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,W,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,W,L,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,W,L,C,_],
    [_,_,_,_,_,_,_,_,_,_,_,W,L,C,_,_],
    [_,_,_,_,_,_,_,_,_,_,W,L,C,_,_,_],
    [_,_,_,_,_,_,_,_,_,W,L,C,_,_,_,_],
    [_,_,_,_,_,_,_,_,W,L,C,_,_,_,_,_],
    [_,_,_,_,_,_,_,W,L,C,_,_,_,_,_,_],
    [_,_,_,_,_,_,C,L,C,_,_,_,_,_,_,_],
    [_,_,_,_,_,C,L,C,_,_,_,_,_,_,_,_],
    [_,_,_,_,G,G,G,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,D,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,D,B,D,_,_,_,_,_,_,_,_,_],
    [_,_,_,D,B,D,_,_,_,_,_,_,_,_,_,_],
    [_,_,D,B,D,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,D,D,_,_,_,_,_,_,_,_,_,_,_,_],
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = pixels[y][x];
      if (c) {
        ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

function createHandModel() {
  // ── SLOT 0: BARE FIST (Steve arm, no item) ──
  const fistArm = buildSteveArm();
  fistGroup = fistArm.group;
  fistGroup.position.set(0.672, -0.508, -1.196);
  fistGroup.rotation.set(-1.440, -3.139, 0.104);
  camera.add(fistGroup);

  // ── SLOT 1: DIAMOND SWORD SPRITE (2D viewmodel, bottom-right) ──
  swordHandGroup = new THREE.Group();
  swordHandGroup.position.set(0.210, -0.110, -0.250);
  swordHandGroup.rotation.set(0.260, -1.440, -0.360);
  swordHandGroup.visible = false; // fist is default
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
  swordImg.src = 'public/assets/Sprite-0001.png';

  scene.add(camera);
}

function swingSword() {
  if (isSwinging) return;
  isSwinging = true;
  swordSwing = 0.90;
  sendSwing();
}

function selectHotbarSlot(index) {
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

function updateHandAnimation(delta, time) {
  const hand = getActiveHandGroup();
  if (!hand) return;

  const isSword = (activeSlot === 1);
  const baseX = isSword ? 0.210 : 0.672;
  const baseY = isSword ? -0.110 : -0.508;
  const baseRotX = isSword ? 0.260 : -1.440;
  const baseRotZ = isSword ? -0.360 : 0.104;

  // Both hand models stay fixed (no movement bob)
  hand.position.x = baseX;
  hand.position.y = baseY;

  // Swing animation (sword only, fist stays static)
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

// ─── MULTIPLAYER SYSTEM ──────────────────────────────────────────────

function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${location.host}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[MP] Connected to server');
    addChatMessage(null, 'Connected to multiplayer server', true);
    // Send our name
    if (myPlayerName && myPlayerName !== 'Player') {
      ws.send(JSON.stringify({ type: 'set_name', name: myPlayerName }));
    }
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleServerMessage(msg);
    } catch (e) {
      // Ignore
    }
  };

  ws.onclose = () => {
    console.log('[MP] Disconnected');
    addChatMessage(null, 'Disconnected from server. Reconnecting...', true);
    // Remove all remote players
    remotePlayers.forEach((rp, id) => removeRemotePlayer(id));
    remotePlayers.clear();
    onlineCount = 1;
    updatePlayerCount();
    // Reconnect after delay
    setTimeout(() => connectWebSocket(), 3000);
  };

  ws.onerror = () => {
    // onclose will fire after this
  };
}

function handleServerMessage(msg) {
  switch (msg.type) {
    case 'init': {
      myPlayerId = msg.id;
      myPlayerColor = msg.color;
      onlineCount = msg.players.length;
      updatePlayerCount();
      // Create remote player models for everyone already connected
      msg.players.forEach(p => {
        if (p.id !== myPlayerId) {
          createRemotePlayer(p);
        }
      });
      break;
    }

    case 'player_join': {
      if (msg.player.id !== myPlayerId) {
        createRemotePlayer(msg.player);
        onlineCount++;
        updatePlayerCount();
        addChatMessage(null, `${msg.player.name} joined the museum`, true);
      }
      break;
    }

    case 'player_leave': {
      if (msg.id !== myPlayerId) {
        const rp = remotePlayers.get(msg.id);
        const name = rp ? rp.data.name : 'Player ' + msg.id;
        removeRemotePlayer(msg.id);
        remotePlayers.delete(msg.id);
        onlineCount = Math.max(1, onlineCount - 1);
        updatePlayerCount();
        addChatMessage(null, `${name} left the museum`, true);
      }
      break;
    }

    case 'player_update': {
      const rp = remotePlayers.get(msg.id);
      if (rp) {
        rp.targetPos = new THREE.Vector3(msg.x, msg.y, msg.z);
        rp.targetYaw = msg.yaw;
        rp.targetPitch = msg.pitch;
        rp.data.activeSlot = msg.activeSlot;
        rp.data.isSwinging = msg.isSwinging;
      }
      break;
    }

    case 'player_name': {
      const rp = remotePlayers.get(msg.id);
      if (rp) {
        rp.data.name = msg.name;
        updateRemotePlayerLabel(rp);
      }
      break;
    }

    case 'player_swing': {
      const rp = remotePlayers.get(msg.id);
      if (rp) {
        triggerRemoteSwing(rp);
      }
      break;
    }

    case 'chat': {
      addChatMessage(msg.name, msg.text, false);
      break;
    }
  }
}

function sendPositionUpdate() {
  if (!ws || ws.readyState !== 1) return;
  const now = performance.now();
  if (now - lastSendTime < SEND_RATE) return;
  lastSendTime = now;

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

function sendSwing() {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: 'swing' }));
}

// ─── REMOTE PLAYER 3D MODEL ─────────────────────────────────────────

function makePlayerTexture(baseR, baseG, baseB, variation = 8) {
  const canvas = document.createElement('canvas');
  canvas.width = 8; canvas.height = 8;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
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

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function createRemotePlayer(data) {
  if (remotePlayers.has(data.id)) return;

  const group = new THREE.Group();
  const color = hexToRgb(data.color || '#ff4444');

  // Minecraft Steve-style body: head (8x8x8), body (8x12x4), arms (4x12x4), legs (4x12x4)
  // Scale: 1px = 0.0625 units, but we scale up for visibility
  const px = 0.0625;

  // ── HEAD (8x8x8 px) ──
  const headGeo = new THREE.BoxGeometry(8 * px, 8 * px, 8 * px);
  const skinTex = makePlayerTexture(196, 152, 108);
  const headMat = new THREE.MeshLambertMaterial({ map: skinTex });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.5 + 4 * px; // above body
  head.castShadow = true;
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

  // ── BODY (8x12x4 px) ──
  const bodyGeo = new THREE.BoxGeometry(8 * px, 12 * px, 4 * px);
  const shirtTex = makePlayerTexture(color.r, color.g, color.b);
  const bodyMat = new THREE.MeshLambertMaterial({ map: shirtTex });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.75 + 6 * px;
  body.castShadow = true;
  group.add(body);

  // ── LEFT ARM (4x12x4 px) ──
  const armGeo = new THREE.BoxGeometry(4 * px, 12 * px, 4 * px);
  const armMat = new THREE.MeshLambertMaterial({ map: makePlayerTexture(color.r * 0.8, color.g * 0.8, color.b * 0.8) });
  const leftArm = new THREE.Mesh(armGeo, armMat);
  leftArm.position.set(-6 * px, 0.75 + 6 * px, 0);
  leftArm.castShadow = true;
  group.add(leftArm);

  // ── RIGHT ARM ──
  const rightArm = new THREE.Mesh(armGeo, armMat.clone());
  rightArm.position.set(6 * px, 0.75 + 6 * px, 0);
  rightArm.castShadow = true;
  group.add(rightArm);

  // ── HELD SWORD (child of leftArm so it swings with arm) ──
  const heldSword = createRemoteSwordSprite();
  heldSword.position.set(-0.0820, -0.1760, 0.2870);
  heldSword.rotation.set(0.210, 1.060, -0.200);
  heldSword.visible = (data.activeSlot === 1);
  leftArm.add(heldSword);

  // ── LEFT LEG (4x12x4 px) ──
  const legGeo = new THREE.BoxGeometry(4 * px, 12 * px, 4 * px);
  const legTex = makePlayerTexture(50, 50, 80);
  const legMat = new THREE.MeshLambertMaterial({ map: legTex });
  const leftLeg = new THREE.Mesh(legGeo, legMat);
  leftLeg.position.set(-2 * px, 6 * px, 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);

  // ── RIGHT LEG ──
  const rightLeg = new THREE.Mesh(legGeo, legMat.clone());
  rightLeg.position.set(2 * px, 6 * px, 0);
  rightLeg.castShadow = true;
  group.add(rightLeg);

  // Position the group
  group.position.set(data.x || 0, (data.y || 2.7) - 1.7, data.z || -28);
  scene.add(group);

  // ── NAME LABEL ──
  const nameLabel = createPlayerNameLabel(data.name || ('Player ' + data.id), data.color || '#ff4444');
  nameLabel.position.set(0, 2.2, 0);
  group.add(nameLabel);

  const rpObj = {
    group,
    head,
    body,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    heldSword,
    nameLabel,
    data: { ...data },
    targetPos: new THREE.Vector3(data.x || 0, data.y || 2.7, data.z || -28),
    targetYaw: data.yaw || 0,
    targetPitch: data.pitch || 0,
    swingTime: 0,
    walkPhase: 0,
  };

  remotePlayers.set(data.id, rpObj);
}

function createPlayerNameLabel(name, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 48;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 8, 256, 32);
  ctx.fillStyle = color || '#f5a623';
  ctx.font = 'bold 22px Courier New';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 128, 24);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  const geo = new THREE.PlaneGeometry(1.6, 0.3);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 999;
  return mesh;
}

function updateRemotePlayerLabel(rp) {
  // Rebuild label texture
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 48;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 8, 256, 32);
  ctx.fillStyle = rp.data.color || '#f5a623';
  ctx.font = 'bold 22px Courier New';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(rp.data.name, 128, 24);
  rp.nameLabel.material.map = new THREE.CanvasTexture(canvas);
  rp.nameLabel.material.map.magFilter = THREE.NearestFilter;
  rp.nameLabel.material.map.needsUpdate = true;
}

function removeRemotePlayer(id) {
  const rp = remotePlayers.get(id);
  if (!rp) return;
  scene.remove(rp.group);
  // Dispose geometries and materials
  rp.group.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (child.material.map) child.material.map.dispose();
      child.material.dispose();
    }
  });
}

function createRemoteSwordSprite() {
  const group = new THREE.Group();

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
    });
    const swordPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.140, 1.630), swordMat);
    group.add(swordPlane);
  };
  swordImg.src = 'public/assets/Sprite-0001.png';

  return group;
}

function triggerRemoteSwing(rp) {
  rp.swingTime = 0.5;
}

function updateRemotePlayers(delta, time) {
  remotePlayers.forEach((rp) => {
    // Smooth interpolation toward target position
    const lerpFactor = Math.min(1, delta * 12);
    const currentPos = rp.group.position;
    const targetFeetY = rp.targetPos.y - 1.7; // convert eye height to feet

    const prevX = currentPos.x;
    const prevZ = currentPos.z;

    currentPos.x += (rp.targetPos.x - currentPos.x) * lerpFactor;
    currentPos.y += (targetFeetY - currentPos.y) * lerpFactor;
    currentPos.z += (rp.targetPos.z - currentPos.z) * lerpFactor;

    // Calculate movement speed for walk animation
    const dx = currentPos.x - prevX;
    const dz = currentPos.z - prevZ;
    const speed = Math.sqrt(dx * dx + dz * dz) / delta;

    // Rotate body to face movement direction (yaw)
    const targetRotY = -rp.targetYaw + Math.PI;
    let rotDiff = targetRotY - rp.group.rotation.y;
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    rp.group.rotation.y += rotDiff * lerpFactor;

    // Walk animation (swing arms and legs)
    if (speed > 0.5) {
      rp.walkPhase += delta * speed * 2;
      const swing = Math.sin(rp.walkPhase) * 0.6;
      rp.leftArm.rotation.x = swing;
      rp.rightArm.rotation.x = -swing;
      rp.leftLeg.rotation.x = -swing;
      rp.rightLeg.rotation.x = swing;
    } else {
      // Idle — gently return to rest
      rp.leftArm.rotation.x *= 0.9;
      rp.rightArm.rotation.x *= 0.9;
      rp.leftLeg.rotation.x *= 0.9;
      rp.rightLeg.rotation.x *= 0.9;
    }

    // Swing animation (attack — positive X = forward swing)
    if (rp.swingTime > 0) {
      rp.swingTime -= delta * 2;
      const swingCurve = Math.sin(rp.swingTime * Math.PI * 2) * 1.2;
      rp.leftArm.rotation.x = swingCurve;
    }

    // Show/hide held sword based on active slot
    if (rp.heldSword) {
      rp.heldSword.visible = (rp.data.activeSlot === 1);
    }

    // Billboard the name label toward camera
    if (rp.nameLabel && camera) {
      rp.nameLabel.lookAt(camera.position);
    }
  });
}

// ─── CHAT SYSTEM ─────────────────────────────────────────────────────

function addChatMessage(name, text, isSystem) {
  const messagesEl = document.getElementById('chat-messages');
  if (!messagesEl) return;
  const div = document.createElement('div');
  div.className = 'chat-msg' + (isSystem ? ' system' : '');
  if (isSystem) {
    div.textContent = text;
  } else {
    div.innerHTML = `<span class="chat-name">${escapeHtml(name)}</span>: ${escapeHtml(text)}`;
  }
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  // Limit messages
  while (messagesEl.children.length > 50) {
    messagesEl.removeChild(messagesEl.firstChild);
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function openChat() {
  if (chatOpen) return;
  chatOpen = true;
  document.getElementById('chat-input-wrap').style.display = 'block';
  const input = document.getElementById('chat-input');
  input.value = '';
  input.focus();
  // Exit pointer lock so we can type
  document.exitPointerLock();
}

function closeChat() {
  chatOpen = false;
  document.getElementById('chat-input-wrap').style.display = 'none';
}

function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (text && ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'chat', text }));
  }
  input.value = '';
  closeChat();
  // Re-lock pointer
  renderer.domElement.requestPointerLock();
}

function updatePlayerCount() {
  const el = document.getElementById('player-count');
  if (el) {
    el.textContent = `Players Online: ${onlineCount}`;
  }
}

// ─── NAME INPUT SETUP ────────────────────────────────────────────────

function setupNameInput() {
  const overlay = document.getElementById('name-overlay');
  const input = document.getElementById('name-input');
  const btn = document.getElementById('name-submit');

  function submitName() {
    const name = input.value.trim() || 'Player';
    myPlayerName = name;
    overlay.style.display = 'none';
    // Connect to multiplayer
    connectWebSocket();
    // Send name after connection
    const waitForOpen = setInterval(() => {
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'set_name', name: myPlayerName }));
        clearInterval(waitForOpen);
      }
    }, 100);
  }

  btn.addEventListener('click', submitName);
  input.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') submitName();
  });
}

// ─── MULTIPLAYER MINIMAP ADDITIONS ───────────────────────────────────

function drawRemotePlayersOnMinimap() {
  if (!minimapVisible) return;
  const canvas = document.getElementById('minimap-canvas');
  const ctx = canvas.getContext('2d');
  const scale = 1.5;
  const ox = 70 - playerPos.x * scale;
  const oz = 70 - playerPos.z * scale;

  remotePlayers.forEach((rp) => {
    ctx.fillStyle = rp.data.color || '#ff4444';
    const sx = ox + rp.targetPos.x * scale;
    const sy = oz + rp.targetPos.z * scale;
    ctx.beginPath();
    ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ─── MAIN INIT ──────────────────────────────────────────────────────
async function init() {
  updateLoading(5, 'Creating scene...');

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x87ceeb, 50, 120);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.copy(playerPos);

  renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  clock = new THREE.Clock();

  updateLoading(15, 'Generating textures...');
  await sleep(50);
  initMaterials();

  updateLoading(30, 'Building museum walls...');
  await sleep(50);
  buildMuseum();

  updateLoading(60, 'Setting up lighting...');
  await sleep(50);
  setupLighting();

  updateLoading(70, 'Creating skybox...');
  await sleep(50);
  createSkybox();

  updateLoading(80, 'Adding particle effects...');
  await sleep(50);
  createParticles();

  updateLoading(85, 'Forging diamond sword...');
  await sleep(50);
  createHandModel();

  updateLoading(90, 'Initializing controls...');
  await sleep(50);
  setupControls();

  // Attack on left click — swing sword or punch fist
  renderer.domElement.addEventListener('mousedown', (e) => {
    if (e.button === 0 && isLocked) swingSword();
  });

  updateLoading(95, 'Preparing multiplayer...');
  await sleep(50);
  setupNameInput();

  updateLoading(100, 'Chuck Norris approves. Entering museum...');
  await sleep(600);

  document.getElementById('loading').style.display = 'none';

  // Position player at entrance
  playerPos.set(0, playerHeight + floorY, -28);

  window.addEventListener('resize', onResize);

  animate();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ─── GAME LOOP ──────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.1);
  const time = clock.getElapsedTime();

  if (isLocked && !exhibitOpen) {
    // Apply gravity
    velocity.y += gravity * delta;

    // Movement direction
    direction.set(0, 0, 0);
    if (moveForward) direction.z -= 1;
    if (moveBackward) direction.z += 1;
    if (moveLeft) direction.x -= 1;
    if (moveRight) direction.x += 1;
    direction.normalize();

    // Calculate movement vector in world space
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

    const moveVec = new THREE.Vector3();
    moveVec.addScaledVector(forward, -direction.z * moveSpeed * delta);
    moveVec.addScaledVector(right, direction.x * moveSpeed * delta);

    // Try X movement
    const testPosX = playerPos.clone();
    testPosX.x += moveVec.x;
    if (!checkCollision(testPosX)) {
      playerPos.x = testPosX.x;
    }

    // Try Z movement
    const testPosZ = playerPos.clone();
    testPosZ.z += moveVec.z;
    if (!checkCollision(testPosZ)) {
      playerPos.z = testPosZ.z;
    }

    // Vertical movement
    playerPos.y += velocity.y * delta;

    // Floor collision (floor surface is at y=1)
    if (playerPos.y <= playerHeight + floorY) {
      playerPos.y = playerHeight + floorY;
      velocity.y = 0;
      canJump = true;
    }

    // World bounds
    playerPos.x = Math.max(-19, Math.min(18, playerPos.x));
    playerPos.z = Math.max(-29, Math.min(29, playerPos.z));
  }

  // Update camera
  camera.position.copy(playerPos);
  const lookDir = new THREE.Vector3(
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch)
  );
  camera.lookAt(playerPos.clone().add(lookDir));

  // Check for nearby interactables
  currentExhibit = null;
  const promptEl = document.getElementById('interact-prompt');
  if (isLocked && !exhibitOpen) {
    let closest = null;
    let closestDist = 4;
    interactables.forEach(item => {
      const dist = playerPos.distanceTo(item.position);
      if (dist < closestDist) {
        closestDist = dist;
        closest = item;
      }
    });
    if (closest) {
      currentExhibit = closest.key;
      promptEl.style.display = 'block';
      promptEl.textContent = `Press E — ${closest.label}`;
    } else {
      promptEl.style.display = 'none';
    }
  } else {
    promptEl.style.display = 'none';
  }

  // Animate exhibit markers (bob up and down)
  interactables.forEach((item, i) => {
    item.mesh.rotation.y = time * 1.5 + i;
    item.mesh.position.y = item.position.y + Math.sin(time * 2 + i) * 0.15;
  });

  // Billboard all floating labels to always face the camera
  billboardLabels.forEach(lbl => {
    lbl.lookAt(camera.position.x, lbl.position.y, camera.position.z);
  });

  // Update hand/sword animation
  updateHandAnimation(delta, time);

  // Update particles
  updateParticles(time);

  // Update remote multiplayer players
  updateRemotePlayers(delta, time);

  // Send our position to server
  sendPositionUpdate();

  // Update minimap
  updateMinimap();
  drawRemotePlayersOnMinimap();

  // Show/hide multiplayer HUD elements
  const playerCountEl = document.getElementById('player-count');
  const chatBoxEl = document.getElementById('chat-box');
  if (isLocked) {
    if (playerCountEl) playerCountEl.style.display = 'block';
    if (chatBoxEl) chatBoxEl.style.display = 'flex';
  } else if (!chatOpen) {
    if (playerCountEl) playerCountEl.style.display = 'none';
    if (chatBoxEl) chatBoxEl.style.display = 'none';
  }

  // Init audio on first frame (needs user gesture)
  if (isLocked && !audioCtx) {
    initAudio();
  }

  renderer.render(scene, camera);
}

// ─── START ──────────────────────────────────────────────────────────
init();
