import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { RefreshCw, Music2, Clock } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { base44 } from '@/api/base44Client';
import MoodProfileCard from '@/components/MoodProfileCard';
import DJPanel from '@/components/dj/DJPanel';
import { useTransitions } from '@/lib/useTransitions';
import { ensureDefaultProfiles, formatRemaining } from '@/lib/useSettings';
import { syncPlaylists, activateProfile, getNextPlaylist } from '@/lib/spotifyData';

export default function Cockpit() {
  const { settings, player, updateSettings, spotifyConnected } = useOutletContext();
  const { toast } = useToast();
  const [profiles, setProfiles] = useState([]);
  const [rotation, setRotation] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState(null);
  const [activating, setActivating] = useState(null);
  const [bpmSorting, setBpmSorting] = useState(false);

  const { transitionActive, crossfadeSeconds, applyTransition, handleCrossfadeChange, sortQueueByBpm } = useTransitions(spotifyConnected);

  const loadAll = useCallback(async () => {
    const p = await ensureDefaultProfiles();
    setProfiles(p);
    if (spotifyConnected) {
      try {
        const r = await syncPlaylists();
        setRotation(r);
      } catch (e) {
        const r = await base44.entities.PlaylistRotation.list();
        setRotation(r);
      }
    } else {
      const r = await base44.entities.PlaylistRotation.list();
      setRotation(r);
    }
    setLoading(false);
  }, [spotifyConnected]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const r = await syncPlaylists();
      setRotation(r);
    } catch (e) {
      setMessage({ type: 'error', text: 'Sync fehlgeschlagen: ' + (e.response?.data?.error || e.message) });
    }
    setSyncing(false);
  };

  const handleActivate = async (profile) => {
    if (!spotifyConnected) {
      setMessage({ type: 'error', text: 'Verbinde zuerst Spotify in den Settings.' });
      return;
    }
    setActivating(profile.id);
    setMessage(null);
    try {
      const fromProfileId = settings?.active_profil_id;
      const result = await activateProfile(profile, rotation, settings, player, updateSettings);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else if (result.allBlocked) {
        setMessage({ type: 'info', text: `Alle Playlists in Rotation — "${result.chosen.playlist_name}" gestartet.` });
      } else {
        setMessage({ type: 'success', text: `"${result.chosen.playlist_name}" gestartet.` });
      }

      // Apply DJ transition
      const transitionResult = await applyTransition(fromProfileId, profile.id);
      if (transitionResult) {
        toast({
          title: '🎚️ Übergang',
          description: `${transitionResult.name || 'Standard'} · ${transitionResult.seconds}s Crossfade${transitionResult.bpm_sort ? ' · BPM-Sortiert' : ''}`,
        });
      }

      const r = await base44.entities.PlaylistRotation.list();
      setRotation(r);
    } catch (e) {
      setMessage({ type: 'error', text: 'Aktivierung fehlgeschlagen.' });
    }
    setActivating(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  const activeProfile = profiles.find(p => p.id === settings?.active_profil_id);
  const nextPreview = activeProfile ? getNextPlaylist(activeProfile, rotation) : null;

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-7xl mx-auto">
      {/* Not connected banner */}
      {!spotifyConnected && (
        <div className="mb-6 rounded-2xl border border-accent/30 bg-accent/5 p-6 text-center">
          <Music2 className="w-10 h-10 text-accent mx-auto mb-3" />
          <h2 className="text-lg font-bold mb-1">Spotify verbinden</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Verbinde BarTune mit Spotify, um deine Playlists zu importieren und Musik zu steuern.
          </p>
          <a href="/settings" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium neon-glow-primary">
            Zu den Settings →
          </a>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold font-heading">Stimmungs-Cockpit</h1>
          <p className="text-sm text-muted-foreground">Tippe ein Profil an, um die Musik zu starten</p>
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

      {/* Message */}
      {message && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${
          message.type === 'error' ? 'bg-destructive/10 text-destructive border border-destructive/30' :
          message.type === 'success' ? 'bg-success/10 text-success border border-success/30' :
          'bg-accent/10 text-accent border border-accent/30'
        }`}>
          {message.text}
        </div>
      )}

      {/* Split layout: Profiles (55%) + DJ Panel (45%) */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left: Mood profiles */}
        <div className="order-2 lg:order-1 lg:w-[55%]">
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4 mb-6">
            {profiles.map(profile => (
              <MoodProfileCard
                key={profile.id}
                profile={profile}
                isActive={profile.id === settings?.active_profil_id}
                playlistCount={profile.playlist_ids?.length || 0}
                onClick={() => handleActivate(profile)}
              />
            ))}
          </div>

          {/* Next playlist preview */}
          {activeProfile && nextPreview && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-muted-foreground">Als nächstes</h3>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  {nextPreview.playlist.playlist_cover ? (
                    <img src={nextPreview.playlist.playlist_cover} alt="" className="w-10 h-10 rounded-md object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-md bg-secondary flex items-center justify-center">
                      <Music2 className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-mono font-semibold truncate">{nextPreview.playlist.playlist_name}</p>
                    {nextPreview.available ? (
                      <p className="text-xs text-success font-mono">verfügbar</p>
                    ) : (
                      <p className="text-xs text-muted-foreground font-mono">
                        {formatRemaining(nextPreview.playlist.blocked_until)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: DJ Panel */}
        <div className="order-1 lg:order-2 lg:w-[45%]">
          <DJPanel
            player={player}
            spotifyConnected={spotifyConnected}
            rotation={rotation}
            transitionActive={transitionActive}
            crossfadeSeconds={crossfadeSeconds}
            onCrossfadeChange={handleCrossfadeChange}
            onBpmSort={async () => {
              setBpmSorting(true);
              const res = await sortQueueByBpm();
              setBpmSorting(false);
              if (res?.success) {
                toast({ title: '🎵 Queue nach BPM sortiert', description: 'smoothster Flow' });
              } else {
                toast({ title: 'Sortierung nicht möglich', description: 'Queue ist leer oder keine Audio-Features verfügbar', variant: 'destructive' });
              }
            }}
            sorting={bpmSorting}
          />
        </div>
      </div>

      {activating && (
        <div className="fixed inset-0 flex items-center justify-center bg-background/80 z-50">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
        </div>
      )}
    </div>
  );
}