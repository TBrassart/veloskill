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
    // 🎯 Niveau global dans le header
    addGlobalLevelToHeader();
  }

  async function addGlobalLevelToHeader() {
    const header = document.querySelector('header');
    if (!header || !currentUser) return;

    const { data } = await supabaseClient
      .from('global_xp')
      .select('total_xp, level')
      .eq('user_id', currentUser.id)
      .maybeSingle();

    const level = data?.level || 1;
    const avatar = document.querySelector('[data-user-avatar]');
    if (!avatar) return;

    // Supprime tout badge existant
    let capsule = document.querySelector('[data-global-capsule]');
    if (capsule) capsule.remove();

    // Crée une capsule englobant avatar + niveau
    capsule = document.createElement('div');
    capsule.dataset.globalCapsule = true;
    capsule.className = 'global-capsule';
    capsule.innerHTML = `
      <span class="global-level">Niv. ${level}</span>
      <div class="global-avatar">${avatar.textContent}</div>
    `;

    // Remplace l’ancien avatar visuel
    avatar.replaceWith(capsule);
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

    const xp = await getOrComputeUserXp(user.id);
    renderDashboardXp(xp);

    // 🔍 Récupère et affiche le niveau global
    const globalXp = await fetchGlobalXp(user.id);

    renderDashboardBossPreview();

    const syncBtn = document.getElementById('sync-strava-btn');
    if (syncBtn) {
      syncBtn.addEventListener('click', async () => {
        Veloskill.showToast({
          type: 'info',
          title: 'Synchronisation Strava',
          message: 'Synchronisation en cours...'
        });

        try {
          // 🔄 Étape 1 : simule ou appelle la vraie sync Strava ici
          // (ici on simule juste un délai réseau)
          await new Promise((res) => setTimeout(res, 2000));

          // 🔄 Étape 2 : recalcul des XP immédiatement après la sync
          const newXp = await Veloskill.calculateXpFromActivities(user.id);
          
          // ➕ mise à jour de la progression Boss
          await updateBossProgress(user.id);

          const oldXp = await getOrComputeUserXp(user.id);
          const oldLevel = computeLevelFromXp(oldXp.endurance);
          const newLevel = computeLevelFromXp(newXp.endurance);

          if (newLevel > oldLevel) {
            Veloskill.showToast({
              type: 'success',
              title: `🎉 Niveau ${newLevel} atteint !`,
              message: 'Nouvelle étape franchie sur ton axe Endurance 🌿'
            });
          }

          // 🔄 Étape 3 : met à jour l'affichage du dashboard
          renderDashboardXp(newXp);

          // 🔔 Étape 4 : toasts motivants
          Veloskill.showToast({
            type: 'success',
            title: 'Strava synchronisé ✅',
            message: 'Tes dernières sorties ont bien été importées.'
          });

          Veloskill.showToast({
            type: 'info',
            title: 'Progression mise à jour',
            message: `+${Math.round(newXp.endurance)} XP Endurance · +${Math.round(newXp.explosivity)} XP Explosivité`
          });

        } catch (err) {
          console.error(err);
          Veloskill.showToast({
            type: 'error',
            title: 'Erreur de synchronisation',
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

  /* --------------------- CALCUL XP DYNAMIQUE --------------------- */
  // Calcule les 4 jauges à partir des activités Strava de l'utilisateur
  async function calculateXpFromActivities(userId) {
    console.log("Calcul XP pour user:", userId);
    const activities = await fetchUserActivities(userId);
    console.log("Activités trouvées:", activities);
    if (!activities || !activities.length) {
      return { endurance: 0, explosivity: 0, mental: 0, strategy: 0 };
    }

    let endurance = 0, explosivity = 0, mental = 0, strategy = 0;

    for (const act of activities) {
      const dist = Number(act.distance) || 0;   // km
      const elev = Number(act.elevation) || 0;  // m
      const dur = Number(act.duration) || 0;    // s
      const power = Number(act.avg_power) || 0; // W
      const date = new Date(act.date);

      // Recalculer la vitesse moyenne en km/h si possible
      const speed = dur > 0 ? (dist / (dur / 3600)) : 0;

      // ---- Barème XP réaliste (unités réelles) ----
      // Idée : ~1000 à 3000 XP pour une sortie standard

      // Endurance : distance + durée (en h)
      endurance += dist * 20 + (dur / 3600) * 200;

      // Explosivité : puissance et dénivelé
      if (power > 0) explosivity += Math.max(0, (power - 150)) * 1.5;
      explosivity += elev * 0.3; // bonus pour grimpe

      // Mental : durée longue + bonus week-end
      mental += (dur / 3600) * 150;
      if ([0, 6].includes(date.getDay())) mental += 200; // samedi/dimanche

      // Stratégie : vitesse moyenne + variété (si on a du power)
      strategy += speed * 15;
      if (power > 0) strategy += (power / 10);

      // 🎯 BONUS DE VARIÉTÉ — à placer ici
      if (dist > 100) endurance += 500;    // longues distances
      if (elev > 1500) explosivity += 400; // gros dénivelé
      if (dur > 14400) mental += 300;      // >4h de selle
    }


    // ✅ Crée l’objet XP avant de le sauvegarder
    const xp = {
      endurance: Math.round(endurance),
      explosivity: Math.round(explosivity),
      mental: Math.round(mental),
      strategy: Math.round(strategy)
    };

    // ✅ Puis sauvegarde dans Supabase
    await supabaseClient
      .from('xp')
      .upsert({
        user_id: userId,
        ...xp,
        last_update: new Date().toISOString()
      });

    // 🔁 Mise à jour du niveau global
    await updateGlobalXpAndLevel(userId, xp, activities.length);
    
    return xp;
  }

  /* --------------------- NIVEAU GLOBAL --------------------- */
  async function updateGlobalXpAndLevel(userId, xp, activitiesCount = 0) {
    // Base XP : chaque sortie rapporte un peu d'XP global
    const baseXpFromActivities = activitiesCount * 10; // 10 xp par sortie
    // Fraction des jauges (20 % du total)
    const jaugeContribution = (xp.endurance + xp.explosivity + xp.mental + xp.strategy) * 0.2;
    const gainedXp = Math.round(baseXpFromActivities + jaugeContribution);

    // Récupérer l’ancien total pour cumuler
    const { data: existing, error } = await supabaseClient
      .from('global_xp')
      .select('total_xp')
      .eq('user_id', userId)
      .maybeSingle();

    const oldTotal = existing?.total_xp || 0;
    const oldLevel = existing?.level || 1;
    const newTotal = oldTotal + gainedXp;
    const newLevel = computeGlobalLevel(newTotal);

    await supabaseClient
      .from('global_xp')
      .upsert({
        user_id: userId,
        total_xp: newTotal,
        level: newLevel,
        last_update: new Date().toISOString()
      });

    console.log(`→ XP global +${gainedXp} (${newTotal} total, niveau ${newLevel})`);

    // 🔔 Notification automatique
    if (newLevel > oldLevel) {
      Veloskill.showToast({
        type: 'success',
        title: `🎉 Niveau global ${newLevel} atteint !`,
        message: 'Bravo, ta progression générale s’accélère 🚴‍♂️'
      });
    }

    return { gainedXp, totalXp: newTotal, level: newLevel };
  }

  function computeGlobalLevel(totalXp) {
    // Progression non linéaire (façon RPG)
    return Math.floor(1 + Math.pow(totalXp / 100, 0.5));
  }

    async function fetchGlobalXp(userId) {
    const { data, error } = await supabaseClient
      .from('global_xp')
      .select('total_xp, level')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) {
      return { total_xp: 0, level: 1 };
    }

    return {
      total_xp: data.total_xp || 0,
      level: data.level || computeGlobalLevel(data.total_xp || 0)
    };
  }

  /* --------------------- RÉCUPÉRATION XP UTILISATEUR --------------------- */
  async function getOrComputeUserXp(userId) {
    // 1️⃣ Récupération de la ligne XP
    const { data, error } = await supabaseClient
      .from('xp')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    // 2️⃣ Si erreur, recalcul direct
    if (error) {
      console.warn("Erreur lecture XP :", error);
      return await calculateXpFromActivities(userId);
    }

    // 3️⃣ Si pas de ligne, recalcul direct
    if (!data) {
      console.log("Aucun XP trouvé → calcul initial");
      return await calculateXpFromActivities(userId);
    }

    // 4️⃣ Vérifie la date du dernier recalcul
    const lastUpdate = new Date(data.last_update);
    const now = new Date();
    const diffHours = (now - lastUpdate) / 1000 / 3600;

    if (diffHours > 24) {
      console.log(`Dernier calcul XP > ${Math.round(diffHours)}h → recalcul...`);
      const newXp = await calculateXpFromActivities(userId);
      Veloskill.showToast({
        type: 'info',
        title: 'Progression mise à jour',
        message: 'Tes jauges XP ont été recalculées à partir de tes dernières sorties 🚴‍♂️'
      });
      return newXp;
    }

    // 5️⃣ Sinon, renvoie simplement les valeurs existantes
    return {
      endurance: data.endurance || 0,
      explosivity: data.explosivity || 0,
      mental: data.mental || 0,
      strategy: data.strategy || 0
    };
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

      const tooltips = {
        endurance: "🌿 Endurance : influencée par la distance parcourue, la durée et les longues sorties.",
        explosivity: "⚡ Explosivité : augmente avec la puissance moyenne et le dénivelé positif.",
        mental: "🧠 Mental : progresse avec la durée totale, la régularité et les sorties longues, surtout le week-end.",
        strategy: "🎯 Stratégie : dépend de la vitesse moyenne, de la variété et de la gestion d’effort."
      };

      const card = document.createElement('div');
      card.className = 'xp-card';
      card.title = tooltips[axis.key];

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

    // 1️⃣ Si retour Strava avec ?code=...
    const params = new URLSearchParams(window.location.search);
    const stravaCode = params.get('code');

    if (stravaCode) {
      try {
        const res = await fetch(`/api/strava-token?code=${encodeURIComponent(stravaCode)}`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Erreur Strava');
        }

        const { access_token, refresh_token, expires_at, athlete } = data;

        // 2️⃣ Sauvegarde des tokens en base
        const { error } = await supabaseClient
          .from('strava_tokens')
          .upsert({
            user_id: user.id,
            access_token,
            refresh_token,
            expires_at,
            athlete_id: athlete?.id || null
          });

        if (error) throw error;

        Veloskill.showToast({
          type: 'success',
          title: 'Strava connecté',
          message: 'Tes sorties vont être synchronisées automatiquement.'
        });

        // 🔄 Recalcule et met à jour les jauges après la synchro
        const updatedXp = await calculateXpFromActivities(user.id);
        renderDashboardXp(updatedXp);
        showToast({
          type: 'info',
          title: 'Progression mise à jour',
          message: `+${Math.round(updatedXp.endurance)} XP Endurance · +${Math.round(updatedXp.explosivity)} XP Explosivité`
        });

        // 3️⃣ Nettoie l’URL
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (err) {
        console.error(err);
        Veloskill.showToast({
          type: 'error',
          title: 'Erreur Strava',
          message: 'Impossible de finaliser la connexion.'
        });
      }
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

    const stravaBtn = document.querySelector('[data-connect-strava]');
    const stravaStatus = document.querySelector('[data-strava-status]');

    // Vérifier si déjà connecté (ex: refresh_token existant)
    const tokens = await supabaseClient.from('strava_tokens').select('*').eq('user_id', user.id).maybeSingle();
    if (tokens?.data) {
      stravaStatus.textContent = '✅ Connecté à Strava';
      stravaBtn.textContent = 'Reconnecter Strava';
    }

    // Lancer OAuth Strava
    stravaBtn.addEventListener('click', () => {
      const clientId = STRAVA_CLIENT_ID; // défini globalement dans profile.html, ou remplace par ton ID numérique
      const redirectUri = encodeURIComponent(`${window.location.origin}/profile.html`);
      const scope = encodeURIComponent('read,activity:read_all');

      const url =
        `https://www.strava.com/oauth/authorize` +
        `?client_id=${clientId}` +
        `&response_type=code` +
        `&redirect_uri=${redirectUri}` +
        `&approval_prompt=auto` +
        `&scope=${scope}`;

      window.location.href = url;
    });

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
      const distance = act.distance ? act.distance.toFixed(1) : 0;
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

    const grid = document.querySelector('[data-badges-grid]');
    if (!grid) return;

    const { data, error } = await supabaseClient
      .from('v_user_badges')
      .select('*')
      .eq('user_id', user.id)
      .order('obtained_at', { ascending: false });

    if (error) {
      console.error('Erreur chargement badges:', error);
      grid.innerHTML = `<p style="text-align:center;color:#888;">Erreur de chargement.</p>`;
      return;
    }

    if (!data || !data.length) {
      grid.innerHTML = `<p style="text-align:center;color:#888;">Aucun badge débloqué pour le moment.</p>`;
      return;
    }

    grid.innerHTML = '';
    data.forEach(badge => {
      const card = document.createElement('div');
      card.className = 'badge-card';
      card.innerHTML = `
        <div class="badge-icon">${badge.icon || '🏅'}</div>
        <div class="badge-title">${badge.title}</div>
        <div class="badge-desc">${badge.description || ''}</div>
      `;
      grid.appendChild(card);
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

  // Renvoie le niveau en fonction de l'XP total (progression douce)
  function computeLevelFromXp(xp) {
    if (!xp) return 1;
    // Logarithmique + légère racine pour un ressenti RPG
    const level = Math.floor(Math.pow(xp / 1000, 0.45)) + 1;
    return Math.min(level, 100); // limite à 100 niveaux
  }

  // XP total requis pour le début d'un niveau donné
  function computeLevelBaseXp(level) {
    if (level <= 1) return 0;
    // Inverse de la fonction ci-dessus
    return Math.round(1000 * Math.pow(level - 1, 1 / 0.45));
  }

  // XP total requis pour atteindre le niveau suivant
  function computeNextLevelXp(level) {
    return Math.round(1000 * Math.pow(level, 1 / 0.45));
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

  /* --------------------- MODULE BOSS --------------------- */

  async function initBoss() {
    await updateBossProgress(user.id);
    const sessionData = await loadSessionAndProfile();
    const user = sessionData?.user;
    const profile = sessionData?.profile;
    if (!user) {
      window.location.href = 'index.html';
      return;
    }

    // 1. Récupérer le niveau global
    const global = await fetchGlobalXp(user.id);

    // 2. Charger la liste des boss actifs
    const bosses = await fetchBosses();

    // 3. Charger les tentatives de cet utilisateur
    const attempts = await fetchBossAttempts(user.id);

    // 4. Rendre la page
    renderBossList(bosses, attempts, global.level);
  }

  /* --- Requêtes Supabase --- */

  async function fetchBosses() {
    const { data, error } = await supabaseClient
      .from('bosses')
      .select('*')
      .eq('actif', true)
      .order('level_required', { ascending: true });

    if (error) {
      console.error('Erreur chargement boss:', error);
      Veloskill.showToast({
        type: 'error',
        title: 'Erreur',
        message: 'Impossible de charger la liste des Boss.'
      });
      return [];
    }
    return data;
  }

  async function fetchBossAttempts(userId) {
    const { data, error } = await supabaseClient
      .from('boss_attempts')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.warn('Pas encore de boss_attempts pour cet utilisateur.');
      return [];
    }
    return data || [];
  }

  /* --- Affichage --- */

  function renderBossList(bosses, attempts, globalLevel) {
    const list = document.querySelector('[data-boss-list]');
    if (!list) return;
    list.innerHTML = '';

    if (!bosses.length) {
      list.innerHTML = `<p style="text-align:center;color:#888;">Aucun boss actif pour le moment.</p>`;
      return;
    }

    bosses.forEach(boss => {
      const attempt = attempts.find(a => a.boss_id === boss.id);
      const score = attempt?.score || 0;
      const bestScore = attempt?.best_score || 0;
      const statut = attempt?.statut || (globalLevel < boss.level_required ? 'locked' : 'en_cours');
      const progress = Math.min(100, Math.round((score / boss.hp_target) * 100));
      const isDefeated = statut === 'reussi';

      const card = document.createElement('div');
      card.className = `boss-card ${statut}`;
      card.innerHTML = `
        <div class="boss-header">
          <div class="boss-icon">${isDefeated ? '🏆' : bossIconForType(boss.type)}</div>
          <div class="boss-info">
            <h3>${boss.nom}</h3>
            <p class="boss-cycliste">${boss.cycliste || ''}</p>
          </div>
          <div class="boss-status">
            ${statutLabel(statut, boss.level_required)}
          </div>
        </div>

        <p class="boss-desc">${boss.recompense || ''}</p>

        <div class="boss-meta">
          <span>Type : ${typeLabel(boss.type)}</span>
          <span>Niveau requis : ${boss.level_required}</span>
          <span>Objectif : ${formatTarget(boss)}</span>
        </div>

        <div class="boss-progress">
          <div class="boss-bar">
            <div class="boss-bar-fill" style="width:${progress}%"></div>
          </div>
          <div class="boss-progress-text">
            ${score}/${boss.hp_target} (${progress}%)
          </div>
        </div>
      `;

      if (statut === 'en_cours' && !isDefeated) {
        card.addEventListener('click', () => {
          Veloskill.showToast({
            type: 'info',
            title: `${boss.nom}`,
            message: `Défi en cours : ${boss.recompense || 'aucune récompense précisée'}.`
          });
        });
      }

      if (isDefeated) {
        card.addEventListener('click', () => {
          Veloskill.showToast({
            type: 'success',
            title: `${boss.nom} vaincu 🏆`,
            message: `Tu as remporté ce défi, bravo !`
          });
        });
      }

      if (statut === 'locked') {
        card.classList.add('locked');
      }

      list.appendChild(card);
    });
  }

  /* --- Helpers UI --- */

  function bossIconForType(type) {
    if (type === 'distance') return '🚴‍♂️';
    if (type === 'elevation') return '⛰️';
    if (type === 'time') return '⏱️';
    return '💀';
  }

  function typeLabel(type) {
    if (type === 'distance') return 'Distance';
    if (type === 'elevation') return 'Dénivelé';
    if (type === 'time') return 'Temps';
    return type;
  }

  function formatTarget(boss) {
    if (boss.type === 'distance') return `${boss.hp_target} km`;
    if (boss.type === 'elevation') return `${boss.hp_target} m D+`;
    if (boss.type === 'time') return `${boss.hp_target} min`;
    return boss.hp_target;
  }

  function statutLabel(statut, levelRequired) {
    switch (statut) {
      case 'reussi': return '🏆 Réussi';
      case 'echoue': return '❌ Échoué';
      case 'expire': return '⌛ Expiré';
      case 'locked': return `🔒 Niveau ${levelRequired} requis`;
      default: return '🔥 En cours';
    }
  }

  /* --------------------- MISE À JOUR DES BOSS --------------------- */

  /**
   * Met à jour la progression du joueur sur les boss actifs
   * en fonction de ses activités récentes.
   */
  async function updateBossProgress(userId) {
  const global = await fetchGlobalXp(userId);

  const { data: bosses, error: bossErr } = await supabaseClient
    .from('bosses')
    .select('*')
    .eq('actif', true);

  if (bossErr || !bosses?.length) {
    console.warn('Aucun boss actif trouvé.');
    return;
  }

  const activities = await fetchUserActivities(userId);
  if (!activities?.length) return;

  const now = new Date();

  for (const boss of bosses) {
    if (global.level < boss.level_required) continue;

    const { data: existing } = await supabaseClient
      .from('boss_attempts')
      .select('*')
      .eq('user_id', userId)
      .eq('boss_id', boss.id)
      .maybeSingle();

    // 1️⃣ Calcul du score selon le type
    let score = 0;
    if (boss.type === 'distance') {
      score = activities.reduce((sum, a) => sum + (a.distance || 0), 0);
    } else if (boss.type === 'elevation') {
      score = activities.reduce((sum, a) => sum + (a.elevation || 0), 0);
    } else if (boss.type === 'time') {
      score = activities.reduce((sum, a) => sum + (a.duration || 0) / 60, 0); // s → min
    }

    // 2️⃣ Statut
    let newStatut = existing?.statut || 'en_cours';

    // Boss event avec dates → expire possible
    const hasTimeLimit = boss.start_at && boss.end_at;
    if (hasTimeLimit) {
      const start = new Date(boss.start_at);
      const end = new Date(boss.end_at);
      if (now < start && newStatut !== 'reussi') newStatut = 'en_cours';
      if (now > end && newStatut !== 'reussi') newStatut = 'expire';
    }

    // Condition de réussite
    if (score >= boss.hp_target) {
      newStatut = 'reussi';
    }

    const bestScore = existing?.best_score
      ? Math.max(existing.best_score, score)
      : score;

    const payload = {
      user_id: userId,
      boss_id: boss.id,
      score,
      best_score: bestScore,
      statut: newStatut,
      updated_at: new Date().toISOString(),
      details_json: {
        type: boss.type,
        computed_at: new Date().toISOString()
      }
    };

    const previousStatut = existing?.statut;

    const { error: upErr } = await supabaseClient
      .from('boss_attempts')
      .upsert(payload, { onConflict: 'user_id,boss_id' });

    if (upErr) {
      console.error('Erreur updateBossProgress:', upErr);
      continue;
    }

    // 3️⃣ Réactions aux transitions

    // Passage à reussi : on applique VRAIMENT les récompenses
    if (newStatut === 'reussi' && previousStatut !== 'reussi') {
      Veloskill.showToast({
        type: 'success',
        title: `🏆 ${boss.nom} vaincu !`,
        message: `Tu as terminé le défi inspiré de ${boss.cycliste || boss.nom}.`
      });
      await applyBossRewards(userId, boss);
    }

    // Passage à expire (uniquement pour boss event)
    if (newStatut === 'expire' && previousStatut !== 'expire') {
      Veloskill.showToast({
        type: 'info',
        title: `⌛ ${boss.nom} expiré`,
        message: `L’événement est terminé. Tu pourras retenter un prochain défi spécial.`
      });
    }
  }
}

  /* --------------------- RÉCOMPENSES BOSS --------------------- */

  /**
   * Applique les récompenses d'un boss fraichement vaincu :
   * - Bonus d'XP global (si présent dans boss.recompense : ex "+1000 XP")
   * - Badge unique lié au boss
   */
  async function applyBossRewards(userId, boss) {
    try {
      await applyBossXpReward(userId, boss);
      await awardBossBadgeIfNeeded(userId, boss);
    } catch (e) {
      console.error('Erreur applyBossRewards:', e);
    }
  }

  /**
   * Cherche un pattern du type "+1000 XP" dans bosses.recompense
   * et l'ajoute réellement à global_xp.
   */
  async function applyBossXpReward(userId, boss) {
    if (!boss.recompense) return;

    const match = boss.recompense.match(/\+(\d+)\s*XP/i);
    if (!match) return;

    const bonus = parseInt(match[1], 10);
    if (!bonus || bonus <= 0) return;

    // Récupère l'existant
    const { data: existing, error } = await supabaseClient
      .from('global_xp')
      .select('total_xp, level')
      .eq('user_id', userId)
      .maybeSingle();

    const oldTotal = existing?.total_xp || 0;
    const newTotal = oldTotal + bonus;
    const newLevel = computeGlobalLevel(newTotal);

    const { error: upErr } = await supabaseClient
      .from('global_xp')
      .upsert({
        user_id: userId,
        total_xp: newTotal,
        level: newLevel,
        last_update: new Date().toISOString()
      });

    if (upErr) {
      console.error('Erreur upsert global_xp bonus boss:', upErr);
      return;
    }

    Veloskill.showToast({
      type: 'success',
      title: `Récompense boss`,
      message: `+${bonus} XP global grâce à ${boss.nom} 🏆`
    });
  }

  /**
   * Crée un badge lié à la défaite d'un boss si non déjà présent.
   * Hypothèse : table "user_badges" utilisée par fetchUserBadges.
   */
  async function awardBossBadgeIfNeeded(userId, boss) {
  if (!boss.slug) {
    console.warn('Boss sans slug, impossible de générer un badge.', boss);
    return;
  }

  const badgeSlug = `boss-${boss.slug}`;
  const badgeTitle = `Boss vaincu : ${boss.nom}`;
  const badgeDesc = `Tu as vaincu le boss inspiré de ${boss.cycliste || boss.nom}.`;

  // 1️⃣ Vérifie ou crée le badge global
  const { data: existingBadge, error: badgeErr } = await supabaseClient
    .from('badges')
    .select('id')
    .eq('slug', badgeSlug)
    .maybeSingle();

  let badgeId = existingBadge?.id;

  if (!badgeId) {
    const { data: created, error: createErr } = await supabaseClient
      .from('badges')
      .insert({
        slug: badgeSlug,
        title: badgeTitle,
        description: badgeDesc,
        icon: '🏆',
        type: 'boss'
      })
      .select('id')
      .single();

    if (createErr) {
      console.error('Erreur création badge global:', createErr);
      return;
    }

    badgeId = created.id;
  }

  // 2️⃣ Vérifie si l'utilisateur l'a déjà
  const { data: existingUserBadge, error: userBadgeErr } = await supabaseClient
    .from('user_badges')
    .select('id')
    .eq('user_id', userId)
    .eq('badge_id', badgeId)
    .maybeSingle();

  if (existingUserBadge) return; // déjà obtenu

  // 3️⃣ Associe le badge à l'utilisateur
  const { error: insertErr } = await supabaseClient
    .from('user_badges')
    .insert({
      user_id: userId,
      badge_id: badgeId
    });

  if (insertErr) {
    console.error('Erreur création badge utilisateur:', insertErr);
    return;
  }

  Veloskill.showToast({
    type: 'success',
    title: '🏅 Nouveau badge débloqué',
    message: badgeTitle
  });
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
        await initBoss();
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

  // On expose quelques fonctions utiles pour le debug
  return {
    showToast,
    calculateXpFromActivities,
    getOrComputeUserXp
  };
})();

