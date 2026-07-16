import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, params = {} } = body;

    // Get token directly from AppSettings instead of function-to-function call
    const settings = await base44.asServiceRole.entities.AppSettings.list();
    if (!settings.length || !settings[0].spotify_access_token) {
      return Response.json({ error: 'Not connected to Spotify', needs_reauth: true }, { status: 400 });
    }

    let s = settings[0];
    let accessToken = s.spotify_access_token;
    const expiresAt = new Date(s.spotify_token_expires_at).getTime();
    const now = Date.now();

    // Auto-refresh if expired (5 min buffer)
    if (now >= expiresAt - 300000) {
      try {
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
        if (tokens.access_token) {
          accessToken = tokens.access_token;
          const updateData = {
            spotify_access_token: tokens.access_token,
            spotify_token_expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
          };
          if (tokens.refresh_token) {
            updateData.spotify_refresh_token = tokens.refresh_token;
          }
          await base44.asServiceRole.entities.AppSettings.update(s.id, updateData);
        }
      } catch (e) {
        // If refresh fails, try the existing token anyway
      }
    }

    const headers = { 'Authorization': `Bearer ${accessToken}` };

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
      case 'getTrack':
        url = `https://api.spotify.com/v1/tracks/${params.track_id}`;
        method = 'GET';
        break;
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

    if (response.status === 204) return Response.json({ success: true });
    if (!response.ok) {
      const err = await response.text();
      return Response.json({ error: err, status: response.status, _notOk: true });
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});