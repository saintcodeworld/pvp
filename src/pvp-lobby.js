import * as THREE from 'three';
import { ws } from './multiplayer.js';

// ─── LOBBY STATE ────────────────────────────────────────────────────
let inLobby = false;
let myLobbyId = null;
let lobbyList = [];
let onGameStart = null;
let currentLobbyPlayers = [];
let currentLobbyMode = '1v1';
let currentLobbyCode = null;
let currentView = 'main'; // 'main' | 'waiting' | 'room'

export function isInLobby() { return inLobby; }

// ─── LOBBY GARDEN SCENE ─────────────────────────────────────────────
let voidGroup = null;
let lobbyButterflies = [];
let scene = null;

export function setLobbyScene(s) { scene = s; }

function createVoidEnvironment() {
  if (voidGroup) return;
  voidGroup = new THREE.Group();
  voidGroup.visible = false;

  // ── Grass platform (garden island) ──
  const grassColor = 0x5b8c33;
  const grassDarkColor = 0x4a7a28;
  const PLAT_SIZE = 8;
  for (let x = -PLAT_SIZE / 2; x < PLAT_SIZE / 2; x++) {
    for (let z = -PLAT_SIZE / 2; z < PLAT_SIZE / 2; z++) {
      const isAlt = (Math.abs(x) + Math.abs(z)) % 2 === 0;
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(1, 0.5, 1),
        new THREE.MeshLambertMaterial({ color: isAlt ? grassColor : grassDarkColor })
      );
      block.position.set(x + 0.5, -0.25, z + 0.5);
      block.receiveShadow = true;
      voidGroup.add(block);
    }
  }

  // Dirt layer below
  const dirtGeo = new THREE.BoxGeometry(PLAT_SIZE, 0.4, PLAT_SIZE);
  const dirtMat = new THREE.MeshLambertMaterial({ color: 0x8B6914 });
  const dirt = new THREE.Mesh(dirtGeo, dirtMat);
  dirt.position.set(0, -0.7, 0);
  voidGroup.add(dirt);

  // Extended grass ground
  const outerGeo = new THREE.PlaneGeometry(120, 120);
  const outerMat = new THREE.MeshLambertMaterial({ color: 0x5b8c33 });
  const outerGround = new THREE.Mesh(outerGeo, outerMat);
  outerGround.rotation.x = -Math.PI / 2;
  outerGround.position.set(0, -0.5, 0);
  voidGroup.add(outerGround);

  // ── Small flowers on the platform ──
  const flowerColors = [0xff4466, 0xffee44, 0xff88cc, 0xffffff, 0x44aaff];
  for (let i = 0; i < 12; i++) {
    const fx = (Math.random() - 0.5) * (PLAT_SIZE - 1);
    const fz = (Math.random() - 0.5) * (PLAT_SIZE - 1);
    const stem = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.3, 0.06),
      new THREE.MeshLambertMaterial({ color: 0x33aa33 })
    );
    stem.position.set(fx, 0.15, fz);
    voidGroup.add(stem);
    const petal = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.18, 0.18),
      new THREE.MeshLambertMaterial({ color: flowerColors[Math.floor(Math.random() * flowerColors.length)] })
    );
    petal.position.set(fx, 0.35, fz);
    voidGroup.add(petal);
  }

  // ── Small trees around the lobby platform ──
  function createLobbyTree(x, z, height) {
    for (let y = 0; y < height; y++) {
      const trunk = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshLambertMaterial({ color: 0x6B4226 })
      );
      trunk.position.set(x, y + 0.5, z);
      trunk.castShadow = true;
      voidGroup.add(trunk);
    }
    const leafColor = 0x2D8C2D;
    const leafAlt = 0x3BA33B;
    for (let ly = 0; ly < 2; ly++) {
      const r = ly === 1 ? 1 : 2;
      for (let lx = -r; lx <= r; lx++) {
        for (let lz = -r; lz <= r; lz++) {
          if (lx === 0 && lz === 0 && ly === 0) continue;
          if (Math.abs(lx) === r && Math.abs(lz) === r && Math.random() > 0.6) continue;
          const leaf = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshLambertMaterial({ color: Math.random() > 0.4 ? leafColor : leafAlt })
          );
          leaf.position.set(x + lx, height - 1 + ly + 0.5, z + lz);
          voidGroup.add(leaf);
        }
      }
    }
    const topLeaf = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: leafColor })
    );
    topLeaf.position.set(x, height + 1.5, z);
    voidGroup.add(topLeaf);
  }

  createLobbyTree(-6, -6, 4);
  createLobbyTree(6, -5, 5);
  createLobbyTree(-5, 7, 4);
  createLobbyTree(7, 6, 5);
  createLobbyTree(0, -8, 3);
  createLobbyTree(-9, 0, 4);
  createLobbyTree(9, 1, 4);

  // ── Butterflies (animated particles) ──
  lobbyButterflies = [];
  const butterflyColors = [0xff88cc, 0xffee44, 0x88ddff, 0xffffff];
  for (let i = 0; i < 8; i++) {
    const bfly = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.1, 0.15),
      new THREE.MeshBasicMaterial({ color: butterflyColors[i % butterflyColors.length] })
    );
    bfly.position.set(
      (Math.random() - 0.5) * 10,
      1.5 + Math.random() * 2,
      (Math.random() - 0.5) * 10
    );
    bfly.userData = {
      baseX: bfly.position.x,
      baseY: bfly.position.y,
      baseZ: bfly.position.z,
      phase: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 0.5,
    };
    voidGroup.add(bfly);
    lobbyButterflies.push(bfly);
  }

  // ── Lighting (sunny garden vibe) ──
  const sunLight = new THREE.DirectionalLight(0xfffbe8, 1.3);
  sunLight.position.set(10, 20, 8);
  sunLight.castShadow = true;
  voidGroup.add(sunLight);

  const ambientLight = new THREE.AmbientLight(0x8ec8f0, 0.7);
  voidGroup.add(ambientLight);

  const fillLight = new THREE.DirectionalLight(0xffd4a0, 0.3);
  fillLight.position.set(-8, 6, -5);
  voidGroup.add(fillLight);

  scene.add(voidGroup);
}

