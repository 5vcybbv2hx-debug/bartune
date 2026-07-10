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
    const { action, session_id } = body;

    if (!session_id) return Response.json({ error: 'Missing session_id' }, { status: 400 });

    const token = await ensureValidToken(base44);
    const headers = { 'Authorization': `Bearer ${token}` };

    if (action === 'checkAndAdvance') {
      const pbResponse = await fetch('https://api.spotify.com/v1/me/player', { headers });
      if (!pbResponse.ok) return Response.json({ advanced: false, reason: 'no_playback' });
      const playback = await pbResponse.json();
      if (!playback?.item) return Response.json({ advanced: false, reason: 'no_playback' });

      const currentTrackId = playback.item.id;
      const isPlaying = playback.is_playing;
      const remaining = playback.item.duration_ms - playback.progress_ms;

      // Load settings for state tracking
      const settings = await base44.asServiceRole.entities.AppSettings.list();
      const s = settings[0] || {};
      let lastQueuedTrackId = s.last_queued_track_id || null;
      let lastSeenTrackId = s.last_seen_track_id || null;
      const settingsUpdate = {};

      // Load BarTuneQueue
      let queueItems = await base44.asServiceRole.entities.BarTuneQueue.filter({ session_id });
      queueItems.sort((a, b) => (a.position || 0) - (b.position || 0));

      let didCleanup = false;

      // 1. Song change detection
      if (currentTrackId !== lastSeenTrackId) {
        settingsUpdate.last_seen_track_id = currentTrackId;

        if (lastQueuedTrackId) {
          if (currentTrackId === lastQueuedTrackId) {
            // Queued song is now playing — clean up BarTuneQueue
            const playedItem = queueItems.find(q => q.track_id === lastQueuedTrackId);
            if (playedItem) {
              await base44.asServiceRole.entities.BarTuneQueue.delete(playedItem.id);
              const rest = queueItems.filter(q => q.id !== playedItem.id);
              if (rest.length > 0) {
                await base44.asServiceRole.entities.BarTuneQueue.bulkUpdate(
                  rest.map((item, i) => ({ id: item.id, position: i }))
                );
              }
              didCleanup = true;
            }
            settingsUpdate.last_queued_track_id = null;
            lastQueuedTrackId = null;
          } else {
            // Song changed but not to the queued song — reset to avoid blocking
            settingsUpdate.last_queued_track_id = null;
            lastQueuedTrackId = null;
          }
        }
      }

      // Reload queue if we just cleaned up
      if (didCleanup) {
        queueItems = await base44.asServiceRole.entities.BarTuneQueue.filter({ session_id });
        queueItems.sort((a, b) => (a.position || 0) - (b.position || 0));
      }

      // 2. Queue pre-planning: if < 15s remaining and no song queued yet
      let queuedNew = false;
      if (queueItems.length > 0 && !lastQueuedTrackId && isPlaying && remaining < 15000 && remaining > 0) {
        const nextItem = queueItems[0];
        const addResponse = await fetch(
          `https://api.spotify.com/v1/me/player/queue?uri=spotify:track:${nextItem.track_id}`,
          { method: 'POST', headers }
        );
        if (addResponse.ok || addResponse.status === 204) {
          settingsUpdate.last_queued_track_id = nextItem.track_id;
          queuedNew = true;
        }
      }

      // Save settings if changed
      if (Object.keys(settingsUpdate).length > 0 && settings.length > 0) {
        await base44.asServiceRole.entities.AppSettings.update(s.id, settingsUpdate);
      }

      return Response.json({
        advanced: didCleanup,
        queued_new: queuedNew,
        queue_count: queueItems.length,
        remaining,
      });
    }

    if (action === 'skipFirst') {
      const queueItems = await base44.asServiceRole.entities.BarTuneQueue.filter({ session_id });
      if (queueItems.length === 0) return Response.json({ success: false, reason: 'empty' });
      queueItems.sort((a, b) => (a.position || 0) - (b.position || 0));
      await base44.asServiceRole.entities.BarTuneQueue.delete(queueItems[0].id);
      const rest = queueItems.slice(1);
      if (rest.length > 0) {
        await base44.asServiceRole.entities.BarTuneQueue.bulkUpdate(
          rest.map(item => ({ id: item.id, position: (item.position || 0) - 1 }))
        );
      }
      return Response.json({ success: true, remaining_count: rest.length });
    }

    return Response.json({ error: 'Unknown action: ' + action }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});