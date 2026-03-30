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
  setYaw, setPitch, setCollisionEnabled, setSpacePressed,
  initPlayer, getCamera, getRenderer,
  updatePlayerMovement, updateCamera, tryJump,
  createHandModel, swingSword, selectHotbarSlot, updateHandAnimation,
  checkCollision, hideHandModels, showHandModels
} from './player.js';
import {
  connectWebSocket, sendPositionUpdate, sendSwing, setMyPlayerName,
  requestMuseumPlayerResync,
  setMultiplayerScene, setMultiplayerCamera, setExternalMessageHandler,
  updateRemotePlayers, hideRemotePlayers, showRemotePlayers,
  openChat, closeChat, sendChatMessage,
  ws, myPlayerName, myPlayerId
} from './multiplayer.js';
import {
  updateLoading, openExhibit, closeExhibitPanel,
  updateMinimap, drawRemotePlayersOnMinimap,
  initAudio, getAudioCtx
} from './ui.js';
import { setPortalScene, createPVPPortal, createFFABlock, updatePortalAnimation, updateFFAQueueDisplay } from './portal.js';
import {
  setLobbyScene, initLobbyUI, enterLobby, exitLobby,
  isInLobby, handleLobbyMessage, updateVoidScene
} from './pvp-lobby.js';
import {
  setArenaScene, enterArena, exitArena, isInArena,
  handleArenaMessage, updateArenaScene,
  sendArenaPositionUpdate, sendArenaSwing, getArenaPhase
} from './pvp-arena.js';
import { setLeaderboardScene, createLeaderboardWall, updateLeaderboard, setLeaderboardTab, getLeaderboardTab, refreshFFALeaderboard } from './leaderboard.js';
import { initAuth, getDisplayName } from './auth.js';
import { initSettings, closeSettings, isSettingsOpen } from './settings.js';
import {
  setFFAScene, enterFFA, exitFFA, isInFFA,
  handleFFAMessage, updateFFAScene,
  sendFFAPositionUpdate, sendFFASwing, getFFAPhase
} from './ffa-arena.js';
import {
  initVoiceChat, startTalking, stopTalking,
  handleVoiceSignal, cleanupVoice, isVoiceEnabled
} from './voice-chat.js';
import {
  detectMobile, initMobileControls, getIsMobile,
  mobileForward, mobileRight, mobileLookX, mobileLookY,
  mobileJump, mobileAttack, mobileInteract, resetMobileFrame
} from './mobile-controls.js';

// ─── GLOBALS ────────────────────────────────────────────────────────
let scene, camera, renderer;
let audioInitialized = false;
let gameState = 'museum'; // 'museum' | 'lobby' | 'arena' | 'ffa_queue' | 'ffa'
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

// Combat resume overlay — shown when pointer lock is lost during arena/FFA
function showCombatResumeOverlay() {
  let overlay = document.getElementById('combat-resume-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'combat-resume-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);cursor:pointer;';
    overlay.innerHTML = '<div style="color:#fff;font-family:Courier New,monospace;font-size:24px;text-align:center;text-shadow:0 2px 8px #000;"><div style="font-size:36px;margin-bottom:12px;">⚔️ PAUSED</div>Click to Resume</div>';
    overlay.addEventListener('click', () => {
      hideCombatResumeOverlay();
      safeRequestPointerLock();
    });
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';
}

