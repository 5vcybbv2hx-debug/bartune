import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function ensureValidToken(base44) {
  const settings = await base44.asServiceRole.entities.AppSettings.list();
  if (settings.length === 0 || !settings[0].spotify_access_token) throw new Error('Not connected to Spotify');
  const s = settings[0];
  const expiresAt = new Date(s.spotify_token_expires_at).getTime();
  if (expiresAt < Date.now() + 5 * 60 * 1000) {
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
    if (tokens.error) throw new Error('Token refresh failed: ' + tokens.error);
    const newExpiresAt = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();
    await base44.asServiceRole.entities.AppSettings.update(s.id, {
      spotify_access_token: tokens.access_token,
      spotify_token_expires_at: newExpiresAt,
    });
    return { token: tokens.access_token, settingsId: s.id };
  }
  return { token: s.spotify_access_token, settingsId: s.id };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { seconds } = body;

    if (typeof seconds !== 'number' || seconds < 0 || seconds > 12) {
      return Response.json({ error: 'seconds must be 0-12' }, { status: 400 });
    }

    const { token, settingsId } = await ensureValidToken(base44);
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    // Store crossfade value in AppSettings
    await base44.asServiceRole.entities.AppSettings.update(settingsId, {
      crossfade_seconds: seconds,
    });

    // Attempt to set crossfade via Spotify API
    // Note: Spotify Web API crossfade support varies by device/client
    try {
      await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          crossfade_state: seconds > 0,
          crossfade_duration_ms: seconds * 1000,
        }),
      });
    } catch (e) {
      // Crossfade setting stored regardless — device may not support API control
    }

    return Response.json({ success: true, crossfade_seconds: seconds });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});