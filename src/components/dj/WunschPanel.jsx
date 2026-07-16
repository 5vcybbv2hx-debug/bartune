import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Check, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';

export default function WunschPanel({ wunschzettelActive, onAccept }) {
  const [requests, setRequests] = useState([]);
  const [slidingOut, setSlidingOut] = useState(null);
  const [accepting, setAccepting] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const { toast } = useToast();

  const loadRequests = useCallback(async () => {
    try {
      const items = await base44.entities.WunschzettelEintrag.filter({ status: 'Ausstehend' });
      items.sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at));
      setRequests(items);
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (!wunschzettelActive) return;
    loadRequests();
    const interval = setInterval(loadRequests, 10000);
    return () => clearInterval(interval);
  }, [wunschzettelActive, loadRequests]);

  const handleAccept = async (wunsch) => {
    if (accepting) return;
    setAccepting(wunsch.id);
    setConfirmingId(null);
    try {
      let track = null;
      if (wunsch.spotify_track_id) {
        const res = await base44.functions.invoke('spotifyApi', {
          action: 'getTrack',
          params: { track_id: wunsch.spotify_track_id },
        });
        if (res.data && !res.data._notOk) {
          track = {
            id: res.data.id,
            name: res.data.name,
            artists: res.data.artists,
            duration_ms: res.data.duration_ms,
            album: res.data.album,
          };
        }
      }
      if (!track) {
        track = {
          id: wunsch.spotify_track_id || ('manual_' + wunsch.id),
          name: wunsch.song_title,
          artists: [{ name: wunsch.artist || '' }],
          duration_ms: 0,
          album: { images: [{ url: wunsch.track_cover || '' }] },
        };
      }

      await onAccept(track);
      await base44.entities.WunschzettelEintrag.update(wunsch.id, { status: 'Genehmigt' });

      setSlidingOut({ id: wunsch.id, direction: 'right' });
      toast({ title: `🎵 ${wunsch.song_title} als nächstes in der Queue` });

      setTimeout(() => {
        setSlidingOut(null);
        loadRequests();
      }, 300);
    } catch (e) {
      toast({ title: 'Fehler beim Annehmen', variant: 'destructive' });
    }
    setAccepting(null);
  };

  const handleReject = async (wunsch) => {
    try {
      await base44.entities.WunschzettelEintrag.update(wunsch.id, { status: 'Abgelehnt' });
      setSlidingOut({ id: wunsch.id, direction: 'left' });
      setTimeout(() => {
        setSlidingOut(null);
        loadRequests();
      }, 300);
    } catch (e) {}
  };

  if (!wunschzettelActive) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Mic className="w-4 h-4 text-accent" />
        <h3 className="text-sm font-bold">Musikwünsche</h3>
        <span className="text-xs text-muted-foreground font-mono">({requests.length})</span>
      </div>

      {requests.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">
          Keine offenen Wünsche 🎵
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {requests.map(wunsch => (
              <motion.div
                key={wunsch.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={
                  slidingOut?.id === wunsch.id
                    ? { opacity: 0, x: slidingOut.direction === 'right' ? 100 : -100 }
                    : { opacity: 1, x: 0 }
                }
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3 }}
                className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30"
              >
                {wunsch.track_cover ? (
                  <img src={wunsch.track_cover} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center shrink-0">
                    <span className="text-xs">🎵</span>
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="text-xs font-mono font-semibold truncate">{wunsch.song_title}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {wunsch.artist || '—'}
                    {wunsch.guest_name ? ` · ${wunsch.guest_name}` : ''}
                    {wunsch.submitted_at ? ` · ${new Date(wunsch.submitted_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : ''}
                  </p>
                </div>

                {confirmingId === wunsch.id ? (
                  <>
                    <span className="text-[9px] text-accent font-mono shrink-0 animate-pulse">Sicher?</span>
                    <button
                      onClick={() => handleAccept(wunsch)}
                      disabled={accepting === wunsch.id}
                      className="p-1.5 rounded-lg bg-success/30 text-success hover:bg-success/40 transition disabled:opacity-50 animate-pulse"
                      title="Bestätigen"
                    >
                      {accepting === wunsch.id ? (
                        <div className="w-3.5 h-3.5 border-2 border-success/30 border-t-success rounded-full animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => setConfirmingId(null)}
                      className="p-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition"
                      title="Abbrechen"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setConfirmingId(wunsch.id)}
                      disabled={accepting === wunsch.id}
                      className="p-1.5 rounded-lg bg-success/20 text-success hover:bg-success/30 transition disabled:opacity-50"
                      title="Annehmen"
                    >
                      {accepting === wunsch.id ? (
                        <div className="w-3.5 h-3.5 border-2 border-success/30 border-t-success rounded-full animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => handleReject(wunsch)}
                      className="p-1.5 rounded-lg bg-destructive/10 text-destructive/60 hover:bg-destructive/20 hover:text-destructive transition"
                      title="Ablehnen"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}