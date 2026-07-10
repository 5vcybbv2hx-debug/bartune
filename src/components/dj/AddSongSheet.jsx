import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

function formatTime(ms) {
  if (!ms || ms < 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export default function AddSongSheet({ open, onClose, onAdd }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const check = () => setIsDesktop(window.matchMedia('(min-width: 768px)').matches);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await base44.functions.invoke('spotifyApi', {
          action: 'searchTracks',
          params: { query, limit: 15 },
        });
        setResults(res.data?.tracks?.items || []);
      } catch (e) {
        setResults([]);
      }
      setSearching(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  const handleAdd = async (track) => {
    setAdding(true);
    try {
      await onAdd(track);
    } finally {
      setAdding(false);
      setQuery('');
      setResults([]);
      onClose();
    }
  };

  const handleClose = () => {
    setQuery('');
    setResults([]);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/60 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />
          <motion.div
            className={`fixed z-50 bg-card flex flex-col ${
              isDesktop
                ? 'top-1/2 left-1/2 w-[400px] h-[500px] rounded-2xl border border-border'
                : 'bottom-0 left-0 right-0 rounded-t-3xl border-t border-border max-h-[70vh]'
            }`}
            initial={isDesktop ? { opacity: 0, scale: 0.9, x: '-50%', y: '-50%' } : { y: '100%' }}
            animate={isDesktop ? { opacity: 1, scale: 1, x: '-50%', y: '-50%' } : { y: 0 }}
            exit={isDesktop ? { opacity: 0, scale: 0.9, x: '-50%', y: '-50%' } : { y: '100%' }}
            transition={isDesktop ? { duration: 0.2 } : { type: 'spring', damping: 30, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="text-sm font-bold">Song hinzufügen</h3>
              <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-secondary transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search */}
            <div className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                  placeholder="Song oder Artist suchen..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-secondary border border-border text-sm font-mono focus:ring-2 focus:ring-primary outline-none"
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-spin" />
                )}
              </div>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1" style={{ minHeight: isDesktop ? 300 : undefined }}>
              {query.length < 2 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  Mindestens 2 Zeichen eingeben
                </p>
              ) : results.length === 0 && !searching ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  Keine Ergebnisse
                </p>
              ) : (
                results.map(track => (
                  <button
                    key={track.id}
                    onClick={() => handleAdd(track)}
                    disabled={adding}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 transition text-left disabled:opacity-50"
                  >
                    {track.album?.images?.[0]?.url ? (
                      <img src={track.album.images[0].url} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-secondary flex items-center justify-center shrink-0">
                        <span className="text-sm">🎵</span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-mono font-semibold truncate">{track.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {track.artists?.map(a => a.name).join(', ')}
                      </p>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground shrink-0">
                      {formatTime(track.duration_ms)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}