import * as THREE from 'three';
import { museumGroup, interactables } from './museum.js';

let scene;
let leaderboardMesh = null;
let lastPvpFetchTime = 0;
let lastFfaFetchTime = 0;
const PVP_REFRESH_INTERVAL = 60000; // 1 min re-check (query filters 30min window)
const FFA_REFRESH_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
let pvpData = [];
let ffaData = [];
let activeTab = 'pvp'; // 'pvp' | 'ffa'
let pvpResetTime = Date.now() + 24 * 60 * 60 * 1000; // when PVP leaderboard resets
let ffaResetTime = Date.now() + 24 * 60 * 60 * 1000; // when FFA leaderboard resets
let timerIntervalId = null;

export function setLeaderboardScene(s) { scene = s; }

// ─── Switch tab (called from main.js interaction) ───────────────────
export function setLeaderboardTab(tab) {
  activeTab = tab;
  renderLeaderboard();
}

// ─── Start live timer for leaderboard countdown ──────────────────────
function startLiveTimer() {
  if (timerIntervalId) return;
  timerIntervalId = setInterval(() => {
    renderLeaderboard();
  }, 1000);
}

export function getLeaderboardTab() { return activeTab; }

// ─── FETCH PVP LEADERBOARD ─────────────────────────────────────────
async function fetchPvpLeaderboard(forceRefresh = false) {
  try {
    const res = await fetch(`/api/leaderboard/pvp${forceRefresh ? '?refresh=1' : ''}`);
    if (!res.ok) return;
    const payload = await res.json();
    if (!Array.isArray(payload?.data)) return;
    pvpData = payload.data;

    lastPvpFetchTime = Date.now();
    pvpResetTime = Date.now() + 24 * 60 * 60 * 1000;
    if (activeTab === 'pvp') renderLeaderboard();
  } catch (err) { console.error('[LB] PVP error:', err); }
}

// ─── FETCH FFA LEADERBOARD ──────────────────────────────────────────
async function fetchFfaLeaderboard(forceRefresh = false) {
  try {
    const res = await fetch(`/api/leaderboard/ffa${forceRefresh ? '?refresh=1' : ''}`);
    if (!res.ok) return;
    const payload = await res.json();
    if (!Array.isArray(payload?.data)) return;
    ffaData = payload.data;

    lastFfaFetchTime = Date.now();
    ffaResetTime = Date.now() + FFA_REFRESH_INTERVAL;
    if (activeTab === 'ffa') renderLeaderboard();
  } catch (err) { console.error('[LB] FFA error:', err); }
}

// Force FFA refresh (called after FFA match ends)
export function refreshFFALeaderboard() {
  fetchFfaLeaderboard(true);
}

