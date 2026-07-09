import React, { useState, useEffect, useRef } from 'react';
import { Music2, Search, Send, CheckCircle2, Clock } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const COOLDOWN_MS = 10 * 60 * 1000;

export default function WunschzettelGuest() {
  const [songTitle, setSongTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [guestName, setGuestName] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [searching, setSearching] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const searchTimer = useRef(null);

  // Check cooldown on mount
  useEffect(() => {
    const checkCooldown = () => {
      const last = localStorage.getItem('bartune_last_submit');
      if (last) {
        const remaining = COOLDOWN_MS - (Date.now() - parseInt(last));
        if (remaining > 0) {
          setCooldownRemaining(remaining);
        }
      }
    };
    checkCooldown();
    const interval = setInterval(checkCooldown, 1000);
    return () => clearInterval(interval);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!songTitle.trim() || selectedTrack) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await base44.functions.invoke('spotifyGuestSearch', {
          query: `${songTitle} ${artist}`.trim()
        });
        setSearchResults(res.data?.tracks || []);
      } catch (e) {
        setSearchResults([]);
      }
      setSearching(false);
    }, 500);
    return () => clearTimeout(searchTimer.current);
  }, [songTitle, artist, selectedTrack]);

  const handleSubmit = async () => {
    if (!songTitle.trim() || cooldownRemaining > 0 || submitting) return;
    setSubmitting(true);
    try {
      await base44.functions.invoke('submitGuestRequest', {
        song_title: selectedTrack ? selectedTrack.name : songTitle,
        artist: selectedTrack ? selectedTrack.artists : artist,
        spotify_track_id: selectedTrack?.id || '',
        track_cover: selectedTrack?.cover || '',
        guest_name: guestName,
      });
      localStorage.setItem('bartune_last_submit', Date.now().toString());
      setSubmitted(true);
      setCooldownRemaining(COOLDOWN_MS);
    } catch (e) {
      alert('Fehler beim Einreichen. Bitte versuche es später erneut.');
    }
    setSubmitting(false);
  };

  const formatCooldown = (ms) => {
    const min = Math.floor(ms / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  // Submitted state
  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-full bg-success/10 border border-success/30 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-10 h-10 text-success" />
          </div>
          <h1 className="text-xl font-bold mb-2">Danke! 🎵</h1>
          <p className="text-sm text-muted-foreground mb-4">
            Dein Wunsch wurde eingereicht. Der Barkeeper entscheidet, ob er gespielt wird.
          </p>
          <button
            onClick={() => {
              setSubmitted(false);
              setSongTitle('');
              setArtist('');
              setGuestName('');
              setSelectedTrack(null);
            }}
            className="text-sm text-primary hover:underline"
          >
            Nochmal wünschen (in {formatCooldown(cooldownRemaining)})
          </button>
        </div>
      </div>
    );
  }

  // Cooldown state
  if (cooldownRemaining > 0 && !submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center mx-auto mb-4">
            <Clock className="w-10 h-10 text-accent" />
          </div>
          <h1 className="text-xl font-bold mb-2">Einen Moment!</h1>
          <p className="text-sm text-muted-foreground mb-2">
            Du kannst wieder in {formatCooldown(cooldownRemaining)} einen neuen Wunsch einreichen.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-6 pt-4">
          <div className="text-4xl mb-2">🎵</div>
          <h1 className="text-xl font-bold font-heading">BarTune</h1>
          <p className="text-sm text-muted-foreground">Musikwunsch einreichen</p>
        </div>

        {/* Form */}
        <div className="space-y-3 mb-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Song-Titel *</label>
            <input
              type="text"
              value={songTitle}
              onChange={(e) => { setSongTitle(e.target.value); setSelectedTrack(null); }}
              placeholder="z.B. Hotel California"
              className="w-full px-4 py-3 rounded-xl bg-card border border-border text-sm font-mono focus:ring-2 focus:ring-primary outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Interpret</label>
            <input
              type="text"
              value={artist}
              onChange={(e) => { setArtist(e.target.value); setSelectedTrack(null); }}
              placeholder="z.B. Eagles"
              className="w-full px-4 py-3 rounded-xl bg-card border border-border text-sm font-mono focus:ring-2 focus:ring-primary outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Dein Name (optional)</label>
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="z.B. Tom"
              className="w-full px-4 py-3 rounded-xl bg-card border border-border text-sm font-mono focus:ring-2 focus:ring-primary outline-none"
            />
          </div>
        </div>

        {/* Selected track */}
        {selectedTrack && (
          <div className="mb-4 p-3 rounded-xl bg-success/10 border border-success/30 flex items-center gap-3">
            {selectedTrack.cover && <img src={selectedTrack.cover} alt="" className="w-10 h-10 rounded" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-mono font-semibold truncate">{selectedTrack.name}</p>
              <p className="text-xs text-muted-foreground truncate">{selectedTrack.artists}</p>
            </div>
            <button
              onClick={() => setSelectedTrack(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>
        )}

        {/* Search results */}
        {songTitle.trim() && !selectedTrack && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {searching ? 'Suche...' : 'Spotify-Treffer — tippe zum Auswählen'}
              </span>
            </div>
            <div className="space-y-1.5">
              {searchResults.map(track => (
                <button
                  key={track.id}
                  onClick={() => {
                    setSelectedTrack(track);
                    setSongTitle(track.name);
                    setArtist(track.artists);
                  }}
                  className="w-full flex items-center gap-3 p-2 rounded-lg bg-card border border-border hover:border-primary/40 transition text-left"
                >
                  {track.cover ? (
                    <img src={track.cover} alt="" className="w-10 h-10 rounded shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded bg-secondary flex items-center justify-center shrink-0">
                      <Music2 className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-mono font-semibold truncate">{track.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{track.artists}</p>
                  </div>
                </button>
              ))}
              {!searching && searchResults.length === 0 && songTitle.trim().length > 1 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Keine Treffer — trotzdem einreichen als Freitext.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!songTitle.trim() || submitting}
          className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 neon-glow-primary disabled:opacity-40 disabled:shadow-none transition"
        >
          {submitting ? (
            <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
          ) : (
            <>
              <Send className="w-4 h-4" /> Wunsch einreichen
            </>
          )}
        </button>
      </div>
    </div>
  );
}