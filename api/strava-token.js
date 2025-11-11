export default async function handler(req, res) {
  const { code } = req.query;
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  const redirectUri = `${req.headers.origin}/profile.html`;

  try {
    const response = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
      }),
    });

    const data = await response.json();
    res.status(response.ok ? 200 : 400).json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to connect to Strava" });
  }
}
