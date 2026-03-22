// ─── MOBILE CONTROLS — Touch joystick + buttons for phones/tablets ──

let isMobile = false;
let joystickActive = false;
let joystickStartX = 0;
let joystickStartY = 0;
let joystickDeltaX = 0;
let joystickDeltaY = 0;
let lookTouchId = null;
let lookLastX = 0;
let lookLastY = 0;
let lookDeltaX = 0;
let lookDeltaY = 0;

// Movement output (consumed by player.js)
export let mobileForward = 0;
export let mobileRight = 0;
export let mobileLookX = 0;
export let mobileLookY = 0;
export let mobileJump = false;
export let mobileAttack = false;
export let mobileInteract = false;

export function getIsMobile() { return isMobile; }

// ─── DETECT MOBILE ──────────────────────────────────────────────────
export function detectMobile() {
  isMobile = (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  );
  return isMobile;
}

// ─── INIT MOBILE CONTROLS ──────────────────────────────────────────
export function initMobileControls() {
  if (!isMobile) return;

  // Show mobile UI
  const mobileUI = document.getElementById('mobile-controls');
  if (mobileUI) mobileUI.style.display = 'block';

  // Hide cursor-dependent elements
  const crosshair = document.getElementById('crosshair');
  if (crosshair) crosshair.style.display = 'none';

  setupJoystick();
  setupLookArea();
  setupButtons();

  // Prevent default touch behaviors
  document.addEventListener('touchmove', (e) => {
    if (e.target.closest('#mobile-controls') || e.target.closest('#mobile-look-area')) {
      e.preventDefault();
    }
  }, { passive: false });
}

// ─── JOYSTICK (left side) ───────────────────────────────────────────
function setupJoystick() {
  const joystickZone = document.getElementById('mobile-joystick-zone');
  const joystickKnob = document.getElementById('mobile-joystick-knob');
  if (!joystickZone || !joystickKnob) return;

  let touchId = null;

  joystickZone.addEventListener('touchstart', (e) => {
    const touch = e.changedTouches[0];
    touchId = touch.identifier;
    joystickActive = true;
    const rect = joystickZone.getBoundingClientRect();
    joystickStartX = rect.left + rect.width / 2;
    joystickStartY = rect.top + rect.height / 2;
    updateJoystick(touch.clientX, touch.clientY, joystickKnob);
  });

  joystickZone.addEventListener('touchmove', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchId) {
        updateJoystick(e.changedTouches[i].clientX, e.changedTouches[i].clientY, joystickKnob);
      }
    }
  });

  joystickZone.addEventListener('touchend', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchId) {
        joystickActive = false;
        touchId = null;
        joystickDeltaX = 0;
        joystickDeltaY = 0;
        mobileForward = 0;
        mobileRight = 0;
        joystickKnob.style.transform = 'translate(-50%, -50%)';
      }
    }
  });
}

function updateJoystick(clientX, clientY, knob) {
  const maxRadius = 50;
  let dx = clientX - joystickStartX;
  let dy = clientY - joystickStartY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > maxRadius) {
    dx = (dx / dist) * maxRadius;
    dy = (dy / dist) * maxRadius;
  }
  joystickDeltaX = dx / maxRadius;
  joystickDeltaY = dy / maxRadius;

  // Map to movement
  mobileForward = -joystickDeltaY; // up = forward
  mobileRight = joystickDeltaX;

  knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}

// ─── LOOK AREA (right side) ─────────────────────────────────────────
function setupLookArea() {
  const lookArea = document.getElementById('mobile-look-area');
  if (!lookArea) return;

  lookArea.addEventListener('touchstart', (e) => {
    const touch = e.changedTouches[0];
    lookTouchId = touch.identifier;
    lookLastX = touch.clientX;
    lookLastY = touch.clientY;
  });

  lookArea.addEventListener('touchmove', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === lookTouchId) {
        const touch = e.changedTouches[i];
        lookDeltaX = (touch.clientX - lookLastX) * 0.004;
        lookDeltaY = (touch.clientY - lookLastY) * 0.004;
        mobileLookX = lookDeltaX;
        mobileLookY = lookDeltaY;
        lookLastX = touch.clientX;
        lookLastY = touch.clientY;
      }
    }
  });

  lookArea.addEventListener('touchend', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === lookTouchId) {
        lookTouchId = null;
        mobileLookX = 0;
        mobileLookY = 0;
      }
    }
  });
}

// ─── ACTION BUTTONS ─────────────────────────────────────────────────
function setupButtons() {
  const jumpBtn = document.getElementById('mobile-jump-btn');
  const attackBtn = document.getElementById('mobile-attack-btn');
  const interactBtn = document.getElementById('mobile-interact-btn');

  if (jumpBtn) {
    jumpBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      mobileJump = true;
      setTimeout(() => { mobileJump = false; }, 100);
    });
  }

  if (attackBtn) {
    attackBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      mobileAttack = true;
      setTimeout(() => { mobileAttack = false; }, 100);
    });
  }

  if (interactBtn) {
    interactBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      mobileInteract = true;
      setTimeout(() => { mobileInteract = false; }, 100);
    });
  }
}

// ─── RESET FRAME DELTAS (call at end of each frame) ─────────────────
export function resetMobileFrame() {
  mobileLookX = 0;
  mobileLookY = 0;
}
