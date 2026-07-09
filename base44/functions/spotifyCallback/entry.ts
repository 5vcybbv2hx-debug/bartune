import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { code } = body;
    if (!code) return Response.json({ error: 'Missing code' }, { status: 400 });

    const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
    const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
    if (!clientId || !clientSecret) return Response.json({ error: 'Spotify credentials not set' }, { status: 500 });

    const origin = req.headers.get("origin") || `https://${req.headers.get("host")}`;
    const redirectUri = `${origin}/spotify-callback`;

    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    const tokens = await tokenResponse.json();
    if (tokens.error) return Response.json({ error: tokens.error_description || tokens.error }, { status: 400 });

    // Get user profile for display name
    const profileResponse = await fetch('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` },
    });
    const profile = await profileResponse.json();

    const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();

    // Store tokens in AppSettings (service role - not exposed to frontend)
    const settings = await base44.asServiceRole.entities.AppSettings.list();
    if (settings.length > 0) {
      await base44.asServiceRole.entities.AppSettings.update(settings[0].id, {
        spotify_access_token: tokens.access_token,
        spotify_refresh_token: tokens.refresh_token,
        spotify_token_expires_at: expiresAt,
        spotify_user_name: profile.display_name || profile.id,
      });
    } else {
      await base44.asServiceRole.entities.AppSettings.create({
        spotify_access_token: tokens.access_token,
        spotify_refresh_token: tokens.refresh_token,
        spotify_token_expires_at: expiresAt,
        spotify_user_name: profile.display_name || profile.id,
        wunschzettel_active: false,
        rotation_block_hours: 24,
      });
    }

    return Response.json({ success: true, userName: profile.display_name || profile.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});