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

// ─── VOID SCENE OBJECTS ─────────────────────────────────────────────
let voidGroup = null;
let voidStars = null;
let scene = null;

export function setLobbyScene(s) { scene = s; }

function createVoidEnvironment() {
  if (voidGroup) return;
  voidGroup = new THREE.Group();
  voidGroup.visible = false;

  const platGeo = new THREE.BoxGeometry(6, 0.5, 6);
  const platMat = new THREE.MeshLambertMaterial({ color: 0x1a1a2e });
  const platform = new THREE.Mesh(platGeo, platMat);
  platform.position.set(0, -0.25, 0);
  voidGroup.add(platform);

  const edgeGeo = new THREE.BoxGeometry(6.2, 0.1, 6.2);
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0x9933ff, transparent: true, opacity: 0.6 });
  const edge = new THREE.Mesh(edgeGeo, edgeMat);
  edge.position.set(0, 0.01, 0);
  voidGroup.add(edge);

  const purpleLight = new THREE.PointLight(0x9933ff, 2, 20);
  purpleLight.position.set(0, 5, 0);
  voidGroup.add(purpleLight);

  const dimLight = new THREE.AmbientLight(0x222244, 0.5);
  voidGroup.add(dimLight);

  const starCount = 500;
  const starGeo = new THREE.BufferGeometry();
  const starPositions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPositions[i * 3] = (Math.random() - 0.5) * 100;
    starPositions[i * 3 + 1] = (Math.random() - 0.5) * 60 + 10;
    starPositions[i * 3 + 2] = (Math.random() - 0.5) * 100;
    const brightness = 0.3 + Math.random() * 0.7;
    starColors[i * 3] = brightness * (0.6 + Math.random() * 0.4);
    starColors[i * 3 + 1] = brightness * (0.3 + Math.random() * 0.3);
    starColors[i * 3 + 2] = brightness;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
  const starMat = new THREE.PointsMaterial({ size: 0.15, vertexColors: true, transparent: true, opacity: 0.8 });
  voidStars = new THREE.Points(starGeo, starMat);
  voidGroup.add(voidStars);

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
  ws.send(JSON.stringify({ type: 'create_lobby', mode, isPrivate }));
}

function joinLobby(lobbyId) {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: 'join_lobby', lobbyId }));
}

function joinPrivate(code) {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: 'join_private', code }));
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

// ─── VOID ANIMATION (call each frame when in lobby) ─────────────────
export function updateVoidScene(time) {
  if (!inLobby || !voidStars) return;
  voidStars.rotation.y = time * 0.02;
  voidStars.rotation.x = Math.sin(time * 0.01) * 0.05;
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
