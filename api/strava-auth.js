export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  try {
    const { code } = req.body;

    const response = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: "178503",
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
      }),
    });

    const data = await response.json();
    console.log("STRAVA RESPONSE:", data);

    if (data.access_token) {
      res.status(200).json(data);
    } else {
      res.status(400).json({ error: "Échec échange token", details: data });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
