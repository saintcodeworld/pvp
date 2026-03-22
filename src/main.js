import * as THREE from 'three';
import { initMaterials } from './textures.js';
import {
  setMuseumScene, buildMuseum, setupLighting, createSkybox,
  createParticles, updateParticles, interactables, billboardLabels, exhibitData,
  museumGroup
} from './museum.js';
import {
  playerPos, playerHeight, floorY, yaw, pitch, velocity,
  isLocked, exhibitOpen, currentExhibit, minimapVisible, chatOpen, activeSlot,
  setIsLocked, setExhibitOpen, setCurrentExhibit, setMinimapVisible, setChatOpen,
  setMoveForward, setMoveBackward, setMoveLeft, setMoveRight,
  setYaw, setPitch, setCollisionEnabled,
  initPlayer, getCamera, getRenderer,
  updatePlayerMovement, updateCamera, tryJump,
  createHandModel, swingSword, selectHotbarSlot, updateHandAnimation,
  checkCollision, hideHandModels, showHandModels
} from './player.js';
import {
  connectWebSocket, sendPositionUpdate, sendSwing, setMyPlayerName,
  setMultiplayerScene, setMultiplayerCamera, setExternalMessageHandler,
  updateRemotePlayers, openChat, closeChat, sendChatMessage,
  ws, myPlayerName
} from './multiplayer.js';
import {
  updateLoading, openExhibit, closeExhibitPanel,
  updateMinimap, drawRemotePlayersOnMinimap,
  initAudio, getAudioCtx
} from './ui.js';
import { setPortalScene, createPVPPortal, updatePortalAnimation } from './portal.js';
import {
  setLobbyScene, initLobbyUI, enterLobby, exitLobby,
  isInLobby, handleLobbyMessage, updateVoidScene
} from './pvp-lobby.js';
import {
  setArenaScene, enterArena, exitArena, isInArena,
  handleArenaMessage, updateArenaScene,
  sendArenaPositionUpdate, sendArenaSwing, getArenaPhase
} from './pvp-arena.js';
import { setLeaderboardScene, createLeaderboardWall, updateLeaderboard } from './leaderboard.js';
import { initAuth, getDisplayName } from './auth.js';

// ─── GLOBALS ────────────────────────────────────────────────────────
let scene, camera, renderer;
let audioInitialized = false;
let gameState = 'museum'; // 'museum' | 'lobby' | 'arena'
let museumObjectsVisible = true;
let escapeMode = false; // Track if escape was pressed to show cursor

// Manual timing (replaces THREE.Clock to avoid deprecation + tab-switch issues)
let lastFrameTime = 0;
let elapsedTime = 0;

// Zombie-loop guard: ensures only one rAF loop is ever active
let animationRunning = false;
let lastLoopHeartbeat = 0; // timestamp of last successful loop iteration

// Safe pointer lock helper — prevents WrongDocumentError crashes
function safeRequestPointerLock() {
  try {
    if (document.hidden) return;
    if (renderer && renderer.domElement) {
      renderer.domElement.requestPointerLock();
    }
  } catch (e) {
    // Silently ignore — pointer lock will be re-acquired on next click
  }
}

