// ─── VOICE CHAT — WebRTC push-to-talk (V key) ──────────────────────
import { ws, getMyId } from './multiplayer.js';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

let localStream = null;
let isTalking = false;
let voiceEnabled = false;
const peerConnections = new Map(); // peerId -> RTCPeerConnection
const remoteAudios = new Map(); // peerId -> HTMLAudioElement
let knownPeers = new Set(); // peer IDs in same room

export function isVoiceEnabled() { return voiceEnabled; }
export function isTalkingNow() { return isTalking; }

// ─── INIT VOICE SYSTEM ─────────────────────────────────────────────
export async function initVoiceChat() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    // Mute all tracks by default (push-to-talk)
    localStream.getAudioTracks().forEach(t => { t.enabled = false; });
    voiceEnabled = true;
    updateVoiceUI();
    console.log('[Voice] Microphone ready');
  } catch (err) {
    console.warn('[Voice] Microphone not available:', err.message);
    voiceEnabled = false;
    updateVoiceUI();
  }
}

// ─── PUSH TO TALK ───────────────────────────────────────────────────
export function startTalking() {
  if (!voiceEnabled || !localStream) return;
  isTalking = true;
  localStream.getAudioTracks().forEach(t => { t.enabled = true; });
  updateVoiceUI();
}

export function stopTalking() {
  if (!localStream) return;
  isTalking = false;
  localStream.getAudioTracks().forEach(t => { t.enabled = false; });
  updateVoiceUI();
}

// ─── PEER CONNECTION MANAGEMENT ─────────────────────────────────────
export function updatePeers(peerIds) {
  const newPeers = new Set(peerIds);
  const myId = getMyId();

  // Remove peers no longer present
  knownPeers.forEach(pid => {
    if (!newPeers.has(pid)) {
      closePeer(pid);
    }
  });

  // Add new peers (only initiate if our ID is lower to avoid duplicate offers)
  newPeers.forEach(pid => {
    if (pid === myId) return;
    if (!peerConnections.has(pid) && myId < pid) {
      createOffer(pid);
    }
  });

  knownPeers = newPeers;
}

async function createOffer(peerId) {
  const pc = createPeerConnection(peerId);
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal(peerId, { type: 'voice_offer', sdp: offer.sdp });
  } catch (err) {
    console.warn('[Voice] Offer error:', err.message);
  }
}

function createPeerConnection(peerId) {
  if (peerConnections.has(peerId)) {
    peerConnections.get(peerId).close();
  }

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  peerConnections.set(peerId, pc);

  // Add local audio tracks
  if (localStream) {
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });
  }

  // Handle ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      sendSignal(peerId, {
        type: 'voice_ice',
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid,
        sdpMLineIndex: event.candidate.sdpMLineIndex,
      });
    }
  };

  // Handle remote audio
  pc.ontrack = (event) => {
    let audio = remoteAudios.get(peerId);
    if (!audio) {
      audio = new Audio();
      audio.autoplay = true;
      remoteAudios.set(peerId, audio);
    }
    audio.srcObject = event.streams[0];
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      closePeer(peerId);
    }
  };

  return pc;
}

function closePeer(peerId) {
  const pc = peerConnections.get(peerId);
  if (pc) {
    pc.close();
    peerConnections.delete(peerId);
  }
  const audio = remoteAudios.get(peerId);
  if (audio) {
    audio.srcObject = null;
    remoteAudios.delete(peerId);
  }
  knownPeers.delete(peerId);
}

// ─── HANDLE SIGNALING MESSAGES ──────────────────────────────────────
export async function handleVoiceSignal(msg) {
  const fromId = msg.fromId;
  if (!fromId || !voiceEnabled) return;

  switch (msg.type) {
    case 'voice_offer': {
      const pc = createPeerConnection(fromId);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: msg.sdp }));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal(fromId, { type: 'voice_answer', sdp: answer.sdp });
      } catch (err) {
        console.warn('[Voice] Answer error:', err.message);
      }
      break;
    }

    case 'voice_answer': {
      const pc = peerConnections.get(fromId);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: msg.sdp }));
        } catch (err) {
          console.warn('[Voice] Set answer error:', err.message);
        }
      }
      break;
    }

    case 'voice_ice': {
      const pc = peerConnections.get(fromId);
      if (pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate({
            candidate: msg.candidate,
            sdpMid: msg.sdpMid,
            sdpMLineIndex: msg.sdpMLineIndex,
          }));
        } catch (err) {
          // Ignore ICE errors
        }
      }
      break;
    }
  }
}

function sendSignal(targetId, data) {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ ...data, targetId }));
}

// ─── CLEANUP ────────────────────────────────────────────────────────
export function cleanupVoice() {
  peerConnections.forEach((pc, pid) => {
    pc.close();
  });
  peerConnections.clear();
  remoteAudios.forEach(audio => { audio.srcObject = null; });
  remoteAudios.clear();
  knownPeers.clear();
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  voiceEnabled = false;
  isTalking = false;
}

// ─── UI ─────────────────────────────────────────────────────────────
function updateVoiceUI() {
  const indicator = document.getElementById('voice-indicator');
  if (!indicator) return;

  if (!voiceEnabled) {
    indicator.style.display = 'none';
    return;
  }

  indicator.style.display = 'block';
  if (isTalking) {
    indicator.textContent = '🎤 TALKING';
    indicator.style.color = '#00ff44';
    indicator.style.borderColor = '#00ff44';
  } else {
    indicator.textContent = '🎤 V to Talk';
    indicator.style.color = '#888';
    indicator.style.borderColor = '#444';
  }
}
