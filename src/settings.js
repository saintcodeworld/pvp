import { supabase, getCurrentUser, getDisplayName } from './auth.js';

let settingsOpen = false;

export function isSettingsOpen() { return settingsOpen; }

export function initSettings() {
  const btn = document.getElementById('settings-btn');
  const overlay = document.getElementById('settings-overlay');
  const closeBtn = document.getElementById('settings-close-btn');

  if (btn) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openSettings();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeSettings());
  }

  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSettings();
    });
  }

  // Password change form
  const pwForm = document.getElementById('settings-pw-form');
  if (pwForm) {
    pwForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handlePasswordChange();
    });
  }

  // Wallet save button
  const walletBtn = document.getElementById('settings-wallet-save');
  if (walletBtn) {
    walletBtn.addEventListener('click', async () => {
      await handleWalletSave();
    });
  }

  // Stop key events from propagating to game controls
  overlay.addEventListener('keydown', (e) => {
    e.stopPropagation();
  });
  overlay.addEventListener('keyup', (e) => {
    e.stopPropagation();
  });
}

async function openSettings() {
  settingsOpen = true;
  const overlay = document.getElementById('settings-overlay');
  overlay.style.display = 'flex';

  // Clear previous messages
  document.getElementById('settings-pw-error').textContent = '';
  document.getElementById('settings-pw-success').textContent = '';
  document.getElementById('settings-wallet-error').textContent = '';
  document.getElementById('settings-wallet-success').textContent = '';

  // Show current username
  const nameEl = document.getElementById('settings-username');
  if (nameEl) nameEl.textContent = getDisplayName();

  // Load current wallet address
  await loadWalletAddress();
}

export function closeSettings() {
  settingsOpen = false;
  const overlay = document.getElementById('settings-overlay');
  if (overlay) overlay.style.display = 'none';
}

async function loadWalletAddress() {
  const user = getCurrentUser();
  if (!user) return;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('solana_wallet')
      .eq('id', user.id)
      .single();

    if (!error && data && data.solana_wallet) {
      document.getElementById('settings-wallet-input').value = data.solana_wallet;
    }
  } catch (err) {
    console.error('[Settings] Failed to load wallet:', err);
  }
}

async function handlePasswordChange() {
  const newPw = document.getElementById('settings-new-pw').value;
  const confirmPw = document.getElementById('settings-confirm-pw').value;
  const errorEl = document.getElementById('settings-pw-error');
  const successEl = document.getElementById('settings-pw-success');

  errorEl.textContent = '';
  successEl.textContent = '';

  if (!newPw || !confirmPw) {
    errorEl.textContent = 'Please fill in both fields';
    return;
  }
  if (newPw.length < 6) {
    errorEl.textContent = 'Password must be at least 6 characters';
    return;
  }
  if (newPw !== confirmPw) {
    errorEl.textContent = 'Passwords do not match';
    return;
  }

  try {
    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) throw error;
    successEl.textContent = 'Password updated successfully!';
    document.getElementById('settings-new-pw').value = '';
    document.getElementById('settings-confirm-pw').value = '';
  } catch (err) {
    errorEl.textContent = err.message || 'Failed to update password';
  }
}

async function handleWalletSave() {
  const user = getCurrentUser();
  const walletInput = document.getElementById('settings-wallet-input');
  const errorEl = document.getElementById('settings-wallet-error');
  const successEl = document.getElementById('settings-wallet-success');

  errorEl.textContent = '';
  successEl.textContent = '';

  const wallet = walletInput.value.trim();

  if (!wallet) {
    errorEl.textContent = 'Please enter a wallet address';
    return;
  }

  // Basic Solana address validation (base58, 32-44 chars)
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
    errorEl.textContent = 'Invalid Solana wallet address';
    return;
  }

  if (!user) {
    errorEl.textContent = 'Not authenticated';
    return;
  }

  try {
    const { error } = await supabase
      .from('profiles')
      .update({ solana_wallet: wallet })
      .eq('id', user.id);

    if (error) throw error;
    successEl.textContent = 'Wallet address saved!';
  } catch (err) {
    errorEl.textContent = err.message || 'Failed to save wallet';
  }
}