// ─── RENDER LEADERBOARD ON WALL ─────────────────────────────────────
function renderLeaderboard() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#0a0815';
  ctx.fillRect(0, 0, 512, 512);

  // Border
  ctx.strokeStyle = activeTab === 'pvp' ? '#9933ff' : '#ff3333';
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, 504, 504);

  // ── TAB BUTTONS ──
  // PVP tab
  ctx.fillStyle = activeTab === 'pvp' ? '#9933ff' : '#222';
  ctx.fillRect(10, 10, 240, 32);
  ctx.strokeStyle = '#9933ff';
  ctx.lineWidth = 1;
  ctx.strokeRect(10, 10, 240, 32);
  ctx.fillStyle = activeTab === 'pvp' ? '#fff' : '#888';
  ctx.font = 'bold 16px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText('1v1 / 2v2', 130, 32);

  // FFA tab
  ctx.fillStyle = activeTab === 'ffa' ? '#ff3333' : '#222';
  ctx.fillRect(262, 10, 240, 32);
  ctx.strokeStyle = '#ff3333';
  ctx.strokeRect(262, 10, 240, 32);
  ctx.fillStyle = activeTab === 'ffa' ? '#fff' : '#888';
  ctx.fillText('FREE FOR ALL', 382, 32);

  // ── Click instruction ──
  ctx.fillStyle = '#555';
  ctx.font = '11px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText('Press E to switch tab', 256, 58);

  if (activeTab === 'pvp') {
    renderPvpBoard(ctx);
  } else {
    renderFfaBoard(ctx);
  }

  // Create or update 3D texture
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;

  if (leaderboardMesh) {
    leaderboardMesh.material.map.dispose();
    leaderboardMesh.material.map = tex;
    leaderboardMesh.material.needsUpdate = true;
  } else {
    const geo = new THREE.PlaneGeometry(5, 5);
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    leaderboardMesh = new THREE.Mesh(geo, mat);
    leaderboardMesh.position.set(-10, 4, 28.4);
    // Plane faces +Z by default, rotate 180° to face -Z (south, toward player spawn)
    leaderboardMesh.rotation.y = Math.PI;
    
    // CRITICAL: Lock the transform to prevent any lookAt or rotation changes
    leaderboardMesh.matrixAutoUpdate = false;
    leaderboardMesh.updateMatrix();
    
    if (museumGroup) {
      museumGroup.add(leaderboardMesh);
    } else {
      scene.add(leaderboardMesh);
    }

    // Add interactable for tab switching
    interactables.push({
      mesh: leaderboardMesh,
      key: 'leaderboard_tab',
      label: '[ Switch Leaderboard Tab ]',
      position: leaderboardMesh.position.clone(),
    });
  }
}

