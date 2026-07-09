import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function ensureValidToken(base44) {
  const settings = await base44.asServiceRole.entities.AppSettings.list();
  if (settings.length === 0) throw new Error('Not connected to Spotify');
  const s = settings[0];
  if (!s.spotify_access_token) throw new Error('Not connected to Spotify');

  const expiresAt = new Date(s.spotify_token_expires_at).getTime();
  const now = Date.now();
  const fiveMin = 5 * 60 * 1000;

  if (expiresAt < now + fiveMin) {
    // Refresh token
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
    return { token: tokens.access_token, settings: s };
  }

  return { token: s.spotify_access_token, settings: s };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, params = {} } = body;

    const { token, settings } = await ensureValidToken(base44);
    const headers = { 'Authorization': `Bearer ${token}` };

    let url, method, reqBody;

    switch (action) {
      case 'getPlaylists':
        url = 'https://api.spotify.com/v1/me/playlists?limit=50';
        method = 'GET';
        break;
      case 'getPlaybackState':
        url = 'https://api.spotify.com/v1/me/player';
        method = 'GET';
        break;
      case 'play':
        url = 'https://api.spotify.com/v1/me/player/play';
        method = 'PUT';
        reqBody = params.context_uri ? { context_uri: params.context_uri } : {};
        break;
      case 'pause':
        url = 'https://api.spotify.com/v1/me/player/pause';
        method = 'PUT';
        break;
      case 'next':
        url = 'https://api.spotify.com/v1/me/player/next';
        method = 'POST';
        break;
      case 'previous':
        url = 'https://api.spotify.com/v1/me/player/previous';
        method = 'POST';
        break;
      case 'setVolume':
        url = `https://api.spotify.com/v1/me/player/volume?volume_percent=${params.volume_percent}`;
        method = 'PUT';
        break;
      case 'searchTracks': {
        const q = encodeURIComponent(params.query);
        const limit = params.limit || 5;
        url = `https://api.spotify.com/v1/search?q=${q}&type=track&limit=${limit}`;
        method = 'GET';
        break;
      }
      case 'getAudioFeatures':
        url = `https://api.spotify.com/v1/audio-features/${params.track_id}`;
        method = 'GET';
        break;
      case 'addToQueue':
        url = `https://api.spotify.com/v1/me/player/queue?uri=spotify:track:${params.track_id}`;
        method = 'POST';
        break;
      case 'addToPlaylist':
        url = `https://api.spotify.com/v1/playlists/${params.playlist_id}/tracks`;
        method = 'POST';
        reqBody = { uris: [`spotify:track:${params.track_id}`] };
        break;
      case 'getActiveDevice':
        url = 'https://api.spotify.com/v1/me/player/devices';
        method = 'GET';
        break;
      default:
        return Response.json({ error: 'Unknown action: ' + action }, { status: 400 });
    }

    const fetchOpts = { method, headers };
    if (method === 'PUT' || method === 'POST') {
      if (reqBody !== undefined) {
        fetchOpts.headers = { ...headers, 'Content-Type': 'application/json' };
        fetchOpts.body = JSON.stringify(reqBody);
      }
    }

    const response = await fetch(url, fetchOpts);

    // 204 = success for PUT/POST with no content
    if (response.status === 204) return Response.json({ success: true });
    if (!response.ok) {
      const err = await response.text();
      return Response.json({ error: err, status: response.status }, { status: response.status });
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});