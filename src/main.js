import {
  renderHomePage,
  initSearch,
  initNavbarScroll,
  initNavigation,
  initModalEvents,
} from './ui.js';
import { renderProfileScreen, checkExistingSession, initProfileBadge } from './profile.js';
import { initTvNavigation } from './tv-nav.js';

// ─── App Init ─────────────────────────────────────────
let appInitialized = false;

async function initApp() {
  if (appInitialized) return;
  appInitialized = true;

  console.log('🎬 KEKFLIX starting...');

  // Show the app container
  const appContainer = document.getElementById('app-container');
  if (appContainer) {
    appContainer.classList.remove('hidden');
    appContainer.classList.add('fade-in-app');
  }

  // Hide profile screen
  const profileScreen = document.getElementById('profile-screen');
  if (profileScreen) {
    profileScreen.classList.add('hidden');
  }

  // Initialize UI components
  initNavbarScroll();
  initNavigation();
  initSearch();
  initModalEvents();
  initProfileBadge();
  initTvNavigation();

  // Render homepage
  try {
    await renderHomePage();
    console.log('✅ KEKFLIX loaded successfully');
  } catch (err) {
    console.error('❌ Failed to load KEKFLIX:', err);
    document.getElementById('content-rows').innerHTML = `
      <div style="text-align:center;padding:100px 20px;color:#b3b3b3">
        <div style="font-size:4rem;margin-bottom:16px">⚠️</div>
        <h2 style="color:#fff;margin-bottom:12px">Errore di Caricamento</h2>
        <p>Impossibile caricare i contenuti. Verifica la connessione e ricarica la pagina.</p>
        <button onclick="location.reload()" style="margin-top:24px;padding:12px 28px;background:#E50914;color:#fff;border:none;border-radius:4px;font-size:1rem;cursor:pointer">
          Ricarica
        </button>
      </div>
    `;
  }
}

async function boot() {
  // Check for existing profile session
  if (checkExistingSession()) {
    // Already logged in — go straight to app
    await initApp();
  } else {
    // Show profile selection screen
    await renderProfileScreen();

    // Listen for successful authentication
    window.addEventListener('kekflix:profile-authenticated', () => {
      initApp();
    }, { once: true });
  }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
