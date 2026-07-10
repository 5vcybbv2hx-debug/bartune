import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function NextTrackLine({ queue, blink }) {
  const nextTrack = queue[0];

  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <span className="text-[10px] font-mono text-muted-foreground shrink-0">Danach:</span>
      <AnimatePresence mode="wait">
        {nextTrack ? (
          <motion.div
            key={nextTrack.id}
            initial={{ opacity: 0 }}
            animate={blink ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={blink ? { duration: 0.5 } : { duration: 0.2 }}
            className="flex items-center gap-1.5 min-w-0"
          >
            {nextTrack.album_cover_url ? (
              <img src={nextTrack.album_cover_url} alt="" className="w-6 h-6 rounded object-cover shrink-0" />
            ) : (
              <div className="w-6 h-6 rounded bg-secondary flex items-center justify-center shrink-0">
                <span className="text-[8px]">🎵</span>
              </div>
            )}
            <span className="text-[11px] font-mono truncate opacity-60">
              {nextTrack.track_name} · {nextTrack.artist}
            </span>
          </motion.div>
        ) : (
          <motion.span
            key="empty"
            initial={{ opacity: 0 }}
            animate={blink ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={blink ? { duration: 0.5 } : { duration: 0.2 }}
            className="text-[11px] font-mono text-muted-foreground opacity-60"
          >
            nächster Song aus Playlist
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}