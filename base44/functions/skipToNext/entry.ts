import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { hard_cut, crossfade_seconds } = body;

    const settingsList = await base44.asServiceRole.entities.AppSettings.list();
    const session_id = settingsList[0]?.active_session_id;
    if (!session_id) return Response.json({ success: false, noDevice: true });

    const tokenRes = await base44.functions.invoke('getValidSpotifyToken', {});
    const token = tokenRes.data?.access_token;
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

      // 4. Wait for Spotify to process the queue entry
      await new Promise(r => setTimeout(r, 500));

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

      // 6. Delete queue item, decrement positions
      try { await base44.asServiceRole.entities.BarTuneQueue.delete(nextItem.id); } catch (_) {}
      const rest = queueItems.slice(1);
      if (rest.length > 0) {
        await base44.asServiceRole.entities.BarTuneQueue.bulkUpdate(
          rest.map((item, i) => ({ id: item.id, position: i }))
        );
        // Push next song as preview
        await fetch(
          `https://api.spotify.com/v1/me/player/queue?uri=spotify:track:${rest[0].track_id}`,
          { method: 'POST', headers }
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