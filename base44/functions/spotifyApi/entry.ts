import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, params = {} } = body;

    const tokenRes = await base44.functions.invoke('getValidSpotifyToken', {});
    const token = tokenRes.data?.access_token;
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

    // 204 = success for PUT/POST with no content
    if (response.status === 204) return Response.json({ success: true });
    if (!response.ok) {
      const err = await response.text();
      // Return 200 with error info to avoid platform converting non-2xx to 500
      // Frontend handles gracefully via optional chaining / catch blocks
      return Response.json({ error: err, status: response.status, _notOk: true });
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});