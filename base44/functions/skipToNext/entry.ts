import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function fadeVolume(headers, fromVol, toVol, seconds) {
  const steps = Math.max(2, seconds * 2);
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

    if (!settings.spotify_access_token) {
      return Response.json({ error: 'Not connected to Spotify' }, { status: 400 });
    }
    let accessToken = settings.spotify_access_token;
    const expiresAt = new Date(settings.spotify_token_expires_at).getTime();
    if (Date.now() >= expiresAt - 300000) {
      try {
        const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
        const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
        const credentials = btoa(`${clientId}:${clientSecret}`);
        const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `grant_type=refresh_token&refresh_token=${settings.spotify_refresh_token}`,
        });
        const tokens = await tokenResponse.json();
        if (tokens.access_token) {
          accessToken = tokens.access_token;
          const updateData = { spotify_access_token: tokens.access_token, spotify_token_expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString() };
          if (tokens.refresh_token) updateData.spotify_refresh_token = tokens.refresh_token;
          await base44.asServiceRole.entities.AppSettings.update(settings.id, updateData);
        }
      } catch (e) {}
    }
    const headers = { 'Authorization': `Bearer ${accessToken}` };

    const crossfadeSeconds = body.crossfade_seconds ?? settings.crossfade_seconds ?? 5;
    let useFade = !hard_cut && crossfadeSeconds > 0;

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

    if (useFade) {
      try { await fadeVolume(headers, originalVolume, 0, crossfadeSeconds); } catch (e) {}
    }

    const allItems = await base44.asServiceRole.entities.BarTuneQueue.filter({ session_id });
    const queueItems = allItems
      .filter(q => q.status !== 'played')
      .sort((a, b) => (a.position || 0) - (b.position || 0));

    if (queueItems.length > 0) {
      const nextItem = queueItems[0];
      const addResponse = await fetch(
        `https://api.spotify.com/v1/me/player/queue?uri=spotify:track:${nextItem.track_id}`,
        { method: 'POST', headers }
      );

      let noDevice = false;
      if (!addResponse.ok && addResponse.status !== 204) {
        if (addResponse.status === 404 || addResponse.status === 403) noDevice = true;
      }

      if (!noDevice) {
        await new Promise(r => setTimeout(r, 800));
        const nextResponse = await fetch('https://api.spotify.com/v1/me/player/next', { method: 'POST', headers });
        if (!nextResponse.ok && nextResponse.status !== 204) {
          if (nextResponse.status === 404 || nextResponse.status === 403) noDevice = true;
        }
      }

      try { await base44.asServiceRole.entities.BarTuneQueue.delete(nextItem.id); } catch (_) {}
      const rest = queueItems.slice(1);
      if (rest.length > 0) {
        await base44.asServiceRole.entities.BarTuneQueue.bulkUpdate(
          rest.map((item, i) => ({ id: item.id, position: i }))
        );
        try {
          await fetch(`https://api.spotify.com/v1/me/player/queue?uri=spotify:track:${rest[0].track_id}`, { method: 'POST', headers });
        } catch (e) {}
      }

      if (useFade) {
        await new Promise(r => setTimeout(r, 1200));
        try { await fadeVolume(headers, 0, originalVolume, crossfadeSeconds); } catch (e) {}
      }

      if (noDevice) return Response.json({ success: false, noDevice: true });
      return Response.json({ success: true, track_name: nextItem.track_name, from_queue: true, remaining_count: rest.length });
    } else {
      const nextResponse = await fetch('https://api.spotify.com/v1/me/player/next', { method: 'POST', headers });
      let noDevice = false;
      if (!nextResponse.ok && nextResponse.status !== 204) {
        if (nextResponse.status === 404 || nextResponse.status === 403) noDevice = true;
      }

      if (useFade) {
        await new Promise(r => setTimeout(r, 1200));
        try { await fadeVolume(headers, 0, originalVolume, crossfadeSeconds); } catch (e) {}
      }

      if (noDevice) return Response.json({ success: false, noDevice: true });
      return Response.json({ success: true, from_queue: false });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});