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
    const { session_id } = body;

    if (!session_id) return Response.json({ error: 'Missing session_id' }, { status: 400 });

    const token = await ensureValidToken(base44);
    const headers = { 'Authorization': `Bearer ${token}` };

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
    const queueItems = await base44.asServiceRole.entities.BarTuneQueue.filter({ session_id });
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