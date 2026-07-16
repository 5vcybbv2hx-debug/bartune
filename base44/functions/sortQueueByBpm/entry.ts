import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();

    const settingsList = await base44.asServiceRole.entities.AppSettings.list();
    const session_id = settingsList[0]?.active_session_id;
    if (!session_id) return Response.json({ success: false, reason: 'no_active_session' });

    const s = settingsList[0];
    if (!s?.spotify_access_token) return Response.json({ success: false, reason: 'not_connected' });
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

    // Get current playback for starting BPM
    let currentBpm = 120;
    try {
      const pbResponse = await fetch('https://api.spotify.com/v1/me/player', { headers });
      if (pbResponse.ok) {
        const playback = await pbResponse.json();
        if (playback?.item?.id) {
          const afResponse = await fetch(`https://api.spotify.com/v1/audio-features/${playback.item.id}`, { headers });
          if (afResponse.ok) {
            const af = await afResponse.json();
            if (af?.tempo) currentBpm = af.tempo;
          }
        }
      }
    } catch (e) {}

    // Get queue items
    const allQueueItems = await base44.asServiceRole.entities.BarTuneQueue.filter({ session_id });
    const queueItems = allQueueItems.filter(q => q.status !== 'played');
    if (queueItems.length === 0) {
      return Response.json({ success: false, reason: 'queue_empty' });
    }

    queueItems.sort((a, b) => (a.position || 0) - (b.position || 0));

    // Get audio features for all queue tracks (batch, max 100)
    const trackIds = queueItems.map(q => q.track_id);
    const featuresMap = new Map();
    for (let i = 0; i < trackIds.length; i += 100) {
      const batch = trackIds.slice(i, i + 100);
      try {
        const response = await fetch(`https://api.spotify.com/v1/audio-features?ids=${batch.join(',')}`, { headers });
        if (response.ok) {
          const data = await response.json();
          (data.audio_features || []).forEach(af => {
            if (af && af.id) featuresMap.set(af.id, af);
          });
        }
      } catch (e) {}
    }

    // Split items with/without BPM data
    const withBpm = queueItems.filter(q => featuresMap.has(q.track_id) && featuresMap.get(q.track_id).tempo);
    const withoutBpm = queueItems.filter(q => !featuresMap.has(q.track_id) || !featuresMap.get(q.track_id).tempo);

    // Greedy BPM sort: start from currentBpm, pick closest each time
    const sorted = [];
    let prevBpm = currentBpm;
    const remaining = [...withBpm];

    while (remaining.length > 0) {
      let bestIdx = 0;
      let bestDiff = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const bpm = featuresMap.get(remaining[i].track_id).tempo;
        const diff = Math.abs(bpm - prevBpm);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestIdx = i;
        }
      }
      const chosen = remaining.splice(bestIdx, 1)[0];
      sorted.push(chosen);
      prevBpm = featuresMap.get(chosen.track_id).tempo;
    }

    // Items without BPM go to the end
    const finalOrder = [...sorted, ...withoutBpm];

    // Update positions
    const updates = finalOrder.map((item, i) => ({ id: item.id, position: i }));
    if (updates.length > 0) {
      await base44.asServiceRole.entities.BarTuneQueue.bulkUpdate(updates);
    }

    return Response.json({
      success: true,
      sorted_count: sorted.length,
      skipped_count: withoutBpm.length,
      start_bpm: Math.round(currentBpm),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});