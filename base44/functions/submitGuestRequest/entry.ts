import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { song_title, artist, spotify_track_id, track_cover, guest_name } = body;

    if (!song_title) return Response.json({ error: 'Missing song title' }, { status: 400 });

    const entry = await base44.asServiceRole.entities.WunschzettelEintrag.create({
      song_title,
      artist: artist || '',
      spotify_track_id: spotify_track_id || '',
      track_cover: track_cover || '',
      guest_name: guest_name || '',
      status: 'Ausstehend',
      submitted_at: new Date().toISOString(),
    });

    return Response.json({ success: true, id: entry.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});