function formatTimer(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function renderPvpBoard(ctx) {
  // Title
  ctx.fillStyle = '#cc44ff';
  ctx.font = 'bold 22px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText('PVP LEADERBOARD', 256, 85);

  ctx.fillStyle = '#888';
  ctx.font = '12px Courier New';
  ctx.fillText('1v1 & 2v2 combined (24h)', 256, 100);

  // Headers
  ctx.fillStyle = '#f5a623';
  ctx.font = 'bold 13px Courier New';
  ctx.textAlign = 'left';
  ctx.fillText('#', 20, 125);
  ctx.fillText('PLAYER', 50, 125);
  ctx.fillText('W', 300, 125);
  ctx.fillText('L', 350, 125);
  ctx.fillText('WIN%', 410, 125);

  ctx.strokeStyle = '#333';
  ctx.beginPath(); ctx.moveTo(15, 132); ctx.lineTo(497, 132); ctx.stroke();

  if (pvpData.length === 0) {
    ctx.fillStyle = '#555';
    ctx.font = '16px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('No matches yet', 256, 230);
    ctx.fillText('Enter the portal to fight!', 256, 255);
  } else {
    pvpData.forEach((entry, i) => {
      const y = 155 + i * 34;
      const isTop3 = i < 3;
      const medalColors = ['#ffd700', '#c0c0c0', '#cd7f32'];
      ctx.fillStyle = isTop3 ? medalColors[i] : '#888';
      ctx.font = 'bold 15px Courier New';
      ctx.textAlign = 'left';
      ctx.fillText(`${i + 1}`, 20, y);

      ctx.fillStyle = isTop3 ? '#fff' : '#ccc';
      ctx.font = `${isTop3 ? 'bold ' : ''}14px Courier New`;
      const displayName = entry.name.length > 14 ? entry.name.substring(0, 12) + '..' : entry.name;
      ctx.fillText(displayName, 50, y);

      ctx.fillStyle = '#00cc44';
      ctx.fillText(`${entry.wins}`, 300, y);
      ctx.fillStyle = '#ff4444';
      ctx.fillText(`${entry.losses}`, 350, y);
      ctx.fillStyle = '#aaa';
      ctx.fillText(`${entry.winRate.toFixed(0)}%`, 410, y);
    });
  }

  // Prize info
  ctx.fillStyle = '#f5a623';
  ctx.font = 'bold 12px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText('TOP 2 WIN 0.50 SOL EACH', 256, 475);

  // Live timer
  const remaining = pvpResetTime - Date.now();
  ctx.fillStyle = '#888';
  ctx.font = '12px Courier New';
  ctx.fillText(`Resets in ${formatTimer(remaining)}`, 256, 495);
}

function renderFfaBoard(ctx) {
  ctx.fillStyle = '#ff4444';
  ctx.font = 'bold 22px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText('FFA LEADERBOARD', 256, 85);

  ctx.fillStyle = '#888';
  ctx.font = '12px Courier New';
  ctx.fillText('Free For All (24h)', 256, 100);

  // Headers
  ctx.fillStyle = '#f5a623';
  ctx.font = 'bold 13px Courier New';
  ctx.textAlign = 'left';
  ctx.fillText('#', 20, 125);
  ctx.fillText('PLAYER', 50, 125);
  ctx.fillText('WINS', 270, 125);
  ctx.fillText('KILLS', 340, 125);
  ctx.fillText('AVG', 420, 125);

  ctx.strokeStyle = '#333';
  ctx.beginPath(); ctx.moveTo(15, 132); ctx.lineTo(497, 132); ctx.stroke();

  if (ffaData.length === 0) {
    ctx.fillStyle = '#555';
    ctx.font = '16px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('No FFA matches yet', 256, 230);
    ctx.fillText('Queue at the Battle Royale block!', 256, 255);
  } else {
    ffaData.forEach((entry, i) => {
      const y = 155 + i * 34;
      const isTop3 = i < 3;
      const medalColors = ['#ffd700', '#c0c0c0', '#cd7f32'];
      ctx.fillStyle = isTop3 ? medalColors[i] : '#888';
      ctx.font = 'bold 15px Courier New';
      ctx.textAlign = 'left';
      ctx.fillText(`${i + 1}`, 20, y);

      ctx.fillStyle = isTop3 ? '#fff' : '#ccc';
      ctx.font = `${isTop3 ? 'bold ' : ''}14px Courier New`;
      const displayName = entry.name.length > 14 ? entry.name.substring(0, 12) + '..' : entry.name;
      ctx.fillText(displayName, 50, y);

      ctx.fillStyle = '#ffaa00';
      ctx.fillText(`${entry.wins}`, 270, y);
      ctx.fillStyle = '#ff6644';
      ctx.fillText(`${entry.kills}`, 340, y);
      ctx.fillStyle = '#aaa';
      ctx.fillText(`#${entry.avgPlace}`, 420, y);
    });
  }

  // Prize info
  ctx.fillStyle = '#ff6633';
  ctx.font = 'bold 12px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText('TOP 3 WIN 0.50 SOL EACH', 256, 475);

  // Live timer
  const remaining = ffaResetTime - Date.now();
  ctx.fillStyle = '#888';
  ctx.font = '12px Courier New';
  ctx.fillText(`Resets in ${formatTimer(remaining)}`, 256, 495);
}

// ─── CREATE LEADERBOARD WALL SECTION ────────────────────────────────
export function createLeaderboardWall() {
  fetchPvpLeaderboard();
  fetchFfaLeaderboard();

  // Start live timer for countdown display
  startLiveTimer();

  // Periodic refresh
  setInterval(() => { fetchPvpLeaderboard(); }, PVP_REFRESH_INTERVAL);
  setInterval(() => { fetchFfaLeaderboard(); }, FFA_REFRESH_INTERVAL);
}

// ─── UPDATE (call from game loop, not every frame) ──────────────────
export function updateLeaderboard() {
  if (Date.now() - lastPvpFetchTime > PVP_REFRESH_INTERVAL) {
    fetchPvpLeaderboard();
  }
  if (Date.now() - lastFfaFetchTime > FFA_REFRESH_INTERVAL) {
    fetchFfaLeaderboard();
  }
}
