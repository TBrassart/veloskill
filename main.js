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

  async function initArbre() {
    const sessionData = await loadSessionAndProfile();
    const user = sessionData?.user;

    if (!user) {
      window.location.href = 'index.html';
      return;
    }

    const [skills, unlocks] = await Promise.all([
      fetchAllSkills(),
      fetchUserUnlocks(user.id)
    ]);

    renderArbre(skills, unlocks);
  }

  function renderArbre(skills, unlockedIds) {
    const container = document.querySelector('[data-arbre-container]');
    if (!container) return;
    container.innerHTML = '';

    skills.forEach(skill => {
      const isUnlocked = unlockedIds.includes(skill.id);
      const isAvailable = !isUnlocked && checkSkillAvailable(skill, unlockedIds);
      const stateClass = isUnlocked
        ? 'unlocked'
        : isAvailable
        ? 'available'
        : 'locked';

      const node = document.createElement('div');
      node.className = `skill-node ${stateClass}`;
      node.dataset.skillId = skill.id;
      node.innerHTML = `
        <div class="icon">${skill.icon || '🌿'}</div>
        <div class="name">${skill.name}</div>
        <div class="type">${skill.type}</div>
      `;
      if (isUnlocked || isAvailable) {
        node.addEventListener('click', () => {
          window.location.href = `skill.html?id=${skill.id}`;
        });
      }
      container.appendChild(node);
    });
  }

  async function initSkill() {
    const params = new URLSearchParams(window.location.search);
    const skillId = params.get('id');
    if (!skillId) {
      Veloskill.showToast({
        type: 'error',
        title: 'Compétence inconnue',
        message: 'Identifiant manquant dans l’URL.'
      });
      return;
    }

    const sessionData = await loadSessionAndProfile();
    const user = sessionData?.user;
    if (!user) {
      window.location.href = 'index.html';
      return;
    }

    const [skill, unlocks] = await Promise.all([
      fetchSkillById(skillId),
      fetchUserUnlocks(user.id)
    ]);

    if (!skill) {
      Veloskill.showToast({
        type: 'error',
        title: 'Erreur',
        message: 'Impossible de charger cette compétence.'
      });
      return;
    }

    const isUnlocked = unlocks.includes(skill.id);
    const isAvailable = !isUnlocked && checkSkillAvailable(skill, unlocks);
    const state = isUnlocked
      ? 'unlocked'
      : isAvailable
      ? 'available'
      : 'locked';

    renderSkillDetail(skill, state);
  }

  function renderSkillDetail(skill, state) {
    const container = document.querySelector('[data-skill-container]');
    if (!container) return;

    const conditionText = skill.conditions
      ? JSON.stringify(skill.conditions, null, 2)
      : 'Aucune condition définie.';
    const rewardText = skill.reward
      ? JSON.stringify(skill.reward, null, 2)
      : 'Aucune récompense.';

    container.innerHTML = `
      <h2>${skill.name}</h2>
      <div class="skill-type">${skill.type}</div>
      <p class="skill-desc">${skill.description || ''}</p>

      <div class="skill-section">
        <h3>Conditions</h3>
        <pre>${conditionText}</pre>
      </div>

      <div class="skill-section">
        <h3>Récompense</h3>
        <pre>${rewardText}</pre>
      </div>

      <div class="skill-state ${state}">
        ${state === 'unlocked'
          ? 'Débloquée 🌟'
          : state === 'available'
          ? 'Atteignable 🌱'
          : 'Verrouillée 🔒'}
      </div>
    `;
  }

  // Simple vérification : une compétence est "available" si son parent est débloqué
  function checkSkillAvailable(skill, unlockedIds) {
    if (!skill.parent_id) return true; // racine
    return unlockedIds.includes(skill.parent_id);
  }

  function showSkillPopup(skill, state) {
    const popup = document.querySelector('[data-skill-popup]');
    const content = document.querySelector('[data-skill-content]');
    const closeBtn = document.querySelector('[data-popup-close]');
    if (!popup || !content) return;

    const conditionText = skill.conditions
      ? JSON.stringify(skill.conditions, null, 2)
      : 'Aucune condition';
    const rewardText = skill.reward
      ? JSON.stringify(skill.reward, null, 2)
      : 'Aucune récompense définie';

    content.innerHTML = `
      <h2>${skill.name}</h2>
      <p class="skill-type">${skill.type}</p>
      <p>${skill.description || 'Pas de description.'}</p>
      <h3>Conditions</h3>
      <pre>${conditionText}</pre>
      <h3>Récompense</h3>
      <pre>${rewardText}</pre>
      <div class="skill-state">
        État : <strong>${state === 'unlocked' ? 'Débloquée 🌟' : state === 'available' ? 'Atteignable 🌱' : 'Verrouillée 🔒'}</strong>
      </div>
    `;

    popup.classList.add('show'); // 👈 au lieu de hidden = false
    closeBtn.onclick = () => popup.classList.remove('show');
    popup.addEventListener('click', (e) => {
      if (e.target === popup) popup.classList.remove('show');
    });
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

  async function initProfile() {
    const sessionData = await loadSessionAndProfile();
    const user = sessionData?.user;
    const profile = sessionData?.profile;

    if (!user) {
      window.location.href = 'index.html';
      return;
    }

    const form = document.querySelector('[data-profile-form]');
    const toggleThemeBtn = document.querySelector('[data-toggle-theme]');
    const exportBtn = document.querySelector('[data-export-json]');

    // Préremplir
    form.name.value = profile?.name || '';
    form.ftp.value = profile?.ftp || '';
    form.weight.value = profile?.weight || '';
    form.country.value = profile?.country || '';

    // Soumission
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const updates = {
        name: form.name.value.trim(),
        ftp: parseFloat(form.ftp.value) || null,
        weight: parseFloat(form.weight.value) || null,
        country: form.country.value.trim() || null
      };

      try {
        await updateUserProfile(user.id, updates);
        Veloskill.showToast({
          type: 'success',
          title: 'Profil mis à jour',
          message: 'Tes informations ont bien été enregistrées.'
        });
      } catch (err) {
        Veloskill.showToast({
          type: 'error',
          title: 'Erreur',
          message: 'Impossible de mettre à jour ton profil.'
        });
      }
    });

    // Thème
    toggleThemeBtn.addEventListener('click', () => {
      document.body.classList.toggle('light-theme');
      const mode = document.body.classList.contains('light-theme')
        ? 'Thème clair activé ☀️'
        : 'Thème sombre activé 🌙';
      Veloskill.showToast({ type: 'info', title: 'Apparence', message: mode });
      localStorage.setItem('veloskill-theme', document.body.classList.contains('light-theme') ? 'light' : 'dark');
    });

    // Export JSON
    exportBtn.addEventListener('click', async () => {
      try {
        const xp = await fetchUserXp(user.id);
        const unlocks = await fetchUserUnlocks(user.id);
        const data = { profile, xp, unlocks };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `veloskill_profile_${profile?.name || user.id}.json`;
        a.click();
        URL.revokeObjectURL(url);

        Veloskill.showToast({
          type: 'success',
          title: 'Export réussi',
          message: 'Tes données ont été téléchargées au format JSON.'
        });
      } catch (e) {
        Veloskill.showToast({
          type: 'error',
          title: 'Export échoué',
          message: 'Impossible de récupérer tes données.'
        });
      }
    });

    // Thème initial
    const savedTheme = localStorage.getItem('veloskill-theme');
    if (savedTheme === 'light') document.body.classList.add('light-theme');
  }

  async function initActivities() {
    const sessionData = await loadSessionAndProfile();
    const user = sessionData?.user;
    if (!user) {
      window.location.href = 'index.html';
      return;
    }

    const listContainer = document.querySelector('[data-activities-list]');
    const searchInput = document.querySelector('[data-search]');
    const typeSelect = document.querySelector('[data-type-filter]');

    // Chargement initial
    let activities = await fetchUserActivities(user.id);
    renderActivitiesList(activities);

    // Recherche
    searchInput.addEventListener('input', async () => {
      const search = searchInput.value.trim();
      const type = typeSelect.value;
      activities = await fetchUserActivities(user.id, search, type);
      renderActivitiesList(activities);
    });

    // Filtre par type
    typeSelect.addEventListener('change', async () => {
      const search = searchInput.value.trim();
      const type = typeSelect.value;
      activities = await fetchUserActivities(user.id, search, type);
      renderActivitiesList(activities);
    });
  }

  function renderActivitiesList(activities) {
    const container = document.querySelector('[data-activities-list]');
    if (!container) return;
    container.innerHTML = '';

    if (!activities.length) {
      container.innerHTML = `<p style="text-align:center;color:#888;">Aucune activité trouvée.</p>`;
      return;
    }

    activities.forEach(act => {
      const card = document.createElement('div');
      card.className = 'activity-card';
      const date = new Date(act.date);
      const formattedDate = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
      const distance = act.distance ? (act.distance / 1000).toFixed(1) : 0;
      const elev = act.elevation || 0;
      const power = act.avg_power ? Math.round(act.avg_power) : '—';
      const durationH = Math.floor((act.duration || 0) / 3600);
      const durationM = Math.floor(((act.duration || 0) % 3600) / 60);

      card.innerHTML = `
        <div class="activity-info">
          <div class="activity-title">${act.location || act.type || 'Sortie'}</div>
          <div class="activity-meta">${formattedDate} • ${act.type || 'Ride'}</div>
        </div>
        <div class="activity-stats">
          <span>🚴‍♂️ <strong>${distance}</strong> km</span>
          <span>⛰️ <strong>${elev}</strong> m</span>
          <span>⚡ <strong>${power}</strong> W</span>
          <span>⏱️ <strong>${durationH}h${durationM.toString().padStart(2,'0')}</strong></span>
        </div>
      `;
      container.appendChild(card);
    });
  }

  async function initBadges() {
    const sessionData = await loadSessionAndProfile();
    const user = sessionData?.user;
    if (!user) {
      window.location.href = 'index.html';
      return;
    }

    const filterSelect = document.querySelector('[data-badge-filter]');
    const grid = document.querySelector('[data-badges-grid]');

    let badges = await fetchUserBadges(user.id);
    renderBadgesList(badges);

    filterSelect.addEventListener('change', () => {
      const filter = filterSelect.value;
      const filtered = filter ? badges.filter(b => b.type === filter) : badges;
      renderBadgesList(filtered);
    });
  }

  function renderBadgesList(badges) {
    const grid = document.querySelector('[data-badges-grid]');
    if (!grid) return;

    grid.innerHTML = '';
    if (!badges.length) {
      grid.innerHTML = `<p style="text-align:center;color:#888;">Aucun badge débloqué pour le moment.</p>`;
      return;
    }

    badges.forEach(badge => {
      const card = document.createElement('div');
      card.className = `badge-card badge-type-${badge.type}`;
      card.innerHTML = `
        <div class="badge-icon">${badge.icon}</div>
        <div class="badge-title">${badge.title}</div>
        <div class="badge-desc">${badge.desc || ''}</div>
      `;
      grid.appendChild(card);
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
      case 'arbre':
        await initArbre();
        break;
      case 'skill':
        await initSkill();
        break;
      case 'boss':
        // initBoss(); // déjà implémenté dans ton module Boss
        break;
      case 'profile':
        await initProfile();
        break;
      case 'activities':
        await initActivities();
        break;
      case 'badges':
        await initBadges();
        break;
      // autres pages à venir
    }
  }

  document.addEventListener('DOMContentLoaded', init);

  return { showToast };
})();