// ─── ENTER / EXIT LOBBY ─────────────────────────────────────────────
export function enterLobby(gameStartCallback) {
  onGameStart = gameStartCallback;
  inLobby = true;
  myLobbyId = null;
  currentView = 'main';

  createVoidEnvironment();
  voidGroup.visible = true;

  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'enter_lobby_area' }));
  }

  showLobbyUI();
}

export function exitLobby() {
  inLobby = false;
  myLobbyId = null;

  if (voidGroup) voidGroup.visible = false;

  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'leave_lobby_area' }));
  }

  hideLobbyUI();
}

// ─── LOBBY UI ───────────────────────────────────────────────────────
function showLobbyUI() {
  const ui = document.getElementById('lobby-ui');
  if (ui) {
    ui.style.display = 'flex';
    showMainView();
  }
}

function hideLobbyUI() {
  const ui = document.getElementById('lobby-ui');
  if (ui) ui.style.display = 'none';
  hideAllViews();
}

function hideAllViews() {
  ['lobby-main-view', 'lobby-waiting', 'lobby-room-view'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function showMainView() {
  hideAllViews();
  currentView = 'main';
  const el = document.getElementById('lobby-main-view');
  if (el) el.style.display = 'block';
  updateLobbyListUI();
}

function showWaitingUI(mode, code) {
  hideAllViews();
  currentView = 'waiting';
  const el = document.getElementById('lobby-waiting');
  if (el) {
    el.style.display = 'flex';
    const modeEl = document.getElementById('lobby-waiting-mode');
    if (modeEl) modeEl.textContent = mode.toUpperCase();
    const codeEl = document.getElementById('lobby-waiting-code');
    if (codeEl) {
      if (code) {
        codeEl.style.display = 'block';
        codeEl.textContent = `Code: ${code}`;
      } else {
        codeEl.style.display = 'none';
      }
    }
  }
  updateRoomPlayersUI();
}

function updateRoomPlayersUI() {
  const el = document.getElementById('lobby-room-players');
  if (!el) return;
  const maxP = currentLobbyMode === '2v2' ? 4 : 2;
  el.innerHTML = `<div style="margin-bottom:8px;color:#f5a623;">${currentLobbyPlayers.length}/${maxP} Players</div>` +
    currentLobbyPlayers.map(p =>
      `<div style="color:${p.team === 1 ? '#44aaff' : '#ff4444'};padding:2px 0;">
        ${escapeHtml(p.name)} ${currentLobbyMode === '2v2' ? '(Team ' + p.team + ')' : ''}
      </div>`
    ).join('');
}

function updateLobbyListUI() {
  const listEl = document.getElementById('lobby-list');
  if (!listEl) return;

  if (lobbyList.length === 0) {
    listEl.innerHTML = '<div class="lobby-empty">No open lobbies. Create one!</div>';
    return;
  }

  listEl.innerHTML = lobbyList.map(lobby => `
    <div class="lobby-item">
      <span class="lobby-creator">${escapeHtml(lobby.creatorName)}'s Lobby</span>
      <span class="lobby-mode-badge">${lobby.mode}</span>
      <span class="lobby-players-count">${lobby.playerCount}/${lobby.maxPlayers}</span>
      <button class="lobby-join-btn" data-id="${lobby.id}">JOIN</button>
    </div>
  `).join('');

  listEl.querySelectorAll('.lobby-join-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const lobbyId = parseInt(btn.dataset.id);
      joinLobby(lobbyId);
    });
  });
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── LOBBY ACTIONS ──────────────────────────────────────────────────
export function createLobby(mode = '1v1', isPrivate = false) {
  if (!ws || ws.readyState !== 1) return;
  currentLobbyMode = mode;
  const payload = { type: 'create_lobby', mode, isPrivate };
  if (mode === '2v2') {
    const sel = document.getElementById('lobby-create-team');
    const t = sel ? parseInt(sel.value, 10) : 1;
    payload.team = t === 2 ? 2 : 1;
  }
  ws.send(JSON.stringify(payload));
}

