import { playerPos, yaw, isLocked, minimapVisible, exhibitOpen } from './player.js';
import { interactables } from './museum.js';
import { remotePlayers } from './multiplayer.js';

// ─── LOADING ────────────────────────────────────────────────────────
export function updateLoading(pct, text) {
  document.getElementById('load-bar').style.width = pct + '%';
  document.getElementById('load-text').textContent = text;
}

// ─── EXHIBIT PANEL ──────────────────────────────────────────────────
export function openExhibit(key, exhibitData) {
  const data = exhibitData[key];
  if (!data) return;
  document.getElementById('exhibit-title').textContent = data.title;
  document.getElementById('exhibit-body').innerHTML = data.body;
  document.getElementById('exhibit-panel').style.display = 'block';
  document.getElementById('interact-prompt').style.display = 'none';
  return true;
}

export function closeExhibitPanel() {
  document.getElementById('exhibit-panel').style.display = 'none';
}

// ─── MINIMAP ────────────────────────────────────────────────────────
export function updateMinimap() {
  if (!minimapVisible) return;
  const canvas = document.getElementById('minimap-canvas');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, 140, 140);

  const scale = 1.5;
  const ox = 70 - playerPos.x * scale;
  const oz = 70 - playerPos.z * scale;

  ctx.fillStyle = '#555';
  ctx.fillRect(ox + (-20) * scale, oz + (-30) * scale, 40 * scale, 60 * scale);
  ctx.fillStyle = '#222';
  ctx.fillRect(ox + (-19) * scale, oz + (-29) * scale, 38 * scale, 58 * scale);

  ctx.fillStyle = '#f5a623';
  interactables.forEach(item => {
    const sx = ox + item.position.x * scale;
    const sy = oz + item.position.z * scale;
    ctx.fillRect(sx - 2, sy - 2, 4, 4);
  });

  ctx.fillStyle = '#00ff00';
  ctx.beginPath();
  ctx.arc(70, 70, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#00ff00';
  ctx.beginPath();
  ctx.moveTo(70, 70);
  ctx.lineTo(70 + Math.sin(yaw) * 10, 70 - Math.cos(yaw) * 10);
  ctx.stroke();
}

export function drawRemotePlayersOnMinimap() {
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

// ─── AUDIO ──────────────────────────────────────────────────────────
let audioCtx;

export function initAudio() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  playAmbientMusic();
}

function playAmbientMusic() {
  if (!audioCtx) return;

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

  playNote(110, 0, 32, 'triangle', 0.02);
  playNote(82.41, 0, 32, 'sine', 0.015);

  setTimeout(() => {
    if (audioCtx && audioCtx.state === 'running') {
      playAmbientMusic();
    }
  }, 31000);
}

export function getAudioCtx() { return audioCtx; }

// ─── SOCIAL SHARING ─────────────────────────────────────────────────
window.shareTo = function(platform) {
  const url = encodeURIComponent(window.location.href);
  const text = encodeURIComponent("I'm battling in PVP Wars — Memecoin Arena! ⚔️🚀");
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
