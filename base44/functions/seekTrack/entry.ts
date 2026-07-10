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
    return tokens.access_token;
  }
  return s.spotify_access_token;
}

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

    const token = await ensureValidToken(base44);
    const response = await fetch(
      `https://api.spotify.com/v1/me/player/seek?position_ms=${Math.floor(position_ms)}`,
      { method: 'PUT', headers: { Authorization: `Bearer ${token}` } }
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