// ─── CONTROLS SETUP ─────────────────────────────────────────────────
function setupControls() {
  const canvas = renderer.domElement;
  const blocker = document.getElementById('blocker');

  // Auto-enter after loading - hide blocker and request pointer lock
  setTimeout(() => {
    if (blocker) {
      blocker.style.display = 'none';
    }
    safeRequestPointerLock();
  }, 500); // Small delay to ensure everything is loaded

  // Click canvas to re-lock pointer
  canvas.addEventListener('click', () => {
    if (!isLocked && gameState === 'museum') {
      safeRequestPointerLock();
    }
  });

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) {
      setIsLocked(true);
      escapeMode = false; // Reset escape mode when re-locking
      if (blocker) blocker.style.display = 'none';
      if (gameState === 'museum') {
        document.getElementById('crosshair').style.display = 'block';
        document.getElementById('hud').style.display = 'block';
        document.getElementById('social-bar').style.display = 'flex';
        if (minimapVisible) document.getElementById('minimap').style.display = 'block';
      }
    } else {
      if (!exhibitOpen) {
        setIsLocked(false);
        // Only show blocker on initial load / non-escape situations in museum
        if (gameState === 'museum' && !escapeMode) {
          if (blocker) blocker.style.display = 'flex';
        }
        // Keep all HUD elements visible in museum (even when ESC is pressed)
        if (gameState === 'museum') {
          document.getElementById('crosshair').style.display = 'none';
          document.getElementById('hud').style.display = 'block';
          document.getElementById('social-bar').style.display = 'flex';
          document.getElementById('player-count').style.display = 'block';
          document.getElementById('chat-box').style.display = 'flex';
          if (minimapVisible) document.getElementById('minimap').style.display = 'block';
        }
      }
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (!isLocked) return;
    const sensitivity = 0.002;
    setYaw(yaw - e.movementX * sensitivity);
    const newPitch = pitch - e.movementY * sensitivity;
    setPitch(Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, newPitch)));
  });

  document.addEventListener('keydown', (e) => {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': setMoveForward(true); break;
      case 'KeyS': case 'ArrowDown': setMoveBackward(true); break;
      case 'KeyA': case 'ArrowLeft': setMoveLeft(true); break;
      case 'KeyD': case 'ArrowRight': setMoveRight(true); break;
      case 'Space':
        tryJump();
        break;
      case 'KeyE':
        if (isLocked) handleInteract();
        break;
      case 'KeyM':
        setMinimapVisible(!minimapVisible);
        document.getElementById('minimap').style.display = minimapVisible && isLocked ? 'block' : 'none';
        break;
      case 'KeyT':
        if (isLocked && !exhibitOpen && !chatOpen) {
          e.preventDefault();
          setChatOpen(true);
          openChat(renderer);
        }
        break;
      case 'Escape':
        if (exhibitOpen) {
          setExhibitOpen(false);
          closeExhibitPanel();
          e.preventDefault();
        } else if (isLocked && gameState === 'museum') {
          // Exit pointer lock to show cursor and allow HUD interaction
          escapeMode = true;
          document.exitPointerLock();
          e.preventDefault();
        }
        break;
      case 'Digit1': selectHotbarSlot(0); break;
      case 'Digit2': selectHotbarSlot(1); break;
      case 'Digit3': selectHotbarSlot(2); break;
      case 'Digit4': selectHotbarSlot(3); break;
      case 'Digit5': selectHotbarSlot(4); break;
      case 'Digit6': selectHotbarSlot(5); break;
      case 'Digit7': selectHotbarSlot(6); break;
      case 'Digit8': selectHotbarSlot(7); break;
      case 'Digit9': selectHotbarSlot(8); break;
    }
  });

  document.addEventListener('keyup', (e) => {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': setMoveForward(false); break;
      case 'KeyS': case 'ArrowDown': setMoveBackward(false); break;
      case 'KeyA': case 'ArrowLeft': setMoveLeft(false); break;
      case 'KeyD': case 'ArrowRight': setMoveRight(false); break;
    }
  });

  // Chat input handlers
  const chatInput = document.getElementById('chat-input');
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Enter') {
        setChatOpen(false);
        sendChatMessage(renderer);
      } else if (e.code === 'Escape') {
        setChatOpen(false);
        closeChat();
        safeRequestPointerLock();
      }
    });
  }
}

function handleInteract() {
  if (exhibitOpen) {
    setExhibitOpen(false);
    closeExhibitPanel();
    return;
  }

  if (currentExhibit) {
    if (currentExhibit === 'pvp_portal') {
      enterPVPLobby();
      return;
    }
    setExhibitOpen(true);
    openExhibit(currentExhibit, exhibitData);
  }
}

