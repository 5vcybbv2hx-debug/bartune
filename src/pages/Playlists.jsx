import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { RefreshCw, Music2, Lock, Unlock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { syncPlaylists, getPlaylistProfile } from '@/lib/spotifyData';
import { formatRemaining, formatLastPlayed } from '@/lib/useSettings';

export default function Playlists() {
  const { settings, spotifyConnected } = useOutletContext();
  const [rotation, setRotation] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');

  const load = useCallback(async () => {
    if (spotifyConnected) {
      try {
        const r = await syncPlaylists();
        setRotation(r);
      } catch (e) {
        setRotation(await base44.entities.PlaylistRotation.list());
      }
    } else {
      setRotation(await base44.entities.PlaylistRotation.list());
    }
    setProfiles(await base44.entities.StimmungsProfil.list('sort_order', 50));
    setLoading(false);
  }, [spotifyConnected]);

  useEffect(() => { load(); }, [load]);

  const handleAssign = async (playlistId, profileId) => {
    // Remove from all profiles, add to selected
    const updates = profiles.map(p => {
      const ids = p.playlist_ids || [];
      if (p.id === profileId) {
        if (!ids.includes(playlistId)) return { id: p.id, playlist_ids: [...ids, playlistId] };
      } else {
        if (ids.includes(playlistId)) return { id: p.id, playlist_ids: ids.filter(id => id !== playlistId) };
      }
      return null;
    }).filter(Boolean);

    if (updates.length > 0) {
      await base44.entities.StimmungsProfil.bulkUpdate(updates);
      setProfiles(await base44.entities.StimmungsProfil.list('sort_order', 50));
    }
  };

  const handleManualBlock = async (item) => {
    if (item.manual_block) {
      await base44.entities.PlaylistRotation.update(item.id, { manual_block: false, blocked_until: null });
    } else {
      await base44.entities.PlaylistRotation.update(item.id, { manual_block: true });
    }
    setRotation(await base44.entities.PlaylistRotation.list());
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      setRotation(await syncPlaylists());
    } catch (e) {}
    setSyncing(false);
  };

  const now = Date.now();

  const filtered = rotation.filter(item => {
    if (filter === 'available') return !item.manual_block && (!item.blocked_until || new Date(item.blocked_until).getTime() < now);
    if (filter === 'locked') return item.blocked_until && new Date(item.blocked_until).getTime() > now;
    return true;
  });

  filtered.sort((a, b) => {
    if (sortBy === 'name') return (a.playlist_name || '').localeCompare(b.playlist_name || '');
    if (sortBy === 'lastPlayed') {
      if (!a.last_played_at) return 1;
      if (!b.last_played_at) return -1;
      return new Date(b.last_played_at) - new Date(a.last_played_at);
    }
    return 0;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold font-heading">Playlists & Rotation</h1>
          <p className="text-sm text-muted-foreground">{rotation.length} Playlists importiert</p>
        </div>
        {spotifyConnected && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary text-sm font-medium hover:bg-secondary/70 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            <span className="hidden md:inline">Sync</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1 p-1 rounded-lg bg-secondary">
          {['all', 'available', 'locked'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                filter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f === 'all' ? 'Alle' : f === 'available' ? 'Verfügbar' : 'Gesperrt'}
            </button>
          ))}
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-secondary text-xs font-medium border-0 focus:ring-1 focus:ring-primary"
        >
          <option value="name">Sortieren: Name</option>
          <option value="lastPlayed">Sortieren: Zuletzt gespielt</option>
        </select>
      </div>

      {/* Playlist list */}
      <div className="space-y-2">
        {filtered.map(item => {
          const isBlocked = item.blocked_until && new Date(item.blocked_until).getTime() > now;
          const isManual = item.manual_block;
          const assignedProfile = getPlaylistProfile(item.playlist_id, profiles);
          const dotColor = isManual || isBlocked ? 'bg-destructive' : item.last_played_at ? 'bg-success' : 'bg-muted-foreground';

          return (
            <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:border-primary/30 transition">
              {/* Cover */}
              {item.playlist_cover ? (
                <img src={item.playlist_cover} alt="" className="w-10 h-10 rounded-md object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-md bg-secondary flex items-center justify-center shrink-0">
                  <Music2 className="w-4 h-4 text-muted-foreground" />
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-mono font-semibold truncate">{item.playlist_name}</p>
                  <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {item.playlist_track_count > 0 && `${item.playlist_track_count} Songs · `}
                  {isManual ? 'manuell gesperrt' : isBlocked ? formatRemaining(item.blocked_until) : formatLastPlayed(item.last_played_at)}
                </p>
              </div>

              {/* Profile badge */}
              {assignedProfile && (
                <div
                  className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium shrink-0"
                  style={{ backgroundColor: `${assignedProfile.color}20`, color: assignedProfile.color }}
                >
                  <span>{assignedProfile.emoji}</span>
                  <span>{assignedProfile.name}</span>
                </div>
              )}

              {/* Profile selector */}
              <select
                value={assignedProfile?.id || ''}
                onChange={(e) => handleAssign(item.playlist_id, e.target.value)}
                className="px-2 py-1.5 rounded-lg bg-secondary text-xs font-medium border-0 focus:ring-1 focus:ring-primary max-w-[120px]"
              >
                <option value="">—</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>
                ))}
              </select>

              {/* Manual block toggle */}
              <button
                onClick={() => handleManualBlock(item)}
                className={`p-2 rounded-lg transition shrink-0 ${
                  isManual ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-muted-foreground hover:text-foreground'
                }`}
                title={isManual ? 'Sperre aufheben' : 'Manuell sperren'}
              >
                {isManual ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
              </button>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Music2 className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">
            {spotifyConnected ? 'Keine Playlists gefunden. Klicke auf Sync.' : 'Verbinde Spotify, um Playlists zu importieren.'}
          </p>
        </div>
      )}
    </div>
  );
}