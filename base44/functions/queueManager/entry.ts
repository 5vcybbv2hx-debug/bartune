import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, session_id } = body;
    if (!session_id) return Response.json({ error: 'Missing session_id' }, { status: 400 });

    const tokenRes = await base44.functions.invoke('getValidSpotifyToken', {});
    const token = tokenRes.data?.access_token;
    const headers = { 'Authorization': `Bearer ${token}` };

    if (action === 'checkAndAdvance') {
      // SONG-WECHSEL-ERKENNUNG ONLY — no time-based pushing
      const pbResponse = await fetch('https://api.spotify.com/v1/me/player', { headers });
      if (!pbResponse.ok) return Response.json({ changed: false, reason: 'no_playback' });
      const playback = await pbResponse.json();
      if (!playback?.item) return Response.json({ changed: false, reason: 'no_playback' });

      const currentTrackId = playback.item.id;

      // Load state
      const settings = await base44.asServiceRole.entities.AppSettings.list();
      const s = settings[0] || {};
      const lastPlayedTrackId = s.last_played_track_id || null;
      const settingsUpdate = {};

      let didCleanup = false;

      // Song change detected?
      if (currentTrackId !== lastPlayedTrackId) {
        settingsUpdate.last_played_track_id = currentTrackId;

        // Check if the song that just played was the top of BarTuneQueue
        const queueItems = await base44.asServiceRole.entities.BarTuneQueue.filter({ session_id });
        queueItems.sort((a, b) => (a.position || 0) - (b.position || 0));

        // If the PREVIOUS song (lastPlayedTrackId) is still in queue at position 0, it was played → delete
        if (lastPlayedTrackId && queueItems.length > 0 && queueItems[0].track_id === lastPlayedTrackId) {
          await base44.asServiceRole.entities.BarTuneQueue.delete(queueItems[0].id);
          const rest = queueItems.slice(1);
          if (rest.length > 0) {
            await base44.asServiceRole.entities.BarTuneQueue.bulkUpdate(
              rest.map((item, i) => ({ id: item.id, position: i }))
            );
          }
          didCleanup = true;
        }

        // Push next song as preview (once per song change)
        if (didCleanup) {
          await pushNextToSpotifyQueue(base44, session_id, headers);
        }
      }

      if (Object.keys(settingsUpdate).length > 0 && settings.length > 0) {
        await base44.asServiceRole.entities.AppSettings.update(s.id, settingsUpdate);
      }

      // Load final queue count
      const finalQueue = await base44.asServiceRole.entities.BarTuneQueue.filter({ session_id });
      return Response.json({
        changed: currentTrackId !== lastPlayedTrackId,
        cleaned_up: didCleanup,
        queue_count: finalQueue.length,
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