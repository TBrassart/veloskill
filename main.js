// main.js
// Logique commune à toutes les pages Veloskill
// Version corrigée : auth Google + mode démo + Dashboard complet

const Veloskill = (() => {
  let currentUser = null;
  let currentProfile = null;

  /* --------------------- TOASTS --------------------- */
  function showToast({ type = 'info', title = '', message = '' }) {
    const containerId = 'veloskill-toasts';
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-icon">
        ${type === 'success' ? '✓' : type === 'error' ? '⚠️' : 'ℹ️'}
      </div>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        ${message ? `<div class="toast-message">${message}</div>` : ''}
      </div>
      <button class="toast-close" aria-label="Fermer">×</button>
    `;

    container.appendChild(toast);

    const remove = () => {
      toast.classList.add('toast-hide');
      setTimeout(() => toast.remove(), 250);
    };

    toast.querySelector('.toast-close').addEventListener('click', remove);
    setTimeout(remove, 3500);
  }

  /* --------------------- SESSION --------------------- */
  async function loadSessionAndProfile() {
    currentUser = await getCurrentUser();
    if (!currentUser) return null;

    currentProfile = await fetchUserProfile(currentUser.id);
    return { user: currentUser, profile: currentProfile };
  }

  function requireAuthOrRedirect() {
    const page = document.body.dataset.page;
    const urlParams = new URLSearchParams(window.location.search);
    const isDemo = urlParams.get('mode') === 'demo';

    const publicPages = ['landing'];
    if (publicPages.includes(page)) return;

    // Autoriser le mode démo sans connexion
    if (!currentUser && isDemo) return;

    if (!currentUser) {
      window.location.href = 'index.html';
    }
  }

  /* --------------------- HEADER --------------------- */
  function initHeader() {
    const name = currentProfile?.name || 'Cycliste Veloskill';
    const avatar = document.querySelector('[data-user-avatar]');
    const label = document.querySelector('[data-user-label]');
    if (avatar) avatar.textContent = (name[0] || 'V').toUpperCase();
    if (label) label.textContent = name;

    const dropdownTrigger = document.querySelector('[data-avatar-dropdown-trigger]');
    const dropdown = document.querySelector('[data-avatar-dropdown]');
    if (dropdownTrigger && dropdown) {
      dropdownTrigger.addEventListener('click', () => dropdown.classList.toggle('open'));
      document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !dropdownTrigger.contains(e.target)) {
          dropdown.classList.remove('open');
        }
      });
    }

    const logoutBtn = document.querySelector('[data-logout]');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await signOut();
        showToast({ type: 'success', title: 'Déconnexion', message: 'À bientôt 🚴' });
        window.location.href = 'index.html';
      });
    }
  }

  /* --------------------- LANDING --------------------- */
  async function initLanding() {
    const startBtn = document.querySelector('[data-action="start"]');
    const demoBtn = document.querySelector('[data-action="demo"]');
    const statusArea = document.querySelector('[data-auth-status]');

    if (startBtn) {
      startBtn.addEventListener('click', async () => {
        statusArea.hidden = false;
        try {
          await signInWithGoogle();
        } catch (err) {
          statusArea.hidden = true;
          showToast({
            type: 'error',
            title: 'Connexion échouée',
            message: 'Impossible de contacter le service OAuth.'
          });
        }
      });
    }

    if (demoBtn) {
      demoBtn.addEventListener('click', () => {
        showToast({
          type: 'info',
          title: 'Mode démo activé',
          message: 'Tu peux explorer Veloskill sans compte.'
        });
        window.location.href = 'dashboard.html?mode=demo';
      });
    }

    // Rediriger si déjà connecté
    const session = await getSession();
    if (session?.user) window.location.href = 'dashboard.html';
  }

  /* --------------------- DASHBOARD --------------------- */
  async function initDashboard() {
    const sessionData = await loadSessionAndProfile();
    const user = sessionData?.user;
    const profile = sessionData?.profile;

    // --- MODE DÉMO ---
    const isDemo = new URLSearchParams(window.location.search).get('mode') === 'demo';
    if (!user && isDemo) {
      renderDashboardXp({
        endurance: 1200,
        explosivity: 800,
        mental: 500,
        strategy: 300
      });
      renderDashboardBossPreview();
      showToast({
        type: 'info',
        title: 'Mode démo',
        message: 'Aucune donnée Strava, profil simulé.'
      });
      return;
    }

    // --- CAS NORMAL ---
    if (!user) {
      window.location.href = 'index.html';
      return;
    }

    const xp = await fetchUserXp(user.id);
    renderDashboardXp(xp);
    renderDashboardBossPreview();

    const syncBtn = document.getElementById('sync-strava-btn');
    if (syncBtn) {
      syncBtn.addEventListener('click', async () => {
        showToast({
          type: 'info',
          title: 'Synchronisation Strava',
          message: 'Synchronisation en cours...'
        });
        try {
          await new Promise((res) => setTimeout(res, 1500));
          showToast({
            type: 'success',
            title: 'Strava synchronisé',
            message: 'Tes dernières sorties sont à jour 🚴‍♂️'
          });
        } catch {
          showToast({
            type: 'error',
            title: 'Erreur de synchro',
            message: 'Impossible de contacter Strava pour le moment.'
          });
        }
      });
    }
  }

  function renderDashboardXp(xp) {
    const container = document.querySelector('[data-xp-grid]');
    if (!container) return;

    const axes = [
      { key: 'endurance', label: 'Endurance', color: '#42c779' },
      { key: 'explosivity', label: 'Explosivité', color: '#f2b01e' },
      { key: 'mental', label: 'Mental', color: '#5b74ff' },
      { key: 'strategy', label: 'Stratégie', color: '#e85e5e' }
    ];

    container.innerHTML = '';

    axes.forEach(axis => {
      const total = xp?.[axis.key] || 0;
      const level = computeLevelFromXp(total);
      const nextLevelXp = computeNextLevelXp(level);
      const baseXp = computeLevelBaseXp(level);
      const inLevel = total - baseXp;
      const inLevelTotal = nextLevelXp - baseXp;
      const percent = Math.min(100, Math.max(0, (inLevel / inLevelTotal) * 100));

      const card = document.createElement('div');
      card.className = 'xp-card';
      card.innerHTML = `
        <div class="xp-header">
          <div>${axis.label}</div>
          <div>Niv. ${level}</div>
        </div>
        <div class="xp-value">${Math.round(total)} XP</div>
        <div class="xp-bar"><div class="xp-bar-fill" style="background:${axis.color}; width:${percent}%"></div></div>
        <div class="xp-next">${nextLevelXp - total} XP avant le niveau ${level + 1}</div>
      `;
      container.appendChild(card);
    });
  }

  function computeLevelFromXp(xp) {
    return Math.floor(Math.sqrt((xp || 0) / 100)) + 1;
  }
  function computeLevelBaseXp(level) {
    if (level <= 1) return 0;
    const prev = level - 1;
    return 100 * prev * prev;
  }
  function computeNextLevelXp(level) {
    const next = level + 1;
    return 100 * next * next;
  }

  function renderDashboardBossPreview() {
    const el = document.querySelector('[data-boss-preview]');
    if (!el) return;
    el.innerHTML = `
      <div class="boss-title">🔥 Boss du moment</div>
      <div class="boss-subtitle">Relève un défi majeur inspiré de ton niveau actuel.</div>
      <button class="btn" onclick="window.location.href='boss.html'">Affronter le Boss</button>
    `;
  }

  /* --------------------- INIT GLOBAL --------------------- */
  async function init() {
    const page = document.body.dataset.page || 'landing';
    const sessionData = await loadSessionAndProfile();

    if (!sessionData && page !== 'landing') {
      const isDemo = new URLSearchParams(location.search).get('mode') === 'demo';
      if (!isDemo) {
        requireAuthOrRedirect();
        return;
      }
    }

    if (sessionData && page !== 'landing') initHeader();

    switch (page) {
      case 'landing':
        await initLanding();
        break;
      case 'dashboard':
        await initDashboard();
        break;
      case 'boss':
        // initBoss(); // déjà implémenté dans ton module Boss
        break;
      case 'profile':
        // initProfile();
        break;
      // autres pages à venir
    }
  }

  document.addEventListener('DOMContentLoaded', init);

  return { showToast };
})();
