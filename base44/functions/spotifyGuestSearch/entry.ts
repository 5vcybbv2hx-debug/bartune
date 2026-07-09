import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function getValidToken(base44) {
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
    if (tokens.error) throw new Error('Token refresh failed');
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

    const body = await req.json();
    const { query } = body;
    if (!query) return Response.json({ error: 'Missing query' }, { status: 400 });

    const token = await getValidToken(base44);
    const q = encodeURIComponent(query);
    const response = await fetch(`https://api.spotify.com/v1/search?q=${q}&type=track&limit=5`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) {
      const err = await response.text();
      return Response.json({ error: err }, { status: response.status });
    }

    const data = await response.json();
    const tracks = (data.tracks?.items || []).map(t => ({
      id: t.id,
      name: t.name,
      artists: t.artists.map(a => a.name).join(', '),
      cover: t.album?.images?.[0]?.url || null,
      duration_ms: t.duration_ms,
    }));

    return Response.json({ tracks });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});