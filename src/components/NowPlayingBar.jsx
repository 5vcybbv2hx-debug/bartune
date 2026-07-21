import React, { useState, useRef } from 'react';
import { Play, Pause, SkipForward, SkipBack, Volume2, Volume1, VolumeX, AlertCircle } from 'lucide-react';

function formatTime(ms) {
  if (!ms || ms < 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export default function NowPlayingBar({ player, connected }) {
  const { playback, progress, loading, play, pause, next, previous, setVolume } = player;
  const [volumeOpen, setVolumeOpen] = useState(false);
  const volumeTimer = useRef(null);

  if (!connected) {
    return (
      <div className="fixed left-0 right-0 z-40 border-t border-border bg-card bottom-[calc(56px+env(safe-area-inset-bottom,0px))] md:bottom-0">
        <div className="flex items-center justify-center gap-2 px-4 py-3 text-sm text-muted-foreground">
          <AlertCircle className="w-4 h-4" />
          <span>Verbinde Spotify in den Settings, um Musik zu steuern</span>
        </div>
      </div>
    );
  }

  const item = playback?.item;
  const isPlaying = playback?.is_playing;
  const duration = item?.duration_ms || 0;
  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;
  const volume = playback?.device?.volume_percent ?? 50;
  const noDevice = !playback?.device;

  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  return (
    <div className="fixed left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-md bottom-[calc(56px+env(safe-area-inset-bottom,0px))] md:bottom-0">
      {/* Mobile nav spacer — no longer needed, bar sits above tab bar */}

      {noDevice && (
        <div className="flex items-center justify-center gap-2 px-4 py-2 text-xs text-accent border-b border-border">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Öffne Spotify auf deinem Gerät und starte ein Lied, dann kannst du hier steuern</span>
        </div>
      )}

      <div className="flex items-center gap-3 px-3 py-2.5 md:px-6 md:py-3">
        {/* Cover + info */}
        <div className="flex items-center gap-3 min-w-0 flex-1 md:flex-none md:w-72">
          {item?.album?.images?.[0]?.url ? (
            <img
              src={item.album.images[0].url}
              alt=""
              className="w-12 h-12 md:w-14 md:h-14 rounded-full object-cover shrink-0 ring-2 ring-primary/30"
            />
          ) : (
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-secondary flex items-center justify-center shrink-0">
              <span className="text-xl">🎵</span>
            </div>
          )}
          <div className="min-w-0 hidden md:block">
            <p className="text-sm font-mono font-semibold truncate">{item?.name || 'Nichts läuft'}</p>
            <p className="text-xs font-mono text-muted-foreground truncate">
              {item?.artists?.map(a => a.name).join(', ') || '—'}
            </p>
          </div>
        </div>

        {/* Controls + progress (desktop center, mobile right) */}
        <div className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
          <div className="flex items-center gap-2 md:gap-4">
            <button
              onClick={previous}
              disabled={loading || noDevice}
              className="p-2 text-muted-foreground hover:text-foreground transition disabled:opacity-40"
            >
              <SkipBack className="w-4 h-4 md:w-5 md:h-5" />
            </button>
            <button
              onClick={() => isPlaying ? pause() : play()}
              disabled={loading || noDevice}
              className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center neon-glow-primary hover:scale-105 transition disabled:opacity-40"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" />
              ) : (
                <Play className="w-4 h-4 md:w-5 md:h-5 ml-0.5" fill="currentColor" />
              )}
            </button>
            <button
              onClick={next}
              disabled={loading || noDevice}
              className="p-2 text-muted-foreground hover:text-foreground transition disabled:opacity-40"
            >
              <SkipForward className="w-4 h-4 md:w-5 md:h-5" />
            </button>
          </div>

          {/* Progress bar (desktop only) */}
          {item && (
            <div className="hidden md:flex items-center gap-2 w-full max-w-md">
              <span className="text-xs font-mono text-muted-foreground w-10 text-right">{formatTime(progress)}</span>
              <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-1000 ease-linear"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="text-xs font-mono text-muted-foreground w-10">{formatTime(duration)}</span>
            </div>
          )}
        </div>

        {/* Volume (desktop) */}
        <div
          className="hidden md:flex items-center gap-2 w-40"
          onMouseEnter={() => setVolumeOpen(true)}
          onMouseLeave={() => { clearTimeout(volumeTimer.current); volumeTimer.current = setTimeout(() => setVolumeOpen(false), 500); }}
        >
          <VolumeIcon className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="range"
            min="0"
            max="100"
            defaultValue={volume}
            onChange={(e) => setVolume(parseInt(e.target.value))}
            className="flex-1 accent-primary"
          />
        </div>

        {/* Mobile: minimal info */}
        <div className="md:hidden min-w-0 flex-1">
          <p className="text-xs font-mono font-semibold truncate">{item?.name || 'Nichts läuft'}</p>
          <p className="text-[10px] font-mono text-muted-foreground truncate">
            {item?.artists?.map(a => a.name).join(', ') || '—'}
          </p>
        </div>
      </div>
    </div>
  );
}