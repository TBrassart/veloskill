// supabase.js
// Gère la connexion Supabase + helpers simples.
// À inclure AVANT main.js dans chaque page qui en a besoin.

const SUPABASE_URL = 'https://ztylpjgvxibfgtpkdjpo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0eWxwamd2eGliZmd0cGtkanBvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjcwMDQ2MSwiZXhwIjoyMDc4Mjc2NDYxfQ.oP3lJi7QPTV8Xq_WiSpx81hVs02C_Uxigu9GpU2OGzQ'; // met ça dans un .env en prod si possible

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    detectSessionInUrl: true
  }
});

// ---- AUTH ----

// Connexion via Strava (provider custom déclaré côté Supabase)
async function signInWithGoogle() {
  const { data, error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/dashboard.html'
    }
  });
  if (error) throw error;
  return data;
}

async function signOut() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) throw error;
}

// Récupération session + user
async function getSession() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;
  return data.session || null;
}

async function getCurrentUser() {
  const session = await getSession();
  return session?.user || null;
}

// ---- DATA HELPERS MINIMAUX ----

// Profil utilisateur
async function fetchUserProfile(userId) {
  if (!userId) return null;
  const { data, error } = await supabaseClient
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) {
    console.error('fetchUserProfile error', error);
    return null;
  }
  return data;
}

async function updateUserProfile(userId, updates) {
  const { data, error } = await supabaseClient
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    console.error('updateUserProfile error', error);
    throw error;
  }
  return data;
}

// XP par axe
async function fetchUserXp(userId) {
  if (!userId) return null;
  const { data, error } = await supabaseClient
    .from('xp')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error) {
    console.error('fetchUserXp error', error);
    return null;
  }
  return data;
}

// Boss actifs
async function fetchActiveBosses() {
  const { data, error } = await supabaseClient
    .from('bosses')
    .select('*')
    .eq('actif', true);
  if (error) {
    console.error('fetchActiveBosses error', error);
    return [];
  }
  return data || [];
}

// Tentatives / statut boss pour un user
async function fetchUserBossAttempts(userId) {
  if (!userId) return [];
  const { data, error } = await supabaseClient
    .from('boss_attempts')
    .select('*')
    .eq('user_id', userId);
  if (error) {
    console.error('fetchUserBossAttempts error', error);
    return [];
  }
  return data || [];
}

// Skills
async function fetchAllSkills() {
  const { data, error } = await supabaseClient
    .from('skills')
    .select('*')
    .order('depth', { ascending: true });

  if (error) {
    console.error('fetchAllSkills error', error);
    return [];
  }
  return data || [];
}

async function fetchSkillById(skillId) {
  const { data, error } = await supabaseClient
    .from('skills')
    .select('*')
    .eq('id', skillId)
    .single();

  if (error) {
    console.error('fetchSkillById error', error);
    return null;
  }
  return data;
}

// Unlocks utilisateur
async function fetchUserUnlocks(userId) {
  if (!userId) return [];
  const { data, error } = await supabaseClient
    .from('unlocks')
    .select('skill_id')
    .eq('user_id', userId);
  if (error) {
    console.error('fetchUserUnlocks error', error);
    return [];
  }
  return data.map(d => d.skill_id);
}
