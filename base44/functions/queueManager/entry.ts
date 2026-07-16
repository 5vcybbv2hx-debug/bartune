import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action } = body;

    const tokenRes = await base44.functions.invoke('getValidSpotifyToken', {});
    const token = tokenRes.data?.access_token;
    const headers = { 'Authorization': `Bearer ${token}` };

    // Get active session from AppSettings — not from request body
    const settings = await base44.asServiceRole.entities.AppSettings.list();
    const s = settings[0] || {};
    const session_id = s.active_session_id;
    if (!session_id) return Response.json({ changed: false, reason: 'no_active_session' });

    if (action === 'checkAndAdvance') {
      const pbResponse = await fetch('https://api.spotify.com/v1/me/player', { headers });
      if (!pbResponse.ok) return Response.json({ changed: false, reason: 'no_playback' });
      const playback = await pbResponse.json();
      if (!playback?.item) return Response.json({ changed: false, reason: 'no_playback' });

      const currentTrackId = playback.item.id;
      const lastPlayedTrackId = s.last_played_track_id || null;
      const settingsUpdate = {};
      let didCleanup = false;
      let didPreQueue = false;

      // Track changed → clean up "played" items (already pushed to Spotify and consumed)
      if (currentTrackId !== lastPlayedTrackId) {
        settingsUpdate.last_played_track_id = currentTrackId;

        const allItems = await base44.asServiceRole.entities.BarTuneQueue.filter({ session_id });
        const playedItems = allItems.filter(q => q.status === 'played');

        for (const item of playedItems) {
          await base44.asServiceRole.entities.BarTuneQueue.delete(item.id);
        }

        const remaining = allItems.filter(q => q.status !== 'played');
        if (remaining.length > 0 && playedItems.length > 0) {
          remaining.sort((a, b) => (a.position || 0) - (b.position || 0));
          await base44.asServiceRole.entities.BarTuneQueue.bulkUpdate(
            remaining.map((item, i) => ({ id: item.id, position: i }))
          );
        }
        didCleanup = playedItems.length > 0;
      }

      // Pre-emptive queue push: if < 10s remaining, push next pending item to Spotify queue
      // This ensures queue songs play BEFORE the playlist continues
      if (playback.item && playback.progress_ms !== undefined && playback.item.duration_ms) {
        const remainingMs = playback.item.duration_ms - playback.progress_ms;
        if (remainingMs > 0 && remainingMs < 10000) {
          const allItems = await base44.asServiceRole.entities.BarTuneQueue.filter({ session_id });
          const pending = allItems
            .filter(q => q.status !== 'played')
            .sort((a, b) => (a.position || 0) - (b.position || 0));

          if (pending.length > 0) {
            const next = pending[0];
            await fetch(
              `https://api.spotify.com/v1/me/player/queue?uri=spotify:track:${next.track_id}`,
              { method: 'POST', headers }
            );
            await base44.asServiceRole.entities.BarTuneQueue.update(next.id, { status: 'played' });
            didPreQueue = true;
          }
        }
      }

      if (Object.keys(settingsUpdate).length > 0 && settings.length > 0) {
        await base44.asServiceRole.entities.AppSettings.update(s.id, settingsUpdate);
      }

      const finalQueue = await base44.asServiceRole.entities.BarTuneQueue.filter({ session_id });
      return Response.json({
        changed: currentTrackId !== lastPlayedTrackId,
        cleaned_up: didCleanup,
        pre_queued: didPreQueue,
        queue_count: finalQueue.length,
      });
    }

    if (action === 'skipFirst') {
      const allItems = await base44.asServiceRole.entities.BarTuneQueue.filter({ session_id });
      const pending = allItems
        .filter(q => q.status !== 'played')
        .sort((a, b) => (a.position || 0) - (b.position || 0));
      if (pending.length === 0) return Response.json({ success: false, reason: 'empty' });
      await base44.asServiceRole.entities.BarTuneQueue.delete(pending[0].id);
      const rest = pending.slice(1);
      if (rest.length > 0) {
        await base44.asServiceRole.entities.BarTuneQueue.bulkUpdate(
          rest.map((item, i) => ({ id: item.id, position: i }))
        );
      }
      return Response.json({ success: true, remaining_count: rest.length });
    }

    return Response.json({ error: 'Unknown action: ' + action }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});