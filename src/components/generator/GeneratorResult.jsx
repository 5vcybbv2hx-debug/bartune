import React from 'react';
import { Link } from 'react-router-dom';
import { Play, ExternalLink } from 'lucide-react';

const ENERGY_EMOJIS = ['😴', '🌿', '🎵', '🔥', '⚡'];

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl bg-card border border-border p-3 text-center">
      <p className="text-lg font-bold font-mono text-primary">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

export default function GeneratorResult({ result, onPlay, onReset }) {
  return (
    <div>
      <div className="rounded-2xl border border-border bg-card p-6 md:p-8 text-center mb-6">
        {result.cover ? (
          <img src={result.cover} alt="" className="w-40 h-40 md:w-48 md:h-48 rounded-2xl object-cover mx-auto mb-4 shadow-2xl" />
        ) : (
          <div className="w-40 h-40 md:w-48 md:h-48 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #3D5AFE, #B44FFF, #FF3D9A)' }}>
            <span className="text-6xl">🎵</span>
          </div>
        )}

        <h2 className="text-xl md:text-2xl font-bold font-heading mb-2">{result.playlist_name}</h2>
        <p className="text-sm text-success font-mono mb-1">✅ {result.song_count} Songs</p>
        <p className="text-xs text-muted-foreground mb-5">
          {result.profil_name ? (
            <>📂 Dem Profil '{result.profil_name}' zugeordnet</>
          ) : (
            <>Keinem Profil zugeordnet — <Link to="/playlists" className="text-primary underline">jetzt zuordnen</Link></>
          )}
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={onPlay}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-success text-success-foreground font-semibold neon-glow-success hover:scale-105 transition"
          >
            <Play className="w-4 h-4" fill="currentColor" /> Jetzt abspielen
          </button>
          <a
            href={result.spotify_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#1DB954] text-white font-semibold hover:scale-105 transition"
          >
            <ExternalLink className="w-4 h-4" /> In Spotify öffnen
          </a>
        </div>

        <button onClick={onReset} className="mt-5 text-sm text-muted-foreground hover:text-primary transition">
          ↺ Weitere Playlist erstellen
        </button>
      </div>

      {result.stats && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Gefunden" value={result.stats.found} />
          <StatCard label="Nach Filter" value={result.stats.filtered} />
          <StatCard label="Hinzugefügt" value={result.song_count} />
        </div>
      )}
    </div>
  );
}