function joinLobby(lobbyId) {
  if (!ws || ws.readyState !== 1) return;
  const payload = { type: 'join_lobby', lobbyId };
  const lobby = lobbyList.find(l => l.id === lobbyId);
  if (lobby && lobby.mode === '2v2') {
    const sel = document.getElementById('lobby-join-team');
    if (sel && sel.value !== '' && sel.value !== undefined) {
      const t = parseInt(sel.value, 10);
      if (t === 1 || t === 2) payload.team = t;
    }
  }
  ws.send(JSON.stringify(payload));
}

function joinPrivate(code) {
  if (!ws || ws.readyState !== 1) return;
  const payload = { type: 'join_private', code };
  const sel = document.getElementById('lobby-join-team');
  if (sel && sel.value !== '' && sel.value !== undefined) {
    const t = parseInt(sel.value, 10);
    if (t === 1 || t === 2) payload.team = t;
  }
  ws.send(JSON.stringify(payload));
}

export function cancelLobby() {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: 'cancel_lobby' }));
  myLobbyId = null;
  showMainView();
}

// ─── HANDLE SERVER MESSAGES ─────────────────────────────────────────
export function handleLobbyMessage(msg) {
  switch (msg.type) {
    case 'lobby_entered': {
      lobbyList = msg.lobbies || [];
      updateLobbyListUI();
      break;
    }

    case 'lobby_list': {
      lobbyList = msg.lobbies || [];
      if (inLobby && currentView === 'main') {
        updateLobbyListUI();
      }
      break;
    }

    case 'lobby_created': {
      myLobbyId = msg.lobbyId;
      currentLobbyMode = msg.mode || '1v1';
      currentLobbyCode = msg.code || null;
      currentLobbyPlayers = msg.players || [];
      showWaitingUI(currentLobbyMode, currentLobbyCode);
      break;
    }

    case 'lobby_player_joined': {
      currentLobbyPlayers = msg.players || [];
      currentLobbyMode = msg.mode || currentLobbyMode;
      updateRoomPlayersUI();
      break;
    }

    case 'lobby_player_left': {
      currentLobbyPlayers = msg.players || [];
      updateRoomPlayersUI();
      break;
    }

    case 'lobby_cancelled': {
      myLobbyId = null;
      currentLobbyPlayers = [];
      currentLobbyCode = null;
      if (inLobby) showMainView();
      window.dispatchEvent(new CustomEvent('lobby-match-aborted'));
      break;
    }

    case 'lobby_error': {
      const statusEl = document.getElementById('lobby-status');
      if (statusEl) {
        statusEl.textContent = msg.message;
        setTimeout(() => { statusEl.textContent = ''; }, 3000);
      }
      break;
    }

    case 'game_starting': {
      hideLobbyUI();
      if (voidGroup) voidGroup.visible = false;
      inLobby = false;

      if (onGameStart) {
        onGameStart({
          lobbyId: msg.lobbyId,
          mode: msg.mode || '1v1',
          // 1v1 fields
          opponentName: msg.opponentName,
          opponentId: msg.opponentId,
          role: msg.role,
          // 2v2 fields
          team: msg.team,
          teammateName: msg.teammateName,
          teammateId: msg.teammateId,
          enemies: msg.enemies,
          allPlayers: msg.allPlayers,
        });
      }
      break;
    }
  }
}

