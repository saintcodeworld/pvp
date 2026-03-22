import * as THREE from 'three';
import { ws } from './multiplayer.js';

// ─── LOBBY STATE ────────────────────────────────────────────────────
let inLobby = false;
let myLobbyId = null; // lobby I created (if any)
let lobbyList = [];
let onGameStart = null; // callback when game starts

export function isInLobby() { return inLobby; }

// ─── VOID SCENE OBJECTS ─────────────────────────────────────────────
let voidGroup = null; // THREE.Group added to scene
let voidStars = null;
let scene = null;

export function setLobbyScene(s) { scene = s; }

function createVoidEnvironment() {
  if (voidGroup) return;
  voidGroup = new THREE.Group();
  voidGroup.visible = false;

  // Floating platform
  const platGeo = new THREE.BoxGeometry(6, 0.5, 6);
  const platMat = new THREE.MeshLambertMaterial({ color: 0x1a1a2e });
  const platform = new THREE.Mesh(platGeo, platMat);
  platform.position.set(0, -0.25, 0);
  voidGroup.add(platform);

  // Platform edge glow
  const edgeGeo = new THREE.BoxGeometry(6.2, 0.1, 6.2);
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0x9933ff, transparent: true, opacity: 0.6 });
  const edge = new THREE.Mesh(edgeGeo, edgeMat);
  edge.position.set(0, 0.01, 0);
  voidGroup.add(edge);

  // Ambient purple light
  const purpleLight = new THREE.PointLight(0x9933ff, 2, 20);
  purpleLight.position.set(0, 5, 0);
  voidGroup.add(purpleLight);

  const dimLight = new THREE.AmbientLight(0x222244, 0.5);
  voidGroup.add(dimLight);

  // Stars / particles in void
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

  createVoidEnvironment();
  voidGroup.visible = true;

  // Tell server we're entering lobby area
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'enter_lobby_area' }));
  }

  // Show lobby UI
  showLobbyUI();
}

export function exitLobby() {
  inLobby = false;
  myLobbyId = null;

  if (voidGroup) voidGroup.visible = false;

  // Tell server we're leaving lobby
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
    updateLobbyListUI();
  }
}

function hideLobbyUI() {
  const ui = document.getElementById('lobby-ui');
  if (ui) ui.style.display = 'none';
  hideWaitingUI();
}

function showWaitingUI() {
  const el = document.getElementById('lobby-waiting');
  if (el) el.style.display = 'flex';
}

function hideWaitingUI() {
  const el = document.getElementById('lobby-waiting');
  if (el) el.style.display = 'none';
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
      <button class="lobby-join-btn" data-id="${lobby.id}">JOIN</button>
    </div>
  `).join('');

  // Attach join handlers
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
export function createLobby() {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: 'create_lobby' }));
}

function joinLobby(lobbyId) {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: 'join_lobby', lobbyId }));
}

export function cancelLobby() {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: 'cancel_lobby' }));
  myLobbyId = null;
  hideWaitingUI();
  showLobbyUI();
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
      if (inLobby && !myLobbyId) {
        updateLobbyListUI();
      }
      break;
    }

    case 'lobby_created': {
      myLobbyId = msg.lobbyId;
      hideLobbyUI();
      showWaitingUI();
      break;
    }

    case 'lobby_cancelled': {
      myLobbyId = null;
      hideWaitingUI();
      showLobbyUI();
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
      // Both players matched — transition to arena
      hideLobbyUI();
      hideWaitingUI();
      if (voidGroup) voidGroup.visible = false;
      inLobby = false;

      if (onGameStart) {
        onGameStart({
          lobbyId: msg.lobbyId,
          opponentName: msg.opponentName,
          opponentId: msg.opponentId,
          role: msg.role,
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
  const createBtn = document.getElementById('lobby-create-btn');
  const backBtn = document.getElementById('lobby-back-btn');
  const cancelBtn = document.getElementById('lobby-cancel-btn');

  if (createBtn) {
    createBtn.addEventListener('click', createLobby);
  }
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      exitLobby();
      // Main.js will handle returning to museum
      const event = new CustomEvent('lobby-exit');
      window.dispatchEvent(event);
    });
  }
  if (cancelBtn) {
    cancelBtn.addEventListener('click', cancelLobby);
  }
}
