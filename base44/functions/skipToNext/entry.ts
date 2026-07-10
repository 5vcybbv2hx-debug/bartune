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
    const { session_id, hard_cut, crossfade_seconds } = body;
    if (!session_id) return Response.json({ error: 'Missing session_id' }, { status: 400 });

    const token = await ensureValidToken(base44);
    const headers = { 'Authorization': `Bearer ${token}` };

    // 1. Set crossfade before skip
    if (hard_cut) {
      await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ crossfade_state: false, crossfade_duration_ms: 0 }),
      });
      const settings = await base44.asServiceRole.entities.AppSettings.list();
      if (settings.length > 0) {
        await base44.asServiceRole.entities.AppSettings.update(settings[0].id, { crossfade_seconds: 0 });
      }
      await new Promise(r => setTimeout(r, 200));
    } else if (crossfade_seconds !== undefined && crossfade_seconds > 0) {
      await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ crossfade_state: true, crossfade_duration_ms: crossfade_seconds * 1000 }),
      });
      await new Promise(r => setTimeout(r, 300));
    }

    // 2. Get BarTuneQueue items sorted by position
    const queueItems = await base44.asServiceRole.entities.BarTuneQueue.filter({ session_id });
    queueItems.sort((a, b) => (a.position || 0) - (b.position || 0));

    if (queueItems.length > 0) {
      const nextItem = queueItems[0];

      // 3. Add to Spotify queue FIRST
      const addResponse = await fetch(
        `https://api.spotify.com/v1/me/player/queue?uri=spotify:track:${nextItem.track_id}`,
        { method: 'POST', headers }
      );

      if (!addResponse.ok && addResponse.status !== 204) {
        if (addResponse.status === 404 || addResponse.status === 403) {
          return Response.json({ success: false, noDevice: true });
        }
        const errText = await addResponse.text();
        return Response.json({ success: false, error: errText, status: addResponse.status });
      }

      // Set last_queued_track_id to prevent double-push by queueManager polling
      const skipSettings = await base44.asServiceRole.entities.AppSettings.list();
      if (skipSettings.length > 0) {
        await base44.asServiceRole.entities.AppSettings.update(skipSettings[0].id, {
          last_queued_track_id: nextItem.track_id
        });
      }

      // 4. Wait for Spotify to process the queue entry
      await new Promise(r => setTimeout(r, 300));

      // 5. NOW skip — the BarTune song is next in Spotify's queue
      const nextResponse = await fetch('https://api.spotify.com/v1/me/player/next', {
        method: 'POST',
        headers,
      });

      if (!nextResponse.ok && nextResponse.status !== 204) {
        if (nextResponse.status === 404 || nextResponse.status === 403) {
          return Response.json({ success: false, noDevice: true });
        }
      }

      // 6. Delete queue item, decrement positions (queueManager may have already cleaned up)
      try { await base44.asServiceRole.entities.BarTuneQueue.delete(nextItem.id); } catch (_) {}
      const rest = queueItems.slice(1);
      if (rest.length > 0) {
        await base44.asServiceRole.entities.BarTuneQueue.bulkUpdate(
          rest.map(item => ({ id: item.id, position: (item.position || 0) - 1 }))
        );
      }

      return Response.json({
        success: true,
        track_name: nextItem.track_name,
        from_queue: true,
        remaining_count: rest.length,
      });
    } else {
      // Queue empty — normal Spotify skip
      const nextResponse = await fetch('https://api.spotify.com/v1/me/player/next', {
        method: 'POST',
        headers,
      });

      if (!nextResponse.ok && nextResponse.status !== 204) {
        if (nextResponse.status === 404 || nextResponse.status === 403) {
          return Response.json({ success: false, noDevice: true });
        }
      }

      return Response.json({ success: true, from_queue: false });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});