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

    // Token still valid? (5 min buffer)
    if (now >= expiresAt - 300000) {
      const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
      const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
      const credentials = btoa(`${clientId}:${clientSecret}`);

      const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `grant_type=refresh_token&refresh_token=${s.spotify_refresh_token}`,
      });
      const tokens = await tokenResponse.json();
      if (!tokens.access_token) {
        return Response.json({ error: 'Token refresh failed: ' + JSON.stringify(tokens), needs_reauth: true }, { status: 401 });
      }

      const expiresIn = tokens.expires_in || 3600;
      const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
      const updateData = {
        spotify_access_token: tokens.access_token,
        spotify_token_expires_at: newExpiresAt,
      };
      if (tokens.refresh_token) {
        updateData.spotify_refresh_token = tokens.refresh_token;
      }
      await base44.asServiceRole.entities.AppSettings.update(s.id, updateData);

      accessToken = tokens.access_token;
      s.spotify_access_token = tokens.access_token;
      s.spotify_token_expires_at = newExpiresAt;
      if (tokens.refresh_token) s.spotify_refresh_token = tokens.refresh_token;
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