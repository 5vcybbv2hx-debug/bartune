import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Play, ExternalLink, Music2, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import EnergySlider from '@/components/generator/EnergySlider';
import GeneratorProgress from '@/components/generator/GeneratorProgress';
import GeneratorResult from '@/components/generator/GeneratorResult';

const SUGGESTION_CHIPS = ['80er', '90er', 'Latin', 'Jazz', 'Hip-Hop', 'Rock', 'Electronic', 'Sommerhits', 'Weihnachten', 'Oktoberfest'];
const DECADE_OPTIONS = ['Egal', '70er', '80er', '90er', '2000er', '2010er', 'Aktuell'];
const LENGTH_OPTIONS = [
  { label: '2 Stunden', sub: '~40 Songs', value: 40 },
  { label: '4 Stunden', sub: '~80 Songs', value: 80 },
  { label: 'Ganzer Abend', sub: '~120 Songs', value: 120 },
];
const ENERGY_EMOJIS = ['😴', '🌿', '🎵', '🔥', '⚡'];

function buildSteps(motto, songCount, decades) {
  const hasDecadeFilter = decades.length > 0 && !decades.includes('Egal');
  const steps = [
    { icon: '🔍', text: `Suche passende Songs für "${motto}"...`, done: 'Songs gefunden' },
    { icon: '🎵', text: 'Analysiere Audio-Features...', done: 'Songs passen zum Energie-Level' },
  ];
  if (hasDecadeFilter) {
    const labels = decades.filter(d => d !== 'Egal').join(', ');
    steps.push({ icon: '📅', text: `Filtere nach Jahrzehnt (${labels})...`, done: 'Songs verbleiben' });
  }
  steps.push({ icon: '✨', text: 'Erstelle Playlist in Spotify...', done: 'Playlist angelegt' });
  steps.push({ icon: '➕', text: `Füge ${songCount} Songs hinzu...`, done: 'Fertig!' });
  return steps;
}

