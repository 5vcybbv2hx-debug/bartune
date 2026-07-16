import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function fadeVolume(headers, fromVol, toVol, seconds) {
  const steps = seconds * 2;
  const range = Math.abs(toVol - fromVol);
  const stepSize = Math.max(1, Math.floor(range / steps) || 1);
  const direction = toVol > fromVol ? 1 : -1;
  for (let vol = fromVol; direction > 0 ? vol <= toVol : vol >= toVol; vol += direction * stepSize) {
    await fetch(`https://api.spotify.com/v1/me/player/volume?volume_percent=${Math.max(0, Math.min(100, Math.round(vol)))}`, { method: 'PUT', headers });
    await new Promise(r => setTimeout(r, 500));
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { hard_cut } = body;

    const settingsList = await base44.asServiceRole.entities.AppSettings.list();
    const settings = settingsList[0] || {};
    const session_id = settings.active_session_id;
    if (!session_id) return Response.json({ success: false, noDevice: true });

    const tokenRes = await base44.functions.invoke('getValidSpotifyToken', {});
    const token = tokenRes.data?.access_token;
    const headers = { 'Authorization': `Bearer ${token}` };

    const crossfadeSeconds = body.crossfade_seconds ?? settings.crossfade_seconds ?? 5;
    let useFade = !hard_cut && crossfadeSeconds > 0;

    // Save current volume for restore after fade
    let originalVolume = 0;
    if (useFade) {
      try {
        const pbRes = await fetch('https://api.spotify.com/v1/me/player', { headers });
        if (pbRes.ok) {
          const pb = await pbRes.json();
          originalVolume = pb?.device?.volume_percent ?? 0;
        }
      } catch (e) {}
      if (originalVolume <= 0) useFade = false;
    }

    // Volume fade down
    if (useFade) {
      try { await fadeVolume(headers, originalVolume, 0, crossfadeSeconds); } catch (e) {}
    }

    // Unified: get next from queue (pending only) or fallback to playlist skip
    const allItems = await base44.asServiceRole.entities.BarTuneQueue.filter({ session_id });
    const queueItems = allItems
      .filter(q => q.status !== 'played')
      .sort((a, b) => (a.position || 0) - (b.position || 0));

    if (queueItems.length > 0) {
      const nextItem = queueItems[0];

      // Push to Spotify queue FIRST
      const addResponse = await fetch(
        `https://api.spotify.com/v1/me/player/queue?uri=spotify:track:${nextItem.track_id}`,
        { method: 'POST', headers }
      );

      let noDevice = false;
      if (!addResponse.ok && addResponse.status !== 204) {
        if (addResponse.status === 404 || addResponse.status === 403) noDevice = true;
      }

      if (!noDevice) {
        await new Promise(r => setTimeout(r, 500));
        const nextResponse = await fetch('https://api.spotify.com/v1/me/player/next', { method: 'POST', headers });
        if (!nextResponse.ok && nextResponse.status !== 204) {
          if (nextResponse.status === 404 || nextResponse.status === 403) noDevice = true;
        }
      }

      // Delete from BarTuneQueue, re-index
      try { await base44.asServiceRole.entities.BarTuneQueue.delete(nextItem.id); } catch (_) {}
      const rest = queueItems.slice(1);
      if (rest.length > 0) {
        await base44.asServiceRole.entities.BarTuneQueue.bulkUpdate(
          rest.map((item, i) => ({ id: item.id, position: i }))
        );
        // Push next as preview
        try {
          await fetch(`https://api.spotify.com/v1/me/player/queue?uri=spotify:track:${rest[0].track_id}`, { method: 'POST', headers });
        } catch (e) {}
      }

      // Volume fade up
      if (useFade) {
        try { await fadeVolume(headers, 0, originalVolume, crossfadeSeconds); } catch (e) {}
      }

      if (noDevice) return Response.json({ success: false, noDevice: true });

      return Response.json({
        success: true,
        track_name: nextItem.track_name,
        from_queue: true,
        remaining_count: rest.length,
      });
    } else {
      // Queue empty — normal Spotify skip (playlist continues)
      const nextResponse = await fetch('https://api.spotify.com/v1/me/player/next', { method: 'POST', headers });
      let noDevice = false;
      if (!nextResponse.ok && nextResponse.status !== 204) {
        if (nextResponse.status === 404 || nextResponse.status === 403) noDevice = true;
      }

      // Volume fade up
      if (useFade) {
        try { await fadeVolume(headers, 0, originalVolume, crossfadeSeconds); } catch (e) {}
      }

      if (noDevice) return Response.json({ success: false, noDevice: true });
      return Response.json({ success: true, from_queue: false });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});