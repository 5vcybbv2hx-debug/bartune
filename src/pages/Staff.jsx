import React, { useState, useEffect } from 'react';
import { Play, Pause, SkipForward, Music2, AlertCircle, KeyRound } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function Staff() {
  const [pin, setPin] = useState('');
  const [authed, setAuthed] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [rotation, setRotation] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState(null);
  const [playback, setPlayback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState(0);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await base44.functions.invoke('staffControl', { pin, action: 'getProfiles' });
      if (res.data?.profiles) {
        setProfiles(res.data.profiles);
        setRotation(res.data.rotation || []);
        setActiveProfileId(res.data.activeProfileId);
        setAuthed(true);
      }
    } catch (e) {
      setError(e.response?.data?.error === 'Invalid PIN' ? 'Falsche PIN' : 'Verbindungsfehler');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!authed) return;
    const poll = async () => {
      try {
        const res = await base44.functions.invoke('staffControl', { pin, action: 'getPlaybackState' });
        setPlayback(res.data);
        if (res.data?.item) setProgress(res.data.progress_ms || 0);
      } catch (e) {}
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [authed, pin]);

  // Smooth progress
  useEffect(() => {
    if (!playback?.is_playing || !playback?.item) return;
    const t = setInterval(() => {
      setProgress(p => p >= playback.item.duration_ms ? p : p + 1000);
    }, 1000);
    return () => clearInterval(t);
  }, [playback?.is_playing, playback?.item?.duration_ms]);

  const handleActivate = async (profileId) => {
    setLoading(true);
    setMessage('');
    try {
      const res = await base44.functions.invoke('staffControl', {
        pin, action: 'activate', params: { profileId }
      });
      if (res.data?.success) {
        setMessage(res.data.allBlocked
          ? `Alle in Rotation — "${res.data.playlistName}" gestartet.`
          : `"${res.data.playlistName}" gestartet.`
        );
        setActiveProfileId(profileId);
        const refresh = await base44.functions.invoke('staffControl', { pin, action: 'getProfiles' });
        if (refresh.data?.rotation) setRotation(refresh.data.rotation);
      }
    } catch (e) {
      setMessage('Fehler: ' + (e.response?.data?.error || 'Aktivierung fehlgeschlagen'));
    }
    setLoading(false);
  };

  const handleNext = async () => {
    setLoading(true);
    await base44.functions.invoke('staffControl', { pin, action: 'next' });
    setLoading(false);
  };

  const handlePause = async () => {
    await base44.functions.invoke('staffControl', { pin, action: 'pause' });
  };

  // PIN entry screen
  if (!authed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-xs w-full">
          <div className="text-4xl mb-3">🎵</div>
          <h1 className="text-xl font-bold font-heading mb-1">BarTune Staff</h1>
          <p className="text-sm text-muted-foreground mb-6">PIN eingeben, um Stimmung zu wechseln</p>

          <input
            type="text"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchData()}
            placeholder="PIN"
            maxLength={8}
            className="w-full px-4 py-3 rounded-xl bg-card border border-border text-center text-2xl font-mono tracking-widest focus:ring-2 focus:ring-primary outline-none mb-3"
          />

          {error && <p className="text-sm text-destructive mb-3">{error}</p>}

          <button
            onClick={fetchData}
            disabled={!pin || loading}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 neon-glow-primary disabled:opacity-40 disabled:shadow-none"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : (
              <><KeyRound className="w-4 h-4" /> Einloggen</>
            )}
          </button>
        </div>
      </div>
    );
  }

  // Staff cockpit
  const item = playback?.item;
  const isPlaying = playback?.is_playing;
  const duration = item?.duration_ms || 0;
  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;
  const noDevice = !playback?.device;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🎵</span>
          <span className="text-lg font-bold font-heading">BarTune</span>
        </div>
        <span className="text-xs text-muted-foreground font-mono">Staff</span>
      </div>

      {/* Message */}
      {message && (
        <div className="mb-3 px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/30 text-primary text-sm font-medium">
          {message}
        </div>
      )}

      {/* Now playing */}
      <div className="mb-4 p-4 rounded-2xl bg-card border border-border">
        {noDevice ? (
          <div className="flex items-center gap-2 text-accent text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Kein aktives Spotify-Gerät. Starte Spotify auf einem Gerät.</span>
          </div>
        ) : item ? (
          <div className="flex items-center gap-3">
            {item.album?.images?.[0]?.url ? (
              <img src={item.album.images[0].url} alt="" className="w-14 h-14 rounded-full object-cover ring-2 ring-primary/30" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center">
                <Music2 className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-mono font-semibold truncate">{item.name}</p>
              <p className="text-xs font-mono text-muted-foreground truncate">
                {item.artists?.map(a => a.name).join(', ')}
              </p>
              <div className="h-1 bg-secondary rounded-full mt-1.5 overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-1000 ease-linear" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
            {/* Controls */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => isPlaying ? handlePause() : null}
                disabled={!isPlaying}
                className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center neon-glow-primary disabled:opacity-40"
              >
                {isPlaying ? <Pause className="w-4 h-4" fill="currentColor" /> : <Play className="w-4 h-4 ml-0.5" fill="currentColor" />}
              </button>
              <button
                onClick={handleNext}
                disabled={loading || noDevice}
                className="w-10 h-10 rounded-full bg-secondary text-foreground flex items-center justify-center disabled:opacity-40"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-2 text-sm text-muted-foreground">Nichts läuft</div>
        )}
      </div>

      {/* Mood profiles */}
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Stimmung wechseln</h2>
      <div className="grid grid-cols-2 gap-3">
        {profiles.map(profile => {
          const isActive = profile.id === activeProfileId;
          const playlistCount = profile.playlist_ids?.length || 0;
          return (
            <button
              key={profile.id}
              onClick={() => handleActivate(profile.id)}
              disabled={loading}
              className="relative rounded-2xl p-4 text-left transition-all disabled:opacity-50"
              style={{
                backgroundColor: 'hsl(var(--card))',
                border: `2px solid ${isActive ? profile.color : 'hsl(var(--border))'}`,
                boxShadow: isActive ? `0 0 20px ${profile.color}50` : 'none',
              }}
            >
              {isActive && (
                <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ backgroundColor: profile.color, color: '#000' }}>
                  AKTIV
                </div>
              )}
              <div className="text-4xl mb-2">{profile.emoji}</div>
              <h3 className="text-sm font-bold" style={{ color: isActive ? profile.color : 'inherit' }}>{profile.name}</h3>
              <p className="text-xs text-muted-foreground font-mono">{playlistCount} Playlists</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}