function hideCombatResumeOverlay() {
  const overlay = document.getElementById('combat-resume-overlay');
  if (overlay) overlay.style.display = 'none';
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

  // Click canvas to re-lock pointer (works in all game states)
  canvas.addEventListener('click', () => {
    if (!isLocked) {
      safeRequestPointerLock();
    }
  });

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) {
      setIsLocked(true);
      escapeMode = false;
      if (blocker) blocker.style.display = 'none';
      hideCombatResumeOverlay();
      if (gameState === 'museum' || gameState === 'ffa_queue') {
        document.getElementById('crosshair').style.display = 'block';
        document.getElementById('hud').style.display = 'block';
        document.getElementById('social-bar').style.display = 'flex';
        if (minimapVisible) document.getElementById('minimap').style.display = 'block';
      }
      if (gameState === 'arena' || gameState === 'ffa') {
        document.getElementById('crosshair').style.display = 'block';
      }
    } else {
      if (!exhibitOpen) {
        setIsLocked(false);
        resetAllInputState();
        if ((gameState === 'museum' || gameState === 'ffa_queue') && !escapeMode) {
          if (blocker) blocker.style.display = 'flex';
        }
        if (gameState === 'museum' || gameState === 'ffa_queue') {
          document.getElementById('crosshair').style.display = 'none';
          document.getElementById('hud').style.display = 'block';
          document.getElementById('social-bar').style.display = 'flex';
          if (gameState === 'museum') document.getElementById('player-count').style.display = 'block';
          document.getElementById('chat-box').style.display = 'flex';
          if (minimapVisible) document.getElementById('minimap').style.display = 'block';
        }
        if (gameState === 'arena' || gameState === 'ffa') {
          document.getElementById('crosshair').style.display = 'none';
          showCombatResumeOverlay();
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
        if (!e.repeat) {
          setSpacePressed(true);
        }
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
        if (isSettingsOpen()) {
          closeSettings();
          e.preventDefault();
          break;
        }
        if (exhibitOpen) {
          setExhibitOpen(false);
          closeExhibitPanel();
          e.preventDefault();
        } else if (isLocked && (gameState === 'museum' || gameState === 'ffa_queue')) {
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
      case 'KeyQ':
        if (gameState === 'ffa_queue') leaveFFAQueue();
        break;
      case 'KeyV':
        if (!e.repeat) startTalking();
        break;
    }
  });

  document.addEventListener('keyup', (e) => {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': setMoveForward(false); break;
      case 'KeyS': case 'ArrowDown': setMoveBackward(false); break;
      case 'KeyA': case 'ArrowLeft': setMoveLeft(false); break;
      case 'KeyD': case 'ArrowRight': setMoveRight(false); break;
      case 'Space': setSpacePressed(false); break;
      case 'KeyV': stopTalking(); break;
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
      if (gameState === 'ffa_queue') return;
      enterPVPLobby();
      return;
    }
    if (currentExhibit === 'ffa_queue') {
      if (gameState === 'ffa_queue') {
        leaveFFAQueue();
        return;
      }
      enterFFAQueue();
      return;
    }
    if (currentExhibit === 'leaderboard_tab') {
      // Toggle leaderboard tab
      setLeaderboardTab(getLeaderboardTab() === 'pvp' ? 'ffa' : 'pvp');
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
    // Garden flat world: light blue sky fog
    scene.fog = new THREE.Fog(0x87ceeb, 60, 140);
    scene.background = new THREE.Color(0x87ceeb);
  }
}

function enterPVPLobby() {
  gameState = 'lobby';
  setMuseumVisible(false);
  setCollisionEnabled(false);
  hideRemotePlayers();

  // Hide museum HUD elements
  document.getElementById('hud').style.display = 'none';
  document.getElementById('crosshair').style.display = 'none';
  document.getElementById('interact-prompt').style.display = 'none';
  document.getElementById('minimap').style.display = 'none';
  document.getElementById('social-bar').style.display = 'none';
  document.getElementById('player-count').style.display = 'none';
  document.getElementById('chat-box').style.display = 'none';
  document.getElementById('settings-btn').style.display = 'none';
  
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
  showRemotePlayers();

  // Respawn at museum entrance, facing PVP portal (+Z)
  playerPos.set(0, playerHeight + floorY, -28);
  setYaw(Math.PI);

  // Hide blocker when returning to museum
  const blocker = document.getElementById('blocker');
  if (blocker) blocker.style.display = 'none';

  // Hide FFA queue bar if it was visible
  const queueBar = document.getElementById('ffa-queue-bar');
  if (queueBar) queueBar.style.display = 'none';

  hideCombatResumeOverlay();

  // Restore hand models
  showHandModels();

  // Show museum HUD elements
  document.getElementById('hud').style.display = 'block';
  document.getElementById('settings-btn').style.display = 'flex';
  document.getElementById('player-count').style.display = 'block';

  // Re-lock pointer for museum
  safeRequestPointerLock();
}

function enterPVPArena(gameData) {
  gameState = 'arena';
  setMuseumVisible(false);
  setCollisionEnabled(false);
  scene.fog = new THREE.Fog(0x87ceeb, 60, 140);
  scene.background = new THREE.Color(0x87ceeb);

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

// ─── FFA TRANSITIONS ────────────────────────────────────────────────
function enterFFAQueue() {
  gameState = 'ffa_queue';

  // Show non-blocking queue bar — player keeps walking in museum
  const bar = document.getElementById('ffa-queue-bar');
  if (bar) bar.style.display = 'block';

  // Hide the regular player count since the queue bar replaces it
  document.getElementById('player-count').style.display = 'none';

  // Tell server to join FFA queue
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'ffa_join_queue' }));
  }
}