// ─── GAME STATE TRANSITIONS ─────────────────────────────────────
function setMuseumVisible(visible) {
  museumObjectsVisible = visible;
  // Toggle museum 3D objects
  if (museumGroup) museumGroup.visible = visible;
  // Toggle scene fog for different environments
  if (visible) {
    scene.fog = new THREE.Fog(0x87ceeb, 50, 120);
    scene.background = null;
  } else {
    scene.fog = new THREE.Fog(0x050010, 20, 80);
    scene.background = new THREE.Color(0x050010);
  }
}

function enterPVPLobby() {
  gameState = 'lobby';
  setMuseumVisible(false);
  setCollisionEnabled(false);

  // Hide museum HUD elements
  document.getElementById('hud').style.display = 'none';
  document.getElementById('crosshair').style.display = 'none';
  document.getElementById('interact-prompt').style.display = 'none';
  document.getElementById('minimap').style.display = 'none';
  document.getElementById('social-bar').style.display = 'none';
  document.getElementById('player-count').style.display = 'none';
  document.getElementById('chat-box').style.display = 'none';
  
  // Hide blocker when entering lobby
  const blocker = document.getElementById('blocker');
  if (blocker) blocker.style.display = 'none';
  
  // Hide first-person hand/weapon models in lobby
  hideHandModels();
  
  document.exitPointerLock();
  setIsLocked(false);

  // Position player on void platform
  playerPos.set(0, 1.7 + 0.5, 0);

  enterLobby((gameData) => {
    // Callback when game starts — transition to arena
    enterPVPArena(gameData);
  });
}

function returnToMuseum() {
  gameState = 'museum';
  setMuseumVisible(true);
  setCollisionEnabled(true);

  // Respawn at museum entrance
  playerPos.set(0, playerHeight + floorY, -28);

  // Hide blocker when returning to museum
  const blocker = document.getElementById('blocker');
  if (blocker) blocker.style.display = 'none';

  // Restore hand models
  showHandModels();

  // Re-lock pointer for museum
  safeRequestPointerLock();
}

function enterPVPArena(gameData) {
  gameState = 'arena';
  setMuseumVisible(false);
  setCollisionEnabled(false);
  scene.fog = new THREE.Fog(0x050010, 30, 60);
  scene.background = new THREE.Color(0x050010);

  // Restore hand models for combat
  showHandModels();

  // Re-lock pointer for combat
  safeRequestPointerLock();

  // Auto-select sword slot for arena
  selectHotbarSlot(1);

  enterArena(gameData, (matchResult) => {
    // Callback when match ends — return to museum
    returnToMuseum();
  });
}


// ─── MAIN INIT ──────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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

  lastFrameTime = performance.now();
  elapsedTime = 0;

  // Initialize all modules with scene reference
  initPlayer(camera, renderer, scene);
  setMuseumScene(scene);
  setMultiplayerScene(scene);
  setMultiplayerCamera(camera);
  setPortalScene(scene);
  setLobbyScene(scene);
  setArenaScene(scene);
  setLeaderboardScene(scene);

  // Route lobby/arena WS messages based on game state
  setExternalMessageHandler((msg) => {
    // Lobby-related messages
    const lobbyMsgTypes = [
      'lobby_entered', 'lobby_list', 'lobby_created', 'lobby_cancelled',
      'lobby_error', 'game_starting'
    ];
    if (lobbyMsgTypes.includes(msg.type)) {
      handleLobbyMessage(msg);
      return;
    }

    // Arena-related messages
    const arenaMsgTypes = [
      'arena_setup', 'countdown_tick', 'round_start', 'hit',
      'heart_spawn', 'heart_picked_up', 'round_end', 'match_end'
    ];
    if (arenaMsgTypes.includes(msg.type)) {
      handleArenaMessage(msg);
      return;
    }

    // player_update and player_swing in arena go to arena handler
    if (gameState === 'arena' && (msg.type === 'player_update' || msg.type === 'player_swing')) {
      handleArenaMessage(msg);
      return;
    }

    // returned_to_museum can come from lobby or arena
    if (msg.type === 'returned_to_museum') {
      handleArenaMessage(msg);
      return;
    }
  });

  updateLoading(15, 'Generating textures...');
  await sleep(50);
  initMaterials();

  updateLoading(30, 'Building museum walls...');
  await sleep(50);
  buildMuseum();

  updateLoading(50, 'Constructing PVP Wars Portal...');
  await sleep(50);
  createPVPPortal();

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

  // Attack on left click
  renderer.domElement.addEventListener('mousedown', (e) => {
    if (e.button === 0 && isLocked) {
      if (gameState === 'arena') {
        swingSword(sendArenaSwing);
      } else {
        swingSword(sendSwing);
      }
    }
  });

  updateLoading(88, 'Loading leaderboard...');
  await sleep(50);
  createLeaderboardWall();

  updateLoading(92, 'Setting up PVP systems...');
  await sleep(50);
  initLobbyUI();

  // Listen for lobby exit event (back to museum button)
  window.addEventListener('lobby-exit', () => {
    returnToMuseum();
  });

  updateLoading(95, 'Preparing multiplayer...');
  await sleep(50);
  
  // Initialize multiplayer with authenticated user name
  const playerName = getDisplayName();
  setMyPlayerName(playerName);
  connectWebSocket();
  const waitForOpen = setInterval(() => {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'set_name', name: playerName }));
      clearInterval(waitForOpen);
    }
  }, 100);

  updateLoading(100, 'WAGMI. Entering the arena...');
  await sleep(600);

  document.getElementById('loading').style.display = 'none';

  // Position player at entrance
  playerPos.set(0, playerHeight + floorY, -28);

  window.addEventListener('resize', onResize);
  setupVisibilityHandler();
  setupFocusHandler();

  animate();
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ─── GAME LOOP ────────────────────────────────────────────────────────
let fallbackIntervalId = null;