export default function Generator() {
  const { player, spotifyConnected } = useOutletContext();

  const [motto, setMotto] = useState('');
  const [energyLevel, setEnergyLevel] = useState(3);
  const [songCount, setSongCount] = useState(80);
  const [decades, setDecades] = useState(['Egal']);
  const [playlistName, setPlaylistName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);

  const [status, setStatus] = useState('idle');
  const [activeStep, setActiveStep] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);

  const stepTimerRef = useRef(null);
  const fastForwardRef = useRef(null);

  useEffect(() => {
    if (!nameEdited) {
      const today = new Date().toLocaleDateString('de-DE');
      setPlaylistName(motto ? `${motto} · ${today}` : '');
    }
  }, [motto, nameEdited]);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await base44.entities.GeneratedPlaylist.list('-created_date', 5));
    } catch (e) {}
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  useEffect(() => {
    return () => {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
      if (fastForwardRef.current) clearInterval(fastForwardRef.current);
    };
  }, []);

  const steps = buildSteps(motto, songCount, decades);

  const handleGenerate = async () => {
    if (!spotifyConnected || !motto.trim()) return;

    setStatus('generating');
    setActiveStep(0);
    setError('');
    setResult(null);

    stepTimerRef.current = setInterval(() => {
      setActiveStep(prev => Math.min(prev + 1, steps.length - 1));
    }, 3500);

    try {
      const res = await base44.functions.invoke('generatePlaylist', {
        motto: motto.trim(),
        energy_level: energyLevel,
        song_count: songCount,
        decades,
        playlist_name: playlistName || `${motto} · ${new Date().toLocaleDateString('de-DE')}`,
      });

      if (stepTimerRef.current) clearInterval(stepTimerRef.current);

      if (res.data?.success) {
        setResult(res.data);
        fastForwardRef.current = setInterval(() => {
          setActiveStep(prev => {
            if (prev >= steps.length) {
              if (fastForwardRef.current) clearInterval(fastForwardRef.current);
              setTimeout(() => setStatus('result'), 600);
              return prev;
            }
            return prev + 1;
          });
        }, 400);
      } else {
        setError(res.data?.error || 'Unbekannter Fehler');
        setStatus('error');
      }
    } catch (e) {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
      setError(e.response?.data?.error || e.message || 'Fehler bei der Generierung');
      setStatus('error');
    }
  };

  const handleReset = () => {
    setStatus('idle');
    setResult(null);
    setError('');
    setMotto('');
    setNameEdited(false);
    loadHistory();
  };

  const toggleDecade = (decade) => {
    if (decade === 'Egal') {
      setDecades(['Egal']);
    } else {
      setDecades(prev => {
        const withoutEgal = prev.filter(d => d !== 'Egal');
        const next = withoutEgal.includes(decade)
          ? withoutEgal.filter(d => d !== decade)
          : [...withoutEgal, decade];
        return next.length === 0 ? ['Egal'] : next;
      });
    }
  };

  const handlePlayFromHistory = (playlistId) => {
    player.play(`spotify:playlist:${playlistId}`);
  };

  if (status === 'generating') {
    return <GeneratorProgress steps={steps} activeStep={activeStep} motto={motto} />;
  }

  if (status === 'result' && result) {
    return (
      <div className="px-4 py-6 md:px-8 md:py-8 max-w-3xl mx-auto">
        <GeneratorResult
          result={result}
          onPlay={() => player.play(`spotify:playlist:${result.playlist_id}`)}
          onReset={handleReset}
        />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="px-4 py-6 md:px-8 md:py-8 max-w-3xl mx-auto">
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-3" />
          <h2 className="text-lg font-bold mb-2">Generierung fehlgeschlagen</h2>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <button onClick={() => setStatus('idle')} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium">
            Zurück zum Formular
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-extrabold font-heading flex items-center gap-2">
          🎲 Playlist Generator
        </h1>
        <p className="text-sm text-muted-foreground">KI-gestützt — erstellt neue Spotify-Playlists aus deinem Motto</p>
      </div>

      {!spotifyConnected && (
        <div className="mb-6 rounded-2xl border border-accent/30 bg-accent/5 p-5 text-center">
          <Music2 className="w-8 h-8 text-accent mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Verbinde Spotify in den Settings, um Playlists zu generieren.</p>
        </div>
      )}

      {/* Motto */}
      <div className="mb-5">
        <label className="text-sm font-semibold mb-2 block">Playlist-Motto / Stimmung</label>
        <input
          type="text"
          value={motto}
          onChange={(e) => { setMotto(e.target.value); setNameEdited(false); }}
          placeholder="z.B. 80er Nacht, Latin Vibes, Oktoberfest, Lazy Sunday..."
          className="w-full px-4 py-3 rounded-xl bg-card border border-border text-base font-mono focus:ring-2 focus:ring-primary outline-none"
        />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {SUGGESTION_CHIPS.map(chip => (
            <button
              key={chip}
              onClick={() => { setMotto(chip); setNameEdited(false); }}
              className="px-3 py-1.5 rounded-full bg-secondary text-xs font-medium hover:bg-primary/20 hover:text-primary transition"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* Energy */}
      <div className="mb-5">
        <label className="text-sm font-semibold mb-2 block">Energie-Level</label>
        <EnergySlider value={energyLevel} onChange={setEnergyLevel} />
      </div>

      {/* Length */}
      <div className="mb-5">
        <label className="text-sm font-semibold mb-2 block">Playlist-Länge</label>
        <div className="flex gap-2">
          {LENGTH_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setSongCount(opt.value)}
              className={`flex-1 py-3 rounded-xl text-center transition ${
                songCount === opt.value
                  ? 'bg-primary text-primary-foreground neon-glow-primary'
                  : 'bg-card border border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <p className="text-sm font-bold">{opt.label}</p>
              <p className="text-[10px] font-mono opacity-80">{opt.sub}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Decades */}
      <div className="mb-5">
        <label className="text-sm font-semibold mb-2 block">Jahrzehnt (optional)</label>
        <div className="flex flex-wrap gap-2">
          {DECADE_OPTIONS.map(decade => {
            const selected = decades.includes(decade);
            return (
              <button
                key={decade}
                onClick={() => toggleDecade(decade)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  selected
                    ? 'bg-primary text-primary-foreground neon-glow-primary'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {decade}
              </button>
            );
          })}
        </div>
      </div>

      {/* Playlist name */}
      <div className="mb-6">
        <label className="text-sm font-semibold mb-2 block">Playlist-Name</label>
        <input
          type="text"
          value={playlistName}
          onChange={(e) => { setPlaylistName(e.target.value); setNameEdited(true); }}
          placeholder="Wird auto-ausgefüllt..."
          className="w-full px-4 py-3 rounded-xl bg-card border border-border text-sm font-mono focus:ring-2 focus:ring-primary outline-none"
        />
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={!motto.trim() || !spotifyConnected}
        className="w-full h-[60px] rounded-2xl bg-primary text-primary-foreground font-bold text-lg flex items-center justify-center gap-2 neon-glow-primary disabled:opacity-40 disabled:shadow-none transition hover:scale-[1.01]"
      >
        <span className="text-2xl">🎲</span> Playlist erstellen
      </button>

      {/* History */}
      {history.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Zuletzt generiert</h2>
          <div className="space-y-2">
            {history.map(pl => (
              <div key={pl.id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border">
                <div className="text-2xl">{ENERGY_EMOJIS[(pl.energy_level || 3) - 1]}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono font-semibold truncate">{pl.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {pl.song_count} Songs · {new Date(pl.created_at || pl.created_date).toLocaleDateString('de-DE')}
                  </p>
                </div>
                <button
                  onClick={() => handlePlayFromHistory(pl.spotify_playlist_id)}
                  className="p-2 rounded-lg bg-success/10 text-success hover:bg-success/20 transition"
                >
                  <Play className="w-4 h-4" fill="currentColor" />
                </button>
                <a
                  href={`https://open.spotify.com/playlist/${pl.spotify_playlist_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}