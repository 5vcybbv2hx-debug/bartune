import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { pin, action, params = {} } = body;

    const settingsList = await base44.asServiceRole.entities.AppSettings.list();
    if (settingsList.length === 0) return Response.json({ error: 'Not configured' }, { status: 500 });
    const appSettings = settingsList[0];

    if (!appSettings.staff_pin || pin !== appSettings.staff_pin) {
      return Response.json({ error: 'Invalid PIN' }, { status: 403 });
    }

    const s = appSettings;
    if (!s.spotify_access_token) return Response.json({ error: 'Not connected to Spotify' }, { status: 400 });
    let token = s.spotify_access_token;
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
          token = tokens.access_token;
          const updateData = { spotify_access_token: tokens.access_token, spotify_token_expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString() };
          if (tokens.refresh_token) updateData.spotify_refresh_token = tokens.refresh_token;
          await base44.asServiceRole.entities.AppSettings.update(s.id, updateData);
        }
      } catch (e) {}
    }

    switch (action) {
      case 'getProfiles': {
        const profiles = await base44.asServiceRole.entities.StimmungsProfil.list('sort_order', 50);
        const rotation = await base44.asServiceRole.entities.PlaylistRotation.list();
        return Response.json({ profiles, rotation, activeProfileId: s.active_profil_id });
      }

      case 'activate': {
        const profile = await base44.asServiceRole.entities.StimmungsProfil.get(params.profileId);
        if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

        const allRotation = await base44.asServiceRole.entities.PlaylistRotation.list();
        const profilePlaylists = allRotation.filter(r => profile.playlist_ids?.includes(r.playlist_id));

        if (profilePlaylists.length === 0) {
          return Response.json({ error: 'No playlists assigned to this profile' }, { status: 400 });
        }

        const now = Date.now();
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
          if (unblocked.length === 0) return Response.json({ error: 'All playlists manually blocked' }, { status: 400 });
          unblocked.sort((a, b) => new Date(a.blocked_until) - new Date(b.blocked_until));
          chosen = unblocked[0];
          allBlocked = true;
        }

        const playResponse = await fetch('https://api.spotify.com/v1/me/player/play', {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ context_uri: `spotify:playlist:${chosen.playlist_id}` }),
        });

        if (!playResponse.ok && playResponse.status !== 204) {
          const err = await playResponse.text();
          return Response.json({ error: 'Playback failed: ' + err }, { status: 502 });
        }

        const blockHours = s.rotation_block_hours || 24;
        await base44.asServiceRole.entities.PlaylistRotation.update(chosen.id, {
          last_played_at: new Date().toISOString(),
          blocked_until: new Date(now + blockHours * 3600000).toISOString(),
          play_count: (chosen.play_count || 0) + 1,
          profil_id: profile.id,
        });

        await base44.asServiceRole.entities.AppSettings.update(s.id, { active_profil_id: profile.id });

        return Response.json({ success: true, playlistName: chosen.playlist_name, allBlocked });
      }

      case 'next': {
        await fetch('https://api.spotify.com/v1/me/player/next', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        });
        return Response.json({ success: true });
      }

      case 'pause': {
        await fetch('https://api.spotify.com/v1/me/player/pause', {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}` },
        });
        return Response.json({ success: true });
      }

      case 'getPlaybackState': {
        const response = await fetch('https://api.spotify.com/v1/me/player', {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (response.status === 204) return Response.json(null);
        const data = await response.json();
        return Response.json(data);
      }

      default:
        return Response.json({ error: 'Unknown action: ' + action }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});