// Hard-reset all input state (movement keys + velocity)
function resetAllInputState() {
  setMoveForward(false);
  setMoveBackward(false);
  setMoveLeft(false);
  setMoveRight(false);
  velocity.set(0, 0, 0);
}

function setupVisibilityHandler() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // ── TAB HIDDEN ──
      // Hard-reset all inputs to prevent stuck-key drift and velocity accumulation
      resetAllInputState();

      // Start fallback interval: keepalive ping + position updates
      if (!fallbackIntervalId) {
        fallbackIntervalId = setInterval(() => {
          // Send a lightweight ping to keep the WebSocket alive
          if (ws && ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
          if (gameState === 'arena') sendArenaPositionUpdate();
          if (gameState === 'museum') sendPositionUpdate();
        }, 1000); // 1s interval is enough for keepalive
      }
    } else {
      // ── TAB VISIBLE AGAIN ──
      // Clear fallback interval
      if (fallbackIntervalId) {
        clearInterval(fallbackIntervalId);
        fallbackIntervalId = null;
      }

      // Reset frame time so next delta is near-zero (no huge jump)
      lastFrameTime = performance.now();

      // Hard-reset all inputs again in case keyup events were missed
      resetAllInputState();

      // Request state resync from server
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'resync' }));
      }

      // If the animation loop died, restart it
      // Delay the check because rAF is paused while hidden — give it time to resume
      setTimeout(() => {
        if (document.hidden) return; // still hidden, don't check
        const loopAge = performance.now() - lastLoopHeartbeat;
        if (loopAge > 500) {
          // Loop hasn't ticked in 500ms despite tab being visible — it's dead
          console.warn('[Game] Animation loop was dead — restarting (age=' + Math.round(loopAge) + 'ms)');
          animationRunning = false;
          animate();
        }
      }, 300);
    }
  });
}

// ─── FOCUS HANDLER (Pointer Lock re-initialization) ──────────────────
function setupFocusHandler() {
  window.addEventListener('focus', () => {
    // Reset frame time on focus to prevent delta spike
    lastFrameTime = performance.now();

    // Hard-reset inputs (focus can fire without visibilitychange)
    resetAllInputState();

    // Re-acquire pointer lock if the game expects it
    // Use a short delay — browsers block immediate pointer lock after focus
    setTimeout(() => {
      if (document.hidden) return;
      const hasLock = document.pointerLockElement === renderer?.domElement;
      if (!hasLock && gameState === 'museum' && !exhibitOpen && !escapeMode) {
        // Show the blocker so the user can click to resume
        const blocker = document.getElementById('blocker');
        if (blocker) blocker.style.display = 'flex';
        setIsLocked(false);
      }
      if (!hasLock && gameState === 'arena') {
        // Arena needs pointer lock — prompt re-lock on click
        safeRequestPointerLock();
      }
    }, 100);
  });
}