// ─── GARDEN LOBBY ANIMATION (call each frame when in lobby) ─────────
export function updateVoidScene(time) {
  if (!inLobby) return;
  // Animate butterflies
  lobbyButterflies.forEach(bfly => {
    const d = bfly.userData;
    bfly.position.x = d.baseX + Math.sin(time * d.speed + d.phase) * 2;
    bfly.position.y = d.baseY + Math.sin(time * d.speed * 1.3 + d.phase) * 0.5;
    bfly.position.z = d.baseZ + Math.cos(time * d.speed * 0.8 + d.phase) * 2;
    bfly.rotation.y = time * 3;
  });
}

// ─── INIT LOBBY UI BUTTONS ─────────────────────────────────────────
export function initLobbyUI() {
  // Create 1v1 button
  const create1v1Btn = document.getElementById('lobby-create-1v1');
  if (create1v1Btn) {
    create1v1Btn.addEventListener('click', () => createLobby('1v1', false));
  }

  // Create 2v2 button
  const create2v2Btn = document.getElementById('lobby-create-2v2');
  if (create2v2Btn) {
    create2v2Btn.addEventListener('click', () => createLobby('2v2', false));
  }

  // Private 1v1
  const createPrivate1v1 = document.getElementById('lobby-create-private-1v1');
  if (createPrivate1v1) {
    createPrivate1v1.addEventListener('click', () => createLobby('1v1', true));
  }

  // Private 2v2
  const createPrivate2v2 = document.getElementById('lobby-create-private-2v2');
  if (createPrivate2v2) {
    createPrivate2v2.addEventListener('click', () => createLobby('2v2', true));
  }

  // Join private by code
  const joinPrivateBtn = document.getElementById('lobby-join-private-btn');
  if (joinPrivateBtn) {
    joinPrivateBtn.addEventListener('click', () => {
      const input = document.getElementById('lobby-private-code');
      if (input && input.value.trim()) {
        joinPrivate(input.value.trim());
        input.value = '';
      }
    });
  }

  // Back button
  const backBtn = document.getElementById('lobby-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      exitLobby();
      const event = new CustomEvent('lobby-exit');
      window.dispatchEvent(event);
    });
  }

  // Cancel button (in waiting view)
  const cancelBtn = document.getElementById('lobby-cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', cancelLobby);
  }
}
