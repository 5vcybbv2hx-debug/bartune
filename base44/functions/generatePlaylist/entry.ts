import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const ENERGY_MAP = {
  1: { energy: [0.1, 0.4], tempo: [60, 100], danceability: [0.2, 0.5] },
  2: { energy: [0.3, 0.5], tempo: [80, 110], danceability: [0.4, 0.6] },
  3: { energy: [0.4, 0.7], tempo: [90, 125], danceability: [0.5, 0.7] },
  4: { energy: [0.6, 0.85], tempo: [115, 140], danceability: [0.65, 0.85] },
  5: { energy: [0.8, 1.0], tempo: [130, 180], danceability: [0.75, 1.0] },
};

const DECADE_MAP = {
  '70er': [1970, 1979],
  '80er': [1980, 1989],
  '90er': [1990, 1999],
  '2000er': [2000, 2009],
  '2010er': [2010, 2019],
  'Aktuell': [2020, 2030],
};

async function getValidToken(base44) {
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
    if (tokens.error) throw new Error('Token refresh failed');
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
    const { motto, energy_level, song_count, decades = [], playlist_name } = body;

    if (!motto) return Response.json({ error: 'Missing motto' }, { status: 400 });

    const token = await getValidToken(base44);
    const headers = { 'Authorization': `Bearer ${token}` };
    const energyRanges = ENERGY_MAP[energy_level] || ENERGY_MAP[3];
    const hasDecadeFilter = decades.length > 0 && !decades.includes('Egal');

    // Step 1: Derive search terms using LLM
    let searchTerms = [];
    try {
      const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `You are a DJ assistant for a bar. Given the playlist motto "${motto}", energy level ${energy_level}/5 (1=very relaxed, 5=turbo/party), and preferred decades ${decades.filter(d => d !== 'Egal').join(', ') || 'any'}, generate exactly 5 Spotify search queries that would find matching songs. Mix genre terms, mood terms, and era terms. Examples: "80s synthpop", "latin party hits", "smooth jazz lounge". Return as JSON.`,
        response_json_schema: {
          type: "object",
          properties: {
            search_terms: { type: "array", items: { type: "string" } }
          }
        }
      });
      searchTerms = llmRes.search_terms || [];
    } catch (e) {
      searchTerms = [motto, `${motto} hits`, `${motto} mix`, `${motto} party`, `${motto} classics`];
    }

    if (searchTerms.length === 0) searchTerms = [motto, `${motto} hits`];

    // Step 2: Search Spotify
    let allTracks = [];
    for (const term of searchTerms) {
      try {
        const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(term)}&type=track&limit=50`, { headers });
        if (response.ok) {
          const data = await response.json();
          allTracks.push(...(data.tracks?.items || []));
        }
      } catch (e) {}
    }

    const trackMap = new Map();
    allTracks.forEach(t => { if (t && t.id) trackMap.set(t.id, t); });
    let tracks = Array.from(trackMap.values());
    const foundCount = tracks.length;

    // Step 3: Filter by decade
    if (hasDecadeFilter) {
      tracks = tracks.filter(t => {
        const date = t.album?.release_date || '';
        const year = parseInt(date.substring(0, 4));
        if (!year) return false;
        return decades.some(d => {
          const range = DECADE_MAP[d];
          return range && year >= range[0] && year <= range[1];
        });
      });
    }
    const afterDecadeCount = tracks.length;

    // Step 4: Get audio features (batch, max 100)
    const trackIds = tracks.map(t => t.id);
    const audioFeaturesMap = new Map();
    for (let i = 0; i < trackIds.length; i += 100) {
      const batch = trackIds.slice(i, i + 100);
      try {
        const response = await fetch(`https://api.spotify.com/v1/audio-features?ids=${batch.join(',')}`, { headers });
        if (response.ok) {
          const data = await response.json();
          (data.audio_features || []).forEach(af => {
            if (af && af.id) audioFeaturesMap.set(af.id, af);
          });
        }
      } catch (e) {}
    }

    // Step 5: Filter by audio features
    tracks = tracks.filter(t => {
      const af = audioFeaturesMap.get(t.id);
      if (!af) return false;
      return af.energy >= energyRanges.energy[0] && af.energy <= energyRanges.energy[1] &&
             af.tempo >= energyRanges.tempo[0] && af.tempo <= energyRanges.tempo[1] &&
             af.danceability >= energyRanges.danceability[0] && af.danceability <= energyRanges.danceability[1];
    });
    const filteredCount = tracks.length;

    // Step 6: Sort by popularity
    tracks.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

    if (tracks.length < 20) {
      return Response.json({
        error: `Nur ${tracks.length} Songs gefunden, die zu den Filtern passen. Minimum sind 20. Versuche ein anderes Motto, ein anderes Energie-Level oder entferne den Jahrzehnt-Filter.`,
        stats: { found: foundCount, afterDecade: afterDecadeCount, filtered: filteredCount }
      }, { status: 400 });
    }

    const selectedTracks = tracks.slice(0, song_count);

    // Step 7: Get user ID
    const meResponse = await fetch('https://api.spotify.com/v1/me', { headers });
    const me = await meResponse.json();

    // Step 8: Create playlist
    const createResponse = await fetch(`https://api.spotify.com/v1/users/${me.id}/playlists`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: playlist_name || `${motto} · ${new Date().toLocaleDateString('de-DE')}`,
        description: `Erstellt von BarTune 🎵 · ${new Date().toLocaleDateString('de-DE')}`,
        public: false,
      }),
    });

    if (!createResponse.ok) {
      const err = await createResponse.text();
      return Response.json({ error: 'Playlist-Erstellung fehlgeschlagen: ' + err }, { status: 500 });
    }

    const playlist = await createResponse.json();

    // Step 9: Add tracks in batches of 100
    const trackUris = selectedTracks.map(t => `spotify:track:${t.id}`);
    for (let i = 0; i < trackUris.length; i += 100) {
      const batch = trackUris.slice(i, i + 100);
      try {
        await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ uris: batch }),
        });
      } catch (e) {}
    }

    // Step 10: Fuzzy match profile
    const profiles = await base44.asServiceRole.entities.StimmungsProfil.list();
    const mottoLower = motto.toLowerCase();
    const matchedProfile = profiles.find(p => p.name && mottoLower.includes(p.name.toLowerCase()));

    // Step 11: Save to GeneratedPlaylist
    await base44.asServiceRole.entities.GeneratedPlaylist.create({
      name: playlist_name || `${motto} · ${new Date().toLocaleDateString('de-DE')}`,
      spotify_playlist_id: playlist.id,
      motto,
      energy_level,
      song_count: selectedTracks.length,
      created_at: new Date().toISOString(),
      profil_id: matchedProfile?.id || '',
    });

    // Step 12: Add to PlaylistRotation
    const existingRotation = await base44.asServiceRole.entities.PlaylistRotation.filter({ playlist_id: playlist.id });
    if (existingRotation.length === 0) {
      await base44.asServiceRole.entities.PlaylistRotation.create({
        playlist_id: playlist.id,
        playlist_name: playlist_name || `${motto} · ${new Date().toLocaleDateString('de-DE')}`,
        playlist_cover: playlist.images?.[0]?.url || '',
        playlist_track_count: selectedTracks.length,
        play_count: 0,
        profil_id: matchedProfile?.id || '',
      });
    }

    // Step 13: Add to matched profile's playlist_ids
    if (matchedProfile) {
      const currentIds = matchedProfile.playlist_ids || [];
      if (!currentIds.includes(playlist.id)) {
        await base44.asServiceRole.entities.StimmungsProfil.update(matchedProfile.id, {
          playlist_ids: [...currentIds, playlist.id]
        });
      }
    }

    return Response.json({
      success: true,
      playlist_id: playlist.id,
      playlist_name: playlist_name || `${motto} · ${new Date().toLocaleDateString('de-DE')}`,
      song_count: selectedTracks.length,
      spotify_url: playlist.external_urls?.spotify || `https://open.spotify.com/playlist/${playlist.id}`,
      cover: playlist.images?.[0]?.url || '',
      profil_id: matchedProfile?.id || '',
      profil_name: matchedProfile?.name || '',
      energy_level,
      stats: { found: foundCount, afterDecade: afterDecadeCount, filtered: filteredCount }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});