import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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

    const tokenRes = await base44.functions.invoke('getValidSpotifyToken', {});
    const token = tokenRes.data?.access_token;
    const settingsId = tokenRes.data?.settings_id;
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