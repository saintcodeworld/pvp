import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ehtucekuetlnmbajtfbp.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVodHVjZWt1ZXRsbm1iYWp0ZmJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDM5MjIsImV4cCI6MjA4OTY3OTkyMn0.EaccJqR4y_rIs04YknIjwmyNotL7AHtzoxUHS9Um7ZE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ─── AUTH STATE ──────────────────────────────────────────────────
let currentUser = null;
let authMode = 'signin'; // 'signin' | 'signup'

export function getCurrentUser() { return currentUser; }

export function getDisplayName() {
  if (!currentUser) return 'Player';
  return currentUser.user_metadata?.username
    || currentUser.email?.split('@')[0]
    || 'Player';
}

// ─── INIT AUTH UI ────────────────────────────────────────────────
export async function initAuth(onAuthenticated) {
  // Generate stars for background
  const starsContainer = document.getElementById('auth-stars');
  if (starsContainer) {
    for (let i = 0; i < 80; i++) {
      const star = document.createElement('div');
      star.className = 'auth-star';
      star.style.left = Math.random() * 100 + '%';
      star.style.top = Math.random() * 100 + '%';
      star.style.animationDelay = (Math.random() * 3) + 's';
      star.style.animationDuration = (2 + Math.random() * 3) + 's';
      starsContainer.appendChild(star);
    }
  }

  // Check existing session
  const { data: { session } } = await supabase.auth.getSession();
  if (session && session.user) {
    currentUser = session.user;
    hideAuth();
    onAuthenticated(getDisplayName());
    return;
  }

  // Setup tab switching
  window.switchAuthTab = (mode) => {
    authMode = mode;
    document.getElementById('tab-signin').classList.toggle('active', mode === 'signin');
    document.getElementById('tab-signup').classList.toggle('active', mode === 'signup');
    document.getElementById('auth-submit-btn').textContent = mode === 'signin' ? 'Sign In' : 'Sign Up';
    document.getElementById('auth-error').textContent = '';
    document.getElementById('auth-success').textContent = '';
  };

  // Setup form submission
  const form = document.getElementById('auth-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    const errorEl = document.getElementById('auth-error');
    const successEl = document.getElementById('auth-success');
    const submitBtn = document.getElementById('auth-submit-btn');

    errorEl.textContent = '';
    successEl.textContent = '';

    if (!username || !password) {
      errorEl.textContent = 'Username and password are required';
      return;
    }

    // Validate username format (alphanumeric and underscores only)
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      errorEl.textContent = 'Username can only contain letters, numbers, and underscores';
      return;
    }

    // Generate synthetic email for Supabase
    const email = `${username.toLowerCase()}@pvpwars.local`;

    submitBtn.disabled = true;
    submitBtn.textContent = authMode === 'signin' ? 'Signing in...' : 'Signing up...';

    try {
      if (authMode === 'signup') {
        if (password.length < 6) {
          errorEl.textContent = 'Password must be at least 6 characters';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Sign Up';
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username: username }
          }
        });
        if (error) throw error;

        if (data.user && data.session) {
          // Auto-confirmed (email confirmation disabled)
          currentUser = data.user;
          hideAuth();
          onAuthenticated(getDisplayName());
        } else if (data.user) {
          // Email confirmation may be required — try signing in immediately
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
          if (signInError) {
            successEl.textContent = 'Account created! Please sign in.';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign Up';
            switchAuthTab('signin');
          } else {
            currentUser = signInData.user;
            hideAuth();
            onAuthenticated(getDisplayName());
          }
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        currentUser = data.user;
        hideAuth();
        onAuthenticated(getDisplayName());
      }
    } catch (err) {
      let errorMsg = err.message || 'Authentication failed';
      // Simplify error messages for users
      if (errorMsg.includes('User already registered')) {
        errorMsg = 'Username already taken';
      } else if (errorMsg.includes('Invalid login credentials')) {
        errorMsg = 'Invalid username or password';
      }
      errorEl.textContent = errorMsg;
      submitBtn.disabled = false;
      submitBtn.textContent = authMode === 'signin' ? 'Sign In' : 'Sign Up';
    }
  });
}

function hideAuth() {
  const overlay = document.getElementById('auth-overlay');
  if (overlay) overlay.classList.add('hidden');
}
