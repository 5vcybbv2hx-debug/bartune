import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, playback: clientPlayback } = body;

    // INLINE TOKEN LOGIC — no more function-to-function call
    const settings = await base44.asServiceRole.entities.AppSettings.list();
    if (!settings.length) return Response.json({ error: 'No settings' }, { status: 400 });
    const s = settings[0];
    let accessToken = s.spotify_access_token;
    const expiresAt = new Date(s.spotify_token_expires_at).getTime();
    if (Date.now() >= expiresAt - 300000) {
      try {
        const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
        const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
        const credentials = btoa(`${clientId}:${clientSecret}`);
        const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `grant_type=refresh_token&refresh_token=${s.spotify_refresh_token}`,
        });
        const tokens = await tokenResponse.json();
        if (tokens.access_token) {
          accessToken = tokens.access_token;
          const updateData = { spotify_access_token: tokens.access_token, spotify_token_expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString() };
          if (tokens.refresh_token) updateData.spotify_refresh_token = tokens.refresh_token;
          await base44.asServiceRole.entities.AppSettings.update(s.id, updateData);
        }
      } catch (e) {}
    }
    const headers = { 'Authorization': `Bearer ${accessToken}` };

    const session_id = s.active_session_id;
    if (!session_id) return Response.json({ changed: false, reason: 'no_active_session' });

    if (action === 'checkAndAdvance') {
      let playback = clientPlayback;
      if (!playback || !playback.item) {
        const pbResponse = await fetch('https://api.spotify.com/v1/me/player', { headers });
        if (!pbResponse.ok) return Response.json({ changed: false, reason: 'no_playback' });
        playback = await pbResponse.json();
      }
      if (!playback?.item) return Response.json({ changed: false, reason: 'no_playback' });

      const currentTrackId = playback.item.id;
      const lastPlayedTrackId = s.last_played_track_id || null;
      const settingsUpdate = {};
      let didCleanup = false;
      let didPush = false;

      // Track changed → clean up played items
      if (currentTrackId !== lastPlayedTrackId) {
        settingsUpdate.last_played_track_id = currentTrackId;

        const allItems = await base44.asServiceRole.entities.BarTuneQueue.filter({ session_id });
        
        // Mark any "queued" item that matches the current track as "played"
        const queuedItems = allItems.filter(q => q.status === 'queued');
        for (const item of queuedItems) {
          if (item.track_id === currentTrackId) {
            await base44.asServiceRole.entities.BarTuneQueue.update(item.id, { status: 'played' });
          }
        }

        // Delete all played items
        const playedItems = allItems.filter(q => q.status === 'played');
        for (const item of playedItems) {
          await base44.asServiceRole.entities.BarTuneQueue.delete(item.id);
        }

        // Reindex remaining
        const remaining = (await base44.asServiceRole.entities.BarTuneQueue.filter({ session_id }))
          .filter(q => q.status !== 'played')
          .sort((a, b) => (a.position || 0) - (b.position || 0));
        if (remaining.length > 0 && playedItems.length > 0) {
          await base44.asServiceRole.entities.BarTuneQueue.bulkUpdate(
            remaining.map((item, i) => ({ id: item.id, position: i }))
          );
        }
        didCleanup = playedItems.length > 0;
      }

      // NEW LOGIC: Push the next pending track to Spotify's queue IMMEDIATELY
      // This way, when the current song ends naturally, Spotify plays our queued track
      // instead of advancing to the next playlist track. No timing window needed.
      const allItems = await base44.asServiceRole.entities.BarTuneQueue.filter({ session_id });
      const pending = allItems
        .filter(q => q.status === 'pending')
        .sort((a, b) => (a.position || 0) - (b.position || 0));

      if (pending.length > 0) {
        const next = pending[0];
        // Push to Spotify queue — this track will play after the current song ends
        try {
          await fetch(
            `https://api.spotify.com/v1/me/player/queue?uri=spotify:track:${next.track_id}`,
            { method: 'POST', headers }
          );
          // Mark as "queued" so we don't push it again
          await base44.asServiceRole.entities.BarTuneQueue.update(next.id, { status: 'queued' });
          didPush = true;
        } catch (e) {}
      }

      if (Object.keys(settingsUpdate).length > 0) {
        await base44.asServiceRole.entities.AppSettings.update(s.id, settingsUpdate);
      }

      const finalQueue = await base44.asServiceRole.entities.BarTuneQueue.filter({ session_id });
      return Response.json({
        changed: currentTrackId !== lastPlayedTrackId,
        cleaned_up: didCleanup,
        pushed: didPush,
        queue_count: finalQueue.filter(q => q.status !== 'played').length,
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