import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Check, X, Music2, Clock, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function Wunschzettel() {
  const { settings } = useOutletContext();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState({});
  const [rejectedIds, setRejectedIds] = useState([]);

  const load = async () => {
    try {
      const list = await base44.entities.WunschzettelEintrag.filter({ status: 'Ausstehend' }, '-submitted_at', 50);
      setRequests(list);
    } catch (e) {}
    setLoading(false);
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleApprove = async (req) => {
    setProcessing(p => ({ ...p, [req.id]: 'approving' }));
    try {
      let trackId = req.spotify_track_id;
      let trackCover = req.track_cover;

      if (!trackId) {
        const searchRes = await base44.functions.invoke('spotifyApi', {
          action: 'searchTracks',
          params: { query: `${req.song_title} ${req.artist}`.trim() }
        });
        const tracks = searchRes.data?.tracks?.items || [];
        if (tracks.length === 0) {
          setProcessing(p => ({ ...p, [req.id]: 'notfound' }));
          setTimeout(() => setProcessing(p => ({ ...p, [req.id]: null })), 3000);
          return;
        }
        trackId = tracks[0].id;
        trackCover = tracks[0].album?.images?.[0]?.url || '';
      }

      if (settings?.wunschzettel_playlist_id) {
        await base44.functions.invoke('spotifyApi', {
          action: 'addToPlaylist',
          params: { playlist_id: settings.wunschzettel_playlist_id, track_id: trackId }
        });
      }

      await base44.entities.WunschzettelEintrag.update(req.id, {
        status: 'Genehmigt',
        spotify_track_id: trackId,
        track_cover: trackCover,
      });

      setRequests(prev => prev.filter(r => r.id !== req.id));
    } catch (e) {
      setProcessing(p => ({ ...p, [req.id]: 'error' }));
      setTimeout(() => setProcessing(p => ({ ...p, [req.id]: null })), 3000);
    }
    setProcessing(p => ({ ...p, [req.id]: p[req.id] === 'approving' ? null : p[req.id] }));
  };

  const handleReject = async (req) => {
    setRejectedIds(prev => [...prev, req.id]);
    await base44.entities.WunschzettelEintrag.update(req.id, { status: 'Abgelehnt' });
    setTimeout(() => {
      setRequests(prev => prev.filter(r => r.id !== req.id));
      setRejectedIds(prev => prev.filter(id => id !== req.id));
    }, 1500);
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const diff = Date.now() - new Date(ts).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'gerade eben';
    if (min < 60) return `vor ${min}min`;
    return `vor ${Math.floor(min / 60)}h`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-extrabold font-heading">Wunschzettel</h1>
        <p className="text-sm text-muted-foreground">
          {requests.length} {requests.length === 1 ? 'offener Wunsch' : 'offene Wünsche'} · Live-Update alle 10s
        </p>
      </div>

      {!settings?.wunschzettel_playlist_id && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-accent/10 border border-accent/30 text-accent text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Keine Wunsch-Playlist in den Settings hinterlegt — Wünsche werden genehmigt aber nicht hinzugefügt.</span>
        </div>
      )}

      <div className="space-y-3">
        {requests.map(req => {
          const isRejected = rejectedIds.includes(req.id);
          const procState = processing[req.id];

          return (
            <div
              key={req.id}
              className={`flex items-center gap-3 p-4 rounded-xl bg-card border border-border transition-all ${
                isRejected ? 'animate-blink-red border-destructive' : ''
              }`}
            >
              {/* Cover */}
              {req.track_cover ? (
                <img src={req.track_cover} alt="" className="w-12 h-12 rounded-md object-cover shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-md bg-secondary flex items-center justify-center shrink-0">
                  <Music2 className="w-5 h-5 text-muted-foreground" />
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono font-semibold truncate">{req.song_title}</p>
                {req.artist && <p className="text-xs text-muted-foreground truncate">{req.artist}</p>}
                <div className="flex items-center gap-2 mt-0.5">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{formatTime(req.submitted_at)}</span>
                  {req.guest_name && <span className="text-xs text-muted-foreground">· {req.guest_name}</span>}
                </div>
              </div>

              {/* Status / Actions */}
              {procState === 'approving' ? (
                <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin shrink-0" />
              ) : procState === 'notfound' ? (
                <span className="text-xs text-accent shrink-0">Nicht gefunden</span>
              ) : procState === 'error' ? (
                <span className="text-xs text-destructive shrink-0">Fehler</span>
              ) : (
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleApprove(req)}
                    className="w-10 h-10 rounded-lg bg-success/10 text-success flex items-center justify-center hover:bg-success/20 transition"
                    title="Genehmigen"
                  >
                    <Check className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleReject(req)}
                    className="w-10 h-10 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center hover:bg-destructive/20 transition"
                    title="Ablehnen"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {requests.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Music2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Keine offenen Wünsche</p>
          <p className="text-xs mt-1">Gäste können über den QR-Code Songs einreichen</p>
        </div>
      )}
    </div>
  );
}