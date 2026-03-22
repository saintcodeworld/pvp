import * as THREE from 'three';
import { supabase } from './auth.js';
import { museumGroup } from './museum.js';

let scene;
let leaderboardMesh = null;
let lastFetchTime = 0;
const REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes
let leaderboardData = [];

export function setLeaderboardScene(s) { scene = s; }

// ─── FETCH LEADERBOARD DATA ────────────────────────────────────────
async function fetchLeaderboard() {
  try {
    // Get matches from last 30 minutes
    const cutoff = new Date(Date.now() - REFRESH_INTERVAL).toISOString();

    const { data, error } = await supabase
      .from('match_results')
      .select('winner_name, loser_name, winner_rounds, loser_rounds, played_at')
      .gte('played_at', cutoff)
      .order('played_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[Leaderboard] Fetch error:', error.message);
      return;
    }

    // Aggregate stats per player
    const stats = new Map();
    (data || []).forEach(match => {
      // Winner
      if (!stats.has(match.winner_name)) {
        stats.set(match.winner_name, { wins: 0, losses: 0, rounds_won: 0, rounds_lost: 0 });
      }
      const w = stats.get(match.winner_name);
      w.wins++;
      w.rounds_won += match.winner_rounds;
      w.rounds_lost += match.loser_rounds;

      // Loser
      if (!stats.has(match.loser_name)) {
        stats.set(match.loser_name, { wins: 0, losses: 0, rounds_won: 0, rounds_lost: 0 });
      }
      const l = stats.get(match.loser_name);
      l.losses++;
      l.rounds_won += match.loser_rounds;
      l.rounds_lost += match.winner_rounds;
    });

    // Sort by wins, then by win rate
    leaderboardData = Array.from(stats.entries())
      .map(([name, s]) => ({
        name,
        wins: s.wins,
        losses: s.losses,
        total: s.wins + s.losses,
        winRate: s.wins / (s.wins + s.losses) * 100,
      }))
      .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate)
      .slice(0, 10);

    lastFetchTime = Date.now();
    updateLeaderboardDisplay();
  } catch (err) {
    console.error('[Leaderboard] Error:', err);
  }
}

// ─── RENDER LEADERBOARD ON WALL ─────────────────────────────────────
function updateLeaderboardDisplay() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#0a0815';
  ctx.fillRect(0, 0, 512, 512);

  // Border
  ctx.strokeStyle = '#9933ff';
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, 504, 504);

  // Title
  ctx.fillStyle = '#cc44ff';
  ctx.font = 'bold 28px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText('PVP WARS', 256, 40);

  ctx.fillStyle = '#888';
  ctx.font = '14px Courier New';
  ctx.fillText('LEADERBOARD (30min)', 256, 60);

  // Column headers
  ctx.fillStyle = '#f5a623';
  ctx.font = 'bold 14px Courier New';
  ctx.textAlign = 'left';
  ctx.fillText('#', 20, 90);
  ctx.fillText('PLAYER', 50, 90);
  ctx.fillText('W', 300, 90);
  ctx.fillText('L', 350, 90);
  ctx.fillText('WIN%', 400, 90);

  // Divider
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(15, 98);
  ctx.lineTo(497, 98);
  ctx.stroke();

  if (leaderboardData.length === 0) {
    ctx.fillStyle = '#555';
    ctx.font = '16px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('No matches yet', 256, 200);
    ctx.fillText('Enter the portal to fight!', 256, 225);
  } else {
    leaderboardData.forEach((entry, i) => {
      const y = 120 + i * 36;
      const isTop3 = i < 3;

      // Rank medal colors
      const medalColors = ['#ffd700', '#c0c0c0', '#cd7f32'];
      ctx.fillStyle = isTop3 ? medalColors[i] : '#888';
      ctx.font = 'bold 16px Courier New';
      ctx.textAlign = 'left';
      ctx.fillText(`${i + 1}`, 20, y);

      // Player name
      ctx.fillStyle = isTop3 ? '#fff' : '#ccc';
      ctx.font = `${isTop3 ? 'bold ' : ''}15px Courier New`;
      const displayName = entry.name.length > 14 ? entry.name.substring(0, 12) + '..' : entry.name;
      ctx.fillText(displayName, 50, y);

      // Stats
      ctx.fillStyle = '#00cc44';
      ctx.fillText(`${entry.wins}`, 300, y);
      ctx.fillStyle = '#ff4444';
      ctx.fillText(`${entry.losses}`, 350, y);
      ctx.fillStyle = '#aaa';
      ctx.fillText(`${entry.winRate.toFixed(0)}%`, 400, y);
    });
  }

  // Footer — next reset time
  const nextReset = new Date(lastFetchTime + REFRESH_INTERVAL);
  const minsLeft = Math.max(0, Math.round((nextReset - Date.now()) / 60000));
  ctx.fillStyle = '#444';
  ctx.font = '12px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText(`Resets in ${minsLeft} min`, 256, 495);

  // Create or update the 3D texture
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;

  if (leaderboardMesh) {
    leaderboardMesh.material.map.dispose();
    leaderboardMesh.material.map = tex;
    leaderboardMesh.material.needsUpdate = true;
  } else {
    // Place on back wall of museum, right side
    const geo = new THREE.PlaneGeometry(5, 5);
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    leaderboardMesh = new THREE.Mesh(geo, mat);
    // Position on back wall (z=29), right side
    leaderboardMesh.position.set(10, 4, 28.9);
    leaderboardMesh.rotation.y = Math.PI; // face south (into museum)
    if (museumGroup) {
      museumGroup.add(leaderboardMesh);
    } else {
      scene.add(leaderboardMesh);
    }
  }
}

// ─── CREATE LEADERBOARD WALL SECTION ────────────────────────────────
export function createLeaderboardWall() {
  // Initial fetch
  fetchLeaderboard();

  // Periodic refresh
  setInterval(() => {
    fetchLeaderboard();
  }, 60000); // Check every minute, the query filters by 30min window
}

// ─── UPDATE (call from game loop, not every frame) ──────────────────
export function updateLeaderboard() {
  // Re-fetch if stale (every 60 seconds)
  if (Date.now() - lastFetchTime > 60000) {
    fetchLeaderboard();
  }
}
