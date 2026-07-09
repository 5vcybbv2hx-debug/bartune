import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
    if (!clientId) return Response.json({ error: 'SPOTIFY_CLIENT_ID not set' }, { status: 500 });

    const origin = req.headers.get("origin") || `https://${req.headers.get("host")}`;
    const redirectUri = `${origin}/spotify-callback`;

    const scopes = [
      'playlist-read-private',
      'playlist-read-collaborative',
      'user-read-playback-state',
      'user-modify-playback-state',
      'user-read-currently-playing',
      'playlist-modify-private'
    ].join(' ');

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: scopes,
    });

    const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;
    return Response.json({ authUrl, redirectUri });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});