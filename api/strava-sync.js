import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  try {
    const { user_id, access_token } = req.body;
    if (!user_id || !access_token) {
      return res.status(400).json({ error: "Missing user_id or access_token" });
    }

    // 1️⃣ Cherche la date de la dernière activité déjà enregistrée
    const { data: lastActivity, error: lastError } = await supabase
      .from("activities")
      .select("date")
      .eq("user_id", user_id)
      .order("date", { ascending: false })
      .limit(1)
      .single();

    let afterParam = "";
    if (lastActivity && lastActivity.date) {
      const lastTimestamp = Math.floor(new Date(lastActivity.date).getTime() / 1000);
      afterParam = `?after=${lastTimestamp}`;
      console.log("⏱️ Synchronisation à partir du:", lastActivity.date);
    } else {
      console.log("🌍 Première synchro : récupération de toutes les activités récentes");
    }

    // 2️⃣ Récupère uniquement les activités plus récentes
    const stravaRes = await fetch(
      `https://www.strava.com/api/v3/athlete/activities${afterParam}&per_page=50`,
      {
        headers: { Authorization: `Bearer ${access_token}` },
      }
    );

    const activities = await stravaRes.json();
    if (!Array.isArray(activities)) {
      console.error("Réponse Strava inattendue:", activities);
      return res.status(400).json({ error: "Invalid Strava response" });
    }

    let imported = 0;
    for (const a of activities) {
      // Insère uniquement si non existante
      const { data: existing } = await supabase
        .from("activities")
        .select("id")
        .eq("id", a.id)
        .eq("user_id", user_id)
        .maybeSingle();

      if (!existing) {
        const { error } = await supabase.from("activities").insert({
          id: a.id,
          user_id,
          date: a.start_date,
          distance: a.distance ? a.distance / 1000 : null,
          elevation: a.total_elevation_gain ?? null,
          avg_power: a.average_watts ?? null,
          max_power: a.max_watts ?? null,
          duration: a.moving_time ?? null,
          location: a.location_city || null,
          type: a.type || "Ride",
        });

        if (!error) imported++;
        else console.error("Erreur insertion:", error);
      }
    }

    res.status(200).json({
      success: true,
      imported,
      message: `✅ ${imported} nouvelles activités importées`,
    });
  } catch (err) {
    console.error("Erreur synchro Strava:", err);
    res.status(500).json({ error: err.message });
  }
}
