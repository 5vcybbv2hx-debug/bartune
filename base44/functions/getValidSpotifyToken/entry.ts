import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const settings = await base44.asServiceRole.entities.AppSettings.list();
    if (settings.length === 0 || !settings[0].spotify_access_token) {
      return Response.json({ error: 'Not connected to Spotify', needs_reauth: true }, { status: 400 });
    }

    const s = settings[0];
    let accessToken = s.spotify_access_token;
    const expiresAt = new Date(s.spotify_token_expires_at).getTime();
    const now = Date.now();
    const fiveMin = 5 * 60 * 1000;

    if (expiresAt < now + fiveMin) {
      const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
      const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
      const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: s.spotify_refresh_token,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });
      const tokens = await tokenResponse.json();
      if (tokens.error) {
        return Response.json({ error: 'Token refresh failed: ' + tokens.error, needs_reauth: true }, { status: 401 });
      }

      const newExpiresAt = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();
      await base44.asServiceRole.entities.AppSettings.update(s.id, {
        spotify_access_token: tokens.access_token,
        spotify_token_expires_at: newExpiresAt,
      });
      accessToken = tokens.access_token;
      s.spotify_access_token = tokens.access_token;
      s.spotify_token_expires_at = newExpiresAt;
    }

    return Response.json({
      access_token: accessToken,
      settings_id: s.id,
      settings: s,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});