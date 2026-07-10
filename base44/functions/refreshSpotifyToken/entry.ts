import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const settings = await base44.asServiceRole.entities.AppSettings.list();
    if (settings.length === 0 || !settings[0].spotify_refresh_token) {
      return Response.json({ error: 'Not connected to Spotify' }, { status: 400 });
    }

    const s = settings[0];

    // Always refresh — this is called by the scheduled workflow every 45 minutes
    const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
    const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
    const credentials = btoa(`${clientId}:${clientSecret}`);

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `grant_type=refresh_token&refresh_token=${s.spotify_refresh_token}`,
    });

    const data = await response.json();
    if (!data.access_token) {
      return Response.json({ error: 'Refresh failed', detail: data }, { status: 500 });
    }

    const expiresIn = data.expires_in || 3600;
    const updateData = {
      spotify_access_token: data.access_token,
      spotify_token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
    if (data.refresh_token) {
      updateData.spotify_refresh_token = data.refresh_token;
    }

    await base44.asServiceRole.entities.AppSettings.update(s.id, updateData);

    return Response.json({ success: true, expires_in: expiresIn });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});