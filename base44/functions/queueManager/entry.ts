import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function pushNextToSpotifyQueue(base44, sessionId, headers) {
  const queueItems = await base44.asServiceRole.entities.BarTuneQueue.filter({ session_id: sessionId });
  queueItems.sort((a, b) => (a.position || 0) - (b.position || 0));
  if (queueItems.length > 0) {
    await fetch(
      `https://api.spotify.com/v1/me/player/queue?uri=spotify:track:${queueItems[0].track_id}`,
      { method: 'POST', headers }
    );
  }
}

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

      if (currentTrackId !== lastPlayedTrackId) {
        settingsUpdate.last_played_track_id = currentTrackId;

        const queueItems = await base44.asServiceRole.entities.BarTuneQueue.filter({ session_id });
        queueItems.sort((a, b) => (a.position || 0) - (b.position || 0));

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

        if (didCleanup) {
          await pushNextToSpotifyQueue(base44, session_id, headers);
        }
      }

      if (Object.keys(settingsUpdate).length > 0 && settings.length > 0) {
        await base44.asServiceRole.entities.AppSettings.update(s.id, settingsUpdate);
      }

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