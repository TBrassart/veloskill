// @ts-nocheck
// supabase/functions/sync_strava/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRAVA_API = "https://www.strava.com/api/v3";

const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";

// ⚠️ À configurer dans les variables d'env du projet Supabase
const STRAVA_CLIENT_ID = Deno.env.get("STRAVA_CLIENT_ID")!;
const STRAVA_CLIENT_SECRET = Deno.env.get("STRAVA_CLIENT_SECRET")!;

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabaseClient = createClient(supabaseUrl, serviceRoleKey);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Rafraîchit le token Strava si besoin, sinon renvoie le token actuel
async function getValidStravaAccessTokenForUser(tokenRow: any) {
  const now = new Date();
  const expiresAt = tokenRow.expires_at ? new Date(tokenRow.expires_at) : null;

  // Token encore valide
  if (expiresAt && expiresAt > now && tokenRow.access_token) {
    return tokenRow.access_token as string;
  }

  // Sinon → refresh via refresh_token
  if (!tokenRow.refresh_token) {
    console.warn("Pas de refresh_token pour user_id =", tokenRow.user_id);
    return null;
  }

  try {
    const res = await fetch(STRAVA_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: tokenRow.refresh_token,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.access_token) {
      console.error("Échec du refresh Strava:", data);
      return null;
    }

    const newAccess = data.access_token;
    const newRefresh = data.refresh_token || tokenRow.refresh_token;
    const newExpiresAt = data.expires_at
      ? new Date(data.expires_at * 1000).toISOString()
      : tokenRow.expires_at;

    // Mise à jour en base
    const { error: updateErr } = await supabaseClient
      .from("strava_tokens")
      .update({
        access_token: newAccess,
        refresh_token: newRefresh,
        expires_at: newExpiresAt,
      })
      .eq("user_id", tokenRow.user_id);

    if (updateErr) {
      console.error("Erreur update strava_tokens:", updateErr);
    }

    return newAccess as string;
  } catch (err) {
    console.error("Erreur lors du refresh Strava:", err);
    return null;
  }
}