function animate() {
  // Zombie-loop guard: only one loop instance may run
  if (animationRunning) return;
  animationRunning = true;

  function loop() {
    requestAnimationFrame(loop);

    try {
      // Update loop heartbeat so visibility handler can detect a dead loop
      lastLoopHeartbeat = performance.now();

      // ── Scene validation: bail safely if core objects are missing ──
      if (!renderer || !scene || !camera) {
        console.warn('[Game] Core objects missing — skipping frame');
        return;
      }

      const now = performance.now();
      // Cap delta to 50ms — prevents huge jumps after tab switch / minimize
      const delta = Math.min((now - lastFrameTime) / 1000, 0.05);
      lastFrameTime = now;
      elapsedTime += delta;
      const time = elapsedTime;

      // Update camera for all states
      updateCamera();

      // ─── MUSEUM STATE ───
      if (gameState === 'museum') {
        updatePlayerMovement(delta);

        // Check for nearby interactables
        setCurrentExhibit(null);
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
            setCurrentExhibit(closest.key);
            promptEl.style.display = 'block';
            promptEl.textContent = `Press E — ${closest.label}`;
          } else {
            promptEl.style.display = 'none';
          }
        } else {
          promptEl.style.display = 'none';
        }

        // Animate exhibit markers
        interactables.forEach((item, i) => {
          item.mesh.rotation.y = time * 1.5 + i;
          item.mesh.position.y = item.position.y + Math.sin(time * 2 + i) * 0.15;
        });

        // Billboard labels
        billboardLabels.forEach(lbl => {
          lbl.lookAt(camera.position.x, lbl.position.y, camera.position.z);
        });

        // Update particles + portal animation
        updateParticles(time);
        updatePortalAnimation(time);

        // Update remote multiplayer players
        updateRemotePlayers(delta, time);

        // Send position to server
        sendPositionUpdate();

        // Update minimap
        updateMinimap();
        drawRemotePlayersOnMinimap();

        // Show multiplayer HUD elements in museum (always visible, even when ESC unlocks pointer)
        const playerCountEl = document.getElementById('player-count');
        const chatBoxEl = document.getElementById('chat-box');
        if (playerCountEl) playerCountEl.style.display = 'block';
        if (chatBoxEl) chatBoxEl.style.display = 'flex';
      }

      // ─── LOBBY STATE ───
      if (gameState === 'lobby') {
        updateVoidScene(time);
      }

      // ─── ARENA STATE ───
      if (gameState === 'arena') {
        // Only allow movement during fighting phase
        if (getArenaPhase() === 'fighting') {
          updatePlayerMovement(delta);
        }
        updateArenaScene(delta, time, camera);
        sendArenaPositionUpdate();

        // Show crosshair and combat HUD when locked in arena
        if (isLocked) {
          document.getElementById('crosshair').style.display = 'block';
        }
      }

      // Hand animation (runs in museum and arena)
      if (gameState === 'museum' || gameState === 'arena') {
        updateHandAnimation(delta, time);
      }

      // Init audio on first locked frame
      if (isLocked && !audioInitialized) {
        initAudio();
        audioInitialized = true;
      }

      renderer.render(scene, camera);
    } catch (err) {
      // Catch errors to prevent the animation loop from dying
      console.error('[Game] Error in animation loop:', err);
      // Reset frame time so next frame doesn't compound the problem
      lastFrameTime = performance.now();
    }
  }

  loop();
}

// ─── START ──────────────────────────────────────────────────────────
initAuth((displayName) => {
  // Show loading screen after auth
  document.getElementById('loading').style.display = 'flex';
  init();
});
