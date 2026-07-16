import { base44 } from '@/api/base44Client';

export async function syncPlaylists() {
  const res = await base44.functions.invoke('spotifyApi', { action: 'getPlaylists' });
  const items = res.data?.items || [];
  const existing = await base44.entities.PlaylistRotation.list();
  const existingMap = new Map(existing.map(r => [r.playlist_id, r]));

  const toCreate = items.filter(p => !existingMap.has(p.id)).map(p => ({
    playlist_id: p.id,
    playlist_name: p.name,
    playlist_cover: p.images?.[0]?.url || '',
    playlist_track_count: p.tracks?.total || 0,
    play_count: 0,
  }));

  if (toCreate.length > 0) {
    await base44.entities.PlaylistRotation.bulkCreate(toCreate);
  }

  // Update names/covers for existing
  const toUpdate = items.filter(p => {
    const ex = existingMap.get(p.id);
    return ex && (ex.playlist_name !== p.name || ex.playlist_cover !== (p.images?.[0]?.url || ''));
  }).map(p => ({
    id: existingMap.get(p.id).id,
    playlist_name: p.name,
    playlist_cover: p.images?.[0]?.url || '',
    playlist_track_count: p.tracks?.total || 0,
  }));

  if (toUpdate.length > 0) {
    await base44.entities.PlaylistRotation.bulkUpdate(toUpdate);
  }

  return await base44.entities.PlaylistRotation.list();
}

export async function activateProfile(profile, rotation, settings, player, updateSettings) {
  const profilePlaylists = rotation.filter(r => profile.playlist_ids?.includes(r.playlist_id));
  if (profilePlaylists.length === 0) {
    return { error: 'Diesem Profil sind keine Playlists zugeordnet.' };
  }

  const now = Date.now();

  // Generate new session ID and clean old queue entries from other sessions
  const newSessionId = (crypto.randomUUID && crypto.randomUUID()) || ('sess_' + Date.now() + '_' + Math.random().toString(36).slice(2));
  try {
    const oldEntries = await base44.entities.BarTuneQueue.list();
    const twoHoursAgo = now - (2 * 3600000);
    const stale = oldEntries.filter(q => {
      if (q.session_id === newSessionId) return false;
      const createdAt = new Date(q.created_date || q.added_at || twoHoursAgo).getTime();
      return createdAt < twoHoursAgo;
    });
    for (const entry of stale) {
      try { await base44.entities.BarTuneQueue.delete(entry.id); } catch (e) {}
    }
  } catch (e) {}

  const available = profilePlaylists.filter(r => !r.manual_block && (!r.blocked_until || new Date(r.blocked_until).getTime() < now));

  let chosen;
  let allBlocked = false;

  if (available.length > 0) {
    available.sort((a, b) => {
      if (!a.last_played_at && !b.last_played_at) return 0;
      if (!a.last_played_at) return -1;
      if (!b.last_played_at) return 1;
      return new Date(a.last_played_at) - new Date(b.last_played_at);
    });
    chosen = available[0];
  } else {
    const unblocked = profilePlaylists.filter(r => !r.manual_block);
    if (unblocked.length === 0) {
      return { error: 'Alle Playlists sind manuell gesperrt.' };
    }
    unblocked.sort((a, b) => new Date(a.blocked_until) - new Date(b.blocked_until));
    chosen = unblocked[0];
    allBlocked = true;
  }

  await player.play(`spotify:playlist:${chosen.playlist_id}`);

  const blockHours = settings?.rotation_block_hours || 24;
  await base44.entities.PlaylistRotation.update(chosen.id, {
    last_played_at: new Date().toISOString(),
    blocked_until: new Date(now + blockHours * 3600000).toISOString(),
    play_count: (chosen.play_count || 0) + 1,
    profil_id: profile.id,
  });

  await updateSettings({ active_profil_id: profile.id, active_session_id: newSessionId });

  return { chosen, allBlocked };
}

export function getNextPlaylist(profile, rotation) {
  const profilePlaylists = rotation.filter(r => profile.playlist_ids?.includes(r.playlist_id) && !r.manual_block);
  if (profilePlaylists.length === 0) return null;

  const now = Date.now();
  const available = profilePlaylists.filter(r => !r.blocked_until || new Date(r.blocked_until).getTime() < now);

  if (available.length > 0) {
    available.sort((a, b) => {
      if (!a.last_played_at && !b.last_played_at) return 0;
      if (!a.last_played_at) return -1;
      if (!b.last_played_at) return 1;
      return new Date(a.last_played_at) - new Date(b.last_played_at);
    });
    return { playlist: available[0], available: true };
  }

  profilePlaylists.sort((a, b) => new Date(a.blocked_until) - new Date(b.blocked_until));
  return { playlist: profilePlaylists[0], available: false };
}

export function getPlaylistProfile(playlistId, profiles) {
  return profiles.find(p => p.playlist_ids?.includes(playlistId));
}