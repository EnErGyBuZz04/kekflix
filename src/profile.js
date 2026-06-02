import { fetchProfiles, verifyPin, saveProfileSession, getCurrentProfile, logout } from './supabase.js';

const $ = (sel) => document.querySelector(sel);

// Helper for custom avatars
function getAvatarHTML(profile, className) {
  const name = profile.name.toLowerCase();
  const avatarMap = {
    'mery': '/avatars/mery.png',
    'antony': '/avatars/antony.png',
    'kekko': '/avatars/kekko.png'
  };
  
  if (avatarMap[name]) {
    return `<div class="${className}" style="background-color: ${profile.avatar_color}; background-image: url('${avatarMap[name]}'); background-size: cover; background-position: center;"></div>`;
  }
  
  const innerClass = className === 'profile-avatar' ? 'profile-avatar-letter' : (className === 'pin-avatar' ? 'pin-avatar-letter' : '');
  return `
    <div class="${className}" style="background-color: ${profile.avatar_color}">
      <span class="${innerClass}">${profile.name.charAt(0).toUpperCase()}</span>
    </div>
  `;
}

// ─── Profile Selection Screen ──────────────────────────

/**
 * Render the profile selection screen
 */
export async function renderProfileScreen() {
  const screen = $('#profile-screen');
  if (!screen) return;

  screen.classList.remove('hidden');
  screen.innerHTML = `
    <div class="profile-container">
      <div class="profile-logo">KEKFLIX</div>
      <h2 class="profile-heading">Chi sta guardando?</h2>
      <div class="profile-grid" id="profile-grid">
        <div class="profile-loading">
          <div class="spinner"></div>
          <p>Caricamento profili...</p>
        </div>
      </div>
    </div>
  `;

  try {
    const profiles = await fetchProfiles();
    const grid = $('#profile-grid');

    if (!profiles || profiles.length === 0) {
      grid.innerHTML = `
        <div class="profile-empty">
          <div class="profile-empty-icon">👤</div>
          <p>Nessun profilo trovato.</p>
          <p class="profile-empty-hint">Crea un profilo dalla dashboard Supabase.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = profiles.map(profile => `
      <button class="profile-card" data-id="${profile.id}" data-name="${profile.name}" data-color="${profile.avatar_color}">
        ${getAvatarHTML(profile, 'profile-avatar')}
        <span class="profile-name">${profile.name}</span>
      </button>
    `).join('');

    // Attach click events
    grid.querySelectorAll('.profile-card').forEach(card => {
      card.addEventListener('click', () => {
        const profileData = {
          id: card.dataset.id,
          name: card.dataset.name,
          avatar_color: card.dataset.color,
        };
        showPinInput(profileData);
      });
    });

  } catch (err) {
    console.error('Profile screen error:', err);
    const grid = $('#profile-grid');
    if (grid) {
      grid.innerHTML = `
        <div class="profile-empty">
          <div class="profile-empty-icon">⚠️</div>
          <p>Errore nel caricamento dei profili.</p>
          <p class="profile-empty-hint">${err.message || 'Riprova più tardi.'}</p>
          <button class="btn btn-play" onclick="location.reload()" style="margin-top:16px">Riprova</button>
        </div>
      `;
    }
  }
}

/**
 * Show PIN input overlay for a selected profile
 */
function showPinInput(profile) {
  const screen = $('#profile-screen');

  // Create PIN overlay
  const overlay = document.createElement('div');
  overlay.className = 'pin-overlay';
  overlay.id = 'pin-overlay';
  overlay.innerHTML = `
    <div class="pin-container">
      <button class="pin-back" id="pin-back" aria-label="Torna ai profili">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      ${getAvatarHTML(profile, 'pin-avatar')}
      <h3 class="pin-profile-name">${profile.name}</h3>
      <p class="pin-label">Inserisci il PIN</p>
      <div class="pin-dots" id="pin-dots">
        <div class="pin-dot"></div>
        <div class="pin-dot"></div>
        <div class="pin-dot"></div>
        <div class="pin-dot"></div>
      </div>
      <p class="pin-error hidden" id="pin-error">PIN errato. Riprova.</p>
      <div class="pin-keypad" id="pin-keypad">
        <button class="pin-key" data-digit="1">1</button>
        <button class="pin-key" data-digit="2">2</button>
        <button class="pin-key" data-digit="3">3</button>
        <button class="pin-key" data-digit="4">4</button>
        <button class="pin-key" data-digit="5">5</button>
        <button class="pin-key" data-digit="6">6</button>
        <button class="pin-key" data-digit="7">7</button>
        <button class="pin-key" data-digit="8">8</button>
        <button class="pin-key" data-digit="9">9</button>
        <button class="pin-key pin-key-empty"></button>
        <button class="pin-key" data-digit="0">0</button>
        <button class="pin-key pin-key-delete" id="pin-delete" aria-label="Cancella">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
            <line x1="18" y1="9" x2="12" y2="15"/>
            <line x1="12" y1="9" x2="18" y2="15"/>
          </svg>
        </button>
      </div>
      <div class="pin-loading hidden" id="pin-loading">
        <div class="spinner"></div>
      </div>
    </div>
  `;

  screen.appendChild(overlay);

  // Animate in
  requestAnimationFrame(() => {
    overlay.classList.add('visible');
  });

  // PIN state
  let pin = '';
  const dots = overlay.querySelectorAll('.pin-dot');
  const errorEl = overlay.querySelector('#pin-error');
  const loadingEl = overlay.querySelector('#pin-loading');
  const keypad = overlay.querySelector('#pin-keypad');

  function updateDots() {
    dots.forEach((dot, i) => {
      dot.classList.toggle('filled', i < pin.length);
    });
  }

  function showError() {
    errorEl.classList.remove('hidden');
    const container = overlay.querySelector('.pin-container');
    container.classList.add('shake');
    setTimeout(() => {
      container.classList.remove('shake');
    }, 500);

    // Reset after animation
    setTimeout(() => {
      pin = '';
      updateDots();
      errorEl.classList.add('hidden');
      keypad.classList.remove('disabled');
    }, 1500);
  }

  async function submitPin() {
    if (pin.length !== 4) return;

    keypad.classList.add('disabled');
    loadingEl.classList.remove('hidden');
    errorEl.classList.add('hidden');

    try {
      const valid = await verifyPin(profile.id, pin);

      if (valid) {
        // Success — save session and transition to app
        saveProfileSession(profile);
        overlay.querySelector('.pin-container').classList.add('pin-success');

        setTimeout(() => {
          hideProfileScreen();
          showApp();
        }, 600);
      } else {
        loadingEl.classList.add('hidden');
        showError();
      }
    } catch (err) {
      console.error('PIN submit error:', err);
      loadingEl.classList.add('hidden');
      showError();
    }
  }

  // Keypad click events
  overlay.querySelectorAll('.pin-key[data-digit]').forEach(key => {
    key.addEventListener('click', () => {
      if (pin.length >= 4 || keypad.classList.contains('disabled')) return;
      pin += key.dataset.digit;
      updateDots();

      if (pin.length === 4) {
        submitPin();
      }
    });
  });

  // Delete button
  overlay.querySelector('#pin-delete').addEventListener('click', () => {
    if (keypad.classList.contains('disabled')) return;
    pin = pin.slice(0, -1);
    updateDots();
    errorEl.classList.add('hidden');
  });

  // Back button
  overlay.querySelector('#pin-back').addEventListener('click', () => {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 300);
  });

  // Keyboard support
  function handleKeydown(e) {
    if (!overlay.isConnected) {
      document.removeEventListener('keydown', handleKeydown);
      return;
    }

    if (keypad.classList.contains('disabled')) return;

    if (e.key >= '0' && e.key <= '9') {
      if (pin.length >= 4) return;
      pin += e.key;
      updateDots();
      if (pin.length === 4) submitPin();
    } else if (e.key === 'Backspace') {
      pin = pin.slice(0, -1);
      updateDots();
      errorEl.classList.add('hidden');
    } else if (e.key === 'Escape') {
      overlay.classList.remove('visible');
      setTimeout(() => overlay.remove(), 300);
    }
  }

  document.addEventListener('keydown', handleKeydown);
}

/**
 * Hide the profile screen
 */
function hideProfileScreen() {
  const screen = $('#profile-screen');
  if (screen) {
    screen.classList.add('fade-out');
    setTimeout(() => {
      screen.classList.add('hidden');
      screen.classList.remove('fade-out');
    }, 500);
  }
}

/**
 * Show the main app container
 */
function showApp() {
  const app = $('#app-container');
  if (app) {
    app.classList.remove('hidden');
    app.classList.add('fade-in-app');

    // Dispatch custom event so main.js knows to initialize the app
    window.dispatchEvent(new CustomEvent('kekflix:profile-authenticated'));
  }
}

/**
 * Check if there's an existing session; if so, skip profile screen
 * @returns {boolean} true if already authenticated
 */
export function checkExistingSession() {
  return getCurrentProfile() !== null;
}

/**
 * Initialize the profile badge in the navbar + logout button
 */
export function initProfileBadge() {
  const profile = getCurrentProfile();
  if (!profile) return;

  const navbar = $('nav.navbar');
  if (!navbar) return;

  // Remove existing badge if any
  const existing = navbar.querySelector('.profile-badge');
  if (existing) existing.remove();

  const badge = document.createElement('div');
  badge.className = 'profile-badge';
  badge.innerHTML = `
    ${getAvatarHTML(profile, 'profile-badge-avatar')}
    <div class="profile-badge-menu hidden" id="profile-badge-menu">
      <div class="profile-badge-name">${profile.name}</div>
      <button class="profile-badge-logout" id="btn-logout">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Esci
      </button>
    </div>
  `;

  navbar.appendChild(badge);

  // Toggle menu on click
  const avatarBtn = badge.querySelector('.profile-badge-avatar');
  const menu = badge.querySelector('#profile-badge-menu');

  avatarBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
  });

  // Close menu on click outside
  document.addEventListener('click', () => {
    menu.classList.add('hidden');
  });

  // Logout
  badge.querySelector('#btn-logout').addEventListener('click', () => {
    logout();
    // Reload to show profile screen
    location.reload();
  });
}
