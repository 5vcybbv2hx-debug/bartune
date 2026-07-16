import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { position_ms } = body;

    if (typeof position_ms !== 'number' || position_ms < 0) {
      return Response.json({ error: 'position_ms must be a non-negative number' }, { status: 400 });
    }

    const settingsList = await base44.asServiceRole.entities.AppSettings.list();
    if (!settingsList.length || !settingsList[0].spotify_access_token) {
      return Response.json({ error: 'Not connected to Spotify' }, { status: 400 });
    }
    const s = settingsList[0];
    let accessToken = s.spotify_access_token;
    const expiresAt = new Date(s.spotify_token_expires_at).getTime();
    if (Date.now() >= expiresAt - 300000) {
      try {
        const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
        const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
        const credentials = btoa(`${clientId}:${clientSecret}`);
        const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `grant_type=refresh_token&refresh_token=${s.spotify_refresh_token}`,
        });
        const tokens = await tokenResponse.json();
        if (tokens.access_token) {
          accessToken = tokens.access_token;
          const updateData = { spotify_access_token: tokens.access_token, spotify_token_expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString() };
          if (tokens.refresh_token) updateData.spotify_refresh_token = tokens.refresh_token;
          await base44.asServiceRole.entities.AppSettings.update(s.id, updateData);
        }
      } catch (e) {}
    }
    const response = await fetch(
      `https://api.spotify.com/v1/me/player/seek?position_ms=${Math.floor(position_ms)}`,
      { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (response.ok) return Response.json({ success: true });

    const errText = await response.text();
    // 404 / 403 = no active device
    if (response.status === 404 || response.status === 403) {
      return Response.json({ success: false, noDevice: true });
    }
    return Response.json({ success: false, error: errText, status: response.status });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});