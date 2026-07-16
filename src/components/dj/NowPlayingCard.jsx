import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, SkipForward, SkipBack, Volume2, Volume1, VolumeX, AlertCircle } from 'lucide-react';
import SeekBar from '@/components/dj/SeekBar';

function formatTime(ms) {
  if (!ms || ms < 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export default function NowPlayingCard({ player, audioFeatures, spotifyConnected, crossfadeSeconds, onCrossfadeChange, transitionActive, onSkipPressStart, onSkipPressEnd, skipPulse, hardCut, skipping }) {
  const { playback, progress, loading, play, pause, previous, setVolume, seek } = player;

  if (!spotifyConnected) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Verbinde Spotify, um Musik zu steuern
      </div>
    );
  }

  const item = playback?.item;
  const isPlaying = playback?.is_playing;
  const duration = item?.duration_ms || 0;
  const volume = playback?.device?.volume_percent ?? 50;
  const noDevice = !playback?.device;
  const trackId = item?.id || 'none';

  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  return (
    <div
      className="rounded-2xl p-4 md:p-5 relative overflow-hidden"
      style={{ backgroundColor: '#16213E', borderLeft: '4px solid hsl(var(--primary))' }}
    >
      {noDevice && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-accent/10 border border-accent/30 text-accent text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Kein aktives Gerät — öffne Spotify auf deinem Handy oder Laptop</span>
        </div>
      )}

      <div className="flex gap-3 md:gap-4">
        {/* Cover */}
        <div className="shrink-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={trackId}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {item?.album?.images?.[0]?.url ? (
                <img
                  src={item.album.images[0].url}
                  alt=""
                  className="w-[80px] h-[80px] rounded-xl object-cover ring-2 ring-primary/20"
                />
              ) : (
                <div className="w-[80px] h-[80px] rounded-xl bg-secondary flex items-center justify-center">
                  <span className="text-3xl">🎵</span>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={trackId}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25 }}
            >
              <p className="text-base font-mono font-bold truncate flex items-center gap-2">
                <span className="truncate">{item?.name || 'Nichts läuft'}</span>
                <AnimatePresence>
                  {transitionActive && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="shrink-0 px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[9px] font-mono animate-pulse"
                    >
                      🎚️ Übergang läuft...
                    </motion.span>
                  )}
                </AnimatePresence>
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {item?.artists?.map(a => a.name).join(', ') || '—'}
              </p>
              <p className="text-[10px] text-muted-foreground/60 truncate">
                {item?.album?.name || ''}
              </p>
            </motion.div>
          </AnimatePresence>

          {/* Audio feature badges */}
          <AnimatePresence mode="wait">
            <motion.div
              key={trackId + '-features'}
              initial={{ opacity: 0.4 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="flex flex-wrap gap-1.5 mt-2"
            >
              {audioFeatures ? (
                <>
                  <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-mono">
                    ⚡ {Math.round(audioFeatures.tempo)} BPM
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-mono">
                    🔥 Energie {audioFeatures.energy?.toFixed(2)}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-mono">
                    💃 Dance {audioFeatures.danceability?.toFixed(2)}
                  </span>
                </>
              ) : (
                <span className="text-[10px] text-muted-foreground/40 font-mono">Audio-Features werden geladen...</span>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Progress bar (seekable) */}
      {item && (
        <SeekBar
          progress={progress}
          duration={duration}
          skipping={skipping}
          onSeek={seek}
        />
      )}

      {/* Controls */}
      <div className="mt-3 flex items-center justify-center gap-4">
        <button
          onClick={previous}
          disabled={loading || noDevice}
          className="p-2 text-muted-foreground hover:text-foreground transition disabled:opacity-40"
        >
          <SkipBack className="w-4 h-4" />
        </button>
        <button
          onClick={() => isPlaying ? pause() : play()}
          disabled={loading || noDevice}
          className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center neon-glow-primary hover:scale-105 transition disabled:opacity-40"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-5 h-5" fill="currentColor" />
          ) : (
            <Play className="w-5 h-5 ml-0.5" fill="currentColor" />
          )}
        </button>
        <motion.button
          onPointerDown={onSkipPressStart}
          onPointerUp={onSkipPressEnd}
          onPointerLeave={onSkipPressEnd}
          onPointerCancel={onSkipPressEnd}
          onContextMenu={(e) => e.preventDefault()}
          disabled={loading || noDevice || skipping}
          animate={skipPulse ? { scale: [1, 1.3, 1] } : { scale: 1 }}
          transition={skipPulse ? { duration: 0.6 } : { duration: 0.2 }}
          className={`p-2 transition disabled:opacity-40 ${skipPulse ? 'text-primary' : hardCut ? 'text-destructive' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <SkipForward className="w-4 h-4" />
        </motion.button>
      </div>

      {/* Volume */}
      <div className="mt-3 flex items-center gap-2">
        <VolumeIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <input
          type="range"
          min="0"
          max="100"
          value={volume}
          onChange={(e) => setVolume(parseInt(e.target.value))}
          className="flex-1 accent-primary h-1"
        />
      </div>

      {/* Crossfade slider */}
      {onCrossfadeChange !== undefined && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono text-muted-foreground">🎚️ Übergang</span>
            <span className="text-[10px] font-mono text-primary font-semibold">{crossfadeSeconds}s</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-muted-foreground/50 shrink-0">hart</span>
            <input
              type="range"
              min="0"
              max="12"
              value={crossfadeSeconds}
              onChange={(e) => onCrossfadeChange(parseInt(e.target.value))}
              className="flex-1 accent-primary h-1"
            />
            <span className="text-[9px] text-muted-foreground/50 shrink-0">smooth</span>
          </div>
        </div>
      )}
    </div>
  );
}