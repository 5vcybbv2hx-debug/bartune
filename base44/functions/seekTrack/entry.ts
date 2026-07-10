import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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

    const tokenRes = await base44.functions.invoke('getValidSpotifyToken', {});
    const token = tokenRes.data?.access_token;
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