function leaveFFAQueue() {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'ffa_leave_queue' }));
  }
  const bar = document.getElementById('ffa-queue-bar');
  if (bar) bar.style.display = 'none';
  gameState = 'museum';

  // Restore player count display
  document.getElementById('player-count').style.display = 'block';
}

function enterFFAArena(setupData) {
  gameState = 'ffa';
  setMuseumVisible(false);
  setCollisionEnabled(false);
  hideRemotePlayers();
  scene.fog = new THREE.Fog(0x87ceeb, 60, 140);
  scene.background = new THREE.Color(0x87ceeb);

  // Hide queue bar and museum HUD
  const bar = document.getElementById('ffa-queue-bar');
  if (bar) bar.style.display = 'none';
  document.getElementById('hud').style.display = 'none';
  document.getElementById('crosshair').style.display = 'none';
  document.getElementById('interact-prompt').style.display = 'none';
  document.getElementById('minimap').style.display = 'none';
  document.getElementById('social-bar').style.display = 'none';
  document.getElementById('player-count').style.display = 'none';
  document.getElementById('chat-box').style.display = 'none';
  document.getElementById('settings-btn').style.display = 'none';

  // Hide blocker if showing
  const blocker = document.getElementById('blocker');
  if (blocker) blocker.style.display = 'none';

  // Restore hand models for combat
  showHandModels();
  safeRequestPointerLock();
  selectHotbarSlot(1);

  // Add myId to setupData from multiplayer module
  setupData.myId = myPlayerId;

  enterFFA(setupData, (result) => {
    // FFA ended — refresh leaderboard then return to museum
    refreshFFALeaderboard();
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
  setFFAScene(scene);
  setLeaderboardScene(scene);

  // Route lobby/arena/FFA WS messages based on game state
  setExternalMessageHandler((msg) => {
    // Lobby-related messages
    const lobbyMsgTypes = [
      'lobby_entered', 'lobby_list', 'lobby_created', 'lobby_cancelled',
      'lobby_error', 'game_starting', 'lobby_player_joined', 'lobby_player_left'
    ];
    if (lobbyMsgTypes.includes(msg.type)) {
      handleLobbyMessage(msg);
      return;
    }

    // Arena-related messages (1v1 and 2v2)
    const arenaMsgTypes = [
      'arena_setup', 'player_eliminated'
    ];
    if (arenaMsgTypes.includes(msg.type) && (gameState === 'arena' || gameState === 'lobby')) {
      handleArenaMessage(msg);
      return;
    }

    // FFA-specific messages
    const ffaMsgTypes = [
      'ffa_queue_update', 'ffa_queue_left', 'ffa_arena_setup', 'ffa_round_start',
      'ffa_player_eliminated', 'ffa_match_end', 'ffa_error'
    ];
    if (ffaMsgTypes.includes(msg.type)) {
      if (msg.type === 'ffa_queue_update') {
        const countEl = document.getElementById('ffa-queue-count');
        if (countEl) countEl.textContent = `${msg.count}/${msg.max} Players`;
        return;
      }
      if (msg.type === 'ffa_queue_left') {
        return;
      }
      if (msg.type === 'ffa_arena_setup') {
        enterFFAArena(msg);
        return;
      }
      handleFFAMessage(msg);
      return;
    }

    // FFA queue count broadcast (for museum display)
    if (msg.type === 'ffa_queue_count') {
      updateFFAQueueDisplay(msg.count, msg.max);
      return;
    }

    // Shared combat messages — route by game state
    const sharedCombatMsgs = [
      'countdown_tick', 'round_start', 'hit',
      'heart_spawn', 'heart_picked_up', 'round_end', 'match_end'
    ];
    if (sharedCombatMsgs.includes(msg.type)) {
      if (gameState === 'ffa') {
        handleFFAMessage(msg);
      } else {
        handleArenaMessage(msg);
      }
      return;
    }

    // player_update and player_swing — route by game state
    if (msg.type === 'player_update' || msg.type === 'player_swing') {
      if (gameState === 'ffa') {
        handleFFAMessage(msg);
      } else if (gameState === 'arena') {
        handleArenaMessage(msg);
      }
      return;
    }

    // Voice signaling
    if (msg.type === 'voice_offer' || msg.type === 'voice_answer' || msg.type === 'voice_ice') {
      handleVoiceSignal(msg);
      return;
    }

    // returned_to_museum can come from lobby, arena, or FFA
    if (msg.type === 'returned_to_museum') {
      if (gameState === 'ffa') {
        handleFFAMessage(msg);
      } else {
        handleArenaMessage(msg);
      }
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
  createFFABlock();

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
      } else if (gameState === 'ffa') {
        swingSword(sendFFASwing);
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

  // FFA queue leave is now handled by Q key press

  // Detect mobile and init touch controls
  detectMobile();
  if (getIsMobile()) {
    initMobileControls();
  }

  // Init voice chat
  initVoiceChat();

  // Init settings UI
  initSettings();

  // Listen for lobby exit event (back to museum button)
  window.addEventListener('lobby-exit', () => {
    returnToMuseum();
  });

  window.addEventListener('lobby-match-aborted', () => {
    if (gameState === 'arena') {
      exitArena();
      returnToMuseum();
    }
  });

  setInterval(() => {
    if (gameState === 'museum' || gameState === 'ffa_queue') requestMuseumPlayerResync();
  }, 5000);

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

  // Position player at entrance, facing PVP portal (+Z)
  playerPos.set(0, playerHeight + floorY, -28);
  setYaw(Math.PI);

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
  setSpacePressed(false);
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
          if (gameState === 'ffa') sendFFAPositionUpdate();
          if (gameState === 'museum' || gameState === 'ffa_queue') sendPositionUpdate();
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

      // If pointer lock was lost (browsers always release it on tab switch),
      // show the resume overlay so the player can click to re-lock
      if (gameState === 'arena' || gameState === 'ffa') {
        const hasLock = document.pointerLockElement === renderer?.domElement;
        if (!hasLock) {
          setIsLocked(false);
          showCombatResumeOverlay();
        }
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
  // Immediately reset inputs on blur to prevent stuck keys
  window.addEventListener('blur', () => {
    resetAllInputState();
  });

  window.addEventListener('focus', () => {
    lastFrameTime = performance.now();
    resetAllInputState();

    setTimeout(() => {
      if (document.hidden) return;
      const hasLock = document.pointerLockElement === renderer?.domElement;
      if (!hasLock && (gameState === 'museum' || gameState === 'ffa_queue') && !exhibitOpen && !escapeMode) {
        const blocker = document.getElementById('blocker');
        if (blocker) blocker.style.display = 'flex';
        setIsLocked(false);
      }
      if (!hasLock && (gameState === 'arena' || gameState === 'ffa')) {
        setIsLocked(false);
        showCombatResumeOverlay();
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

      // ─── MUSEUM STATE (also active during ffa_queue) ───
      if (gameState === 'museum' || gameState === 'ffa_queue') {
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

      // ─── FFA STATE ───
      if (gameState === 'ffa') {
        const phase = getFFAPhase();
        if (phase === 'fighting') {
          updatePlayerMovement(delta);
        }
        updateFFAScene(delta, time, camera);
        sendFFAPositionUpdate();

        if (isLocked) {
          document.getElementById('crosshair').style.display = 'block';
        }
      }

      // Hand animation (runs in museum, ffa_queue, arena, and FFA)
      if (gameState === 'museum' || gameState === 'ffa_queue' || gameState === 'arena' || gameState === 'ffa') {
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