// Synchronise les activités pour un utilisateur donné (adaptation de ton syncStravaActivities)
async function syncStravaActivitiesForUser(tokenRow: any) {
  const userId = tokenRow.user_id as string;

  console.log(`🔁 Sync Strava pour user ${userId}`);

  // 1️⃣ Récupération / refresh du token
  let token = await getValidStravaAccessTokenForUser(tokenRow);
  if (!token) {
    console.warn("Aucun token Strava valide pour user", userId);
    return;
  }

  // 2️⃣ Déterminer le mode : première synchro ou incrémentale
  let sinceParam = "";
  let isFirstSync = false;

  if (!tokenRow.initial_sync_done) {
    console.log("🚀 Première synchronisation : import complet de l’historique Strava");
    isFirstSync = true;
  } else if (tokenRow.last_full_sync) {
    const lastSync = Math.floor(new Date(tokenRow.last_full_sync).getTime() / 1000);
    sinceParam = `&after=${lastSync}`;
    console.log(`⏱️ Import des nouvelles activités depuis ${tokenRow.last_full_sync}`);
  }

  // 3️⃣ Récupère les IDs déjà connus pour éviter les doublons d’activités
  const { data: existing, error: existingErr } = await supabaseClient
    .from("activities")
    .select("id_strava")
    .eq("user_id", userId);

  if (existingErr) {
    console.error("Erreur lecture activities existantes:", existingErr);
  }

  const existingIds = new Set((existing || []).map((a: any) => a.id_strava));

  // 4️⃣ Boucle sur toutes les pages Strava
  let page = 1;
  let totalImported = 0;
  let stop = false;

  while (!stop) {
    const res = await fetch(
      `${STRAVA_API}/athlete/activities?page=${page}&per_page=50${sinceParam}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (res.status === 429) {
      console.warn("🚨 Limite API Strava atteinte. On stoppe pour ce run.");
      // On arrête pour ce user, la prochaine exécution du cron reprendra
      break;
    }

    if (res.status === 401) {
      console.error("⛔ Erreur 401 Strava (token invalide ou expiré) pour user", userId);
      // On arrête pour ce user, le prochain cron tentera à nouveau
      break;
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;

    console.log(`📦 Page ${page} : ${data.length} activités récupérées pour user ${userId}.`);

    for (const act of data) {
      const isNew = !existingIds.has(act.id);
      if (!isNew) continue;
      existingIds.add(act.id);

      try {
        // Détails activité (avec les segments)
        const detailsRes = await fetch(
          `${STRAVA_API}/activities/${act.id}?include_all_efforts=true`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const details = await detailsRes.json();

        // 5️⃣ Streams GPS
        let streams: any = {};
        try {
          const streamRes = await fetch(
            `${STRAVA_API}/activities/${act.id}/streams?keys=latlng,altitude,watts,heartrate,cadence,distance,time&key_by_type=true`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (streamRes.ok) streams = await streamRes.json();
        } catch (err) {
          console.warn(`⚠️ Erreur récupération streams ${act.id}:`, err);
        }

        // 6️⃣ Insertion / upsert de l’activité principale
        const { error: actError } = await supabaseClient.from("activities").upsert({
          id_strava: act.id,
          user_id: userId,
          name: act.name,
          sport_type: act.sport_type,
          start_date: act.start_date_local,
          distance_km: act.distance / 1000,
          elevation_m: act.total_elevation_gain,
          moving_time_s: act.moving_time,
          avg_speed_kmh: act.average_speed ? act.average_speed * 3.6 : null,
          avg_watts: act.average_watts,
          avg_hr: act.average_heartrate,
          avg_cadence: act.average_cadence,
          summary_polyline: act.map?.summary_polyline || null,
          trainer: act.trainer,
          manual: act.manual,
          device_name: act.device_name || details.device_name || null,
          calories: act.kilojoules || null,
        });

        if (actError) {
          console.error("❌ Erreur insertion activité:", actError);
          continue;
        }

        // 7️⃣ Insertion des streams (échantillonnage léger)
        if (streams.latlng?.data?.length) {
          const points = streams.latlng.data.map((pt: any, i: number) => ({
            activity_id: act.id,
            lat: pt[0],
            lng: pt[1],
            altitude: streams.altitude?.data?.[i] ?? null,
            watts: streams.watts?.data?.[i] ?? null,
            hr: streams.heartrate?.data?.[i] ?? null,
            cadence: streams.cadence?.data?.[i] ?? null,
            distance_m: streams.distance?.data?.[i] ?? null,
            time_s: streams.time?.data?.[i] ?? null,
          }));

          const reduced = points.filter((_: any, i: number) => i % 5 === 0);
          const { error: streamError } = await supabaseClient
            .from("streams")
            .insert(reduced);
          if (streamError) {
            console.error("⚠️ Erreur insertion streams:", streamError);
          }
        }

        // 8️⃣ Insertion / upsert des segments (avec user_id + déduplication)
        const { segment_efforts } = details;
        if (Array.isArray(segment_efforts) && segment_efforts.length > 0) {
          const bestBySegment = new Map<string, any>();

          for (const effort of segment_efforts) {
            const seg = effort.segment;
            if (!seg) continue;
            const key = String(seg.id);
            const elapsed = effort.elapsed_time || null;

            const current = bestBySegment.get(key);
            if (!current || (elapsed && elapsed < current.elapsed_time)) {
              bestBySegment.set(key, {
                user_id: userId,
                activity_id: act.id,
                segment_id: seg.id,
                name: seg.name,
                distance_m: seg.distance,
                average_grade: seg.average_grade,
                start_lat: seg.start_latlng ? seg.start_latlng[0] : null,
                start_lng: seg.start_latlng ? seg.start_latlng[1] : null,
                end_lat: seg.end_latlng ? seg.end_latlng[0] : null,
                end_lng: seg.end_latlng ? seg.end_latlng[1] : null,
                elapsed_time: elapsed,
              });
            }
          }

          const segData = Array.from(bestBySegment.values());
          if (segData.length > 0) {
            const { error: segError } = await supabaseClient
              .from("segments")
              .upsert(segData, {
                onConflict: "user_id,activity_id,segment_id",
              });

            if (segError) {
              console.error("⚠️ Erreur insertion segments:", segError);
            }
          }
        }

        totalImported++;
        if (totalImported % 10 === 0) {
          console.log(`✅ ${totalImported} nouvelles activités importées jusque-là pour user ${userId}...`);
        }

        // Petite pause pour limiter les appels Strava
        await sleep(350);
      } catch (err) {
        console.error(`🚨 Erreur sur activité ${act.id} pour user ${userId}:`, err);
      }
    }

    if (data.length < 50) {
      stop = true; // dernière page
    }
    page++;
  }

  // 9️⃣ Mise à jour de l’état de synchro
  const nowIso = new Date().toISOString();
  const { error: updateErr } = await supabaseClient
    .from("strava_tokens")
    .update({
      initial_sync_done: true,
      last_full_sync: nowIso,
    })
    .eq("user_id", userId);

  if (updateErr) {
    console.error("Erreur mise à jour strava_tokens:", updateErr);
  }

  console.log(`🎉 Import Strava terminé pour user ${userId} : ${totalImported} nouvelles activités.`);
}

// Handler principal : boucle sur tous les utilisateurs Strava connectés
serve(async (_req: Request) => {
  try {
    const { data: tokenRows, error } = await supabaseClient
      .from("strava_tokens")
      .select("*");

    if (error) {
      console.error("Erreur lecture strava_tokens:", error);
      return new Response("Error reading strava_tokens", { status: 500 });
    }

    if (!tokenRows || tokenRows.length === 0) {
      console.log("Aucun utilisateur Strava connecté.");
      return new Response("No users to sync", { status: 200 });
    }

    for (const row of tokenRows) {
      try {
        await syncStravaActivitiesForUser(row);
      } catch (e) {
        console.error("Erreur sync user", row.user_id, e);
      }
    }

    return new Response("Sync done", { status: 200 });
  } catch (e) {
    console.error("Erreur globale sync_strava:", e);
    return new Response("Internal error", { status: 500 });
  }
});
