import React from 'react';

export default function MoodProfileCard({ profile, isActive, playlistCount, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`relative rounded-2xl p-5 text-left transition-all duration-300 ${
        isActive ? 'scale-[1.02] animate-pulse-neon' : 'hover:scale-[1.01]'
      }`}
      style={{
        backgroundColor: 'hsl(var(--card))',
        border: `2px solid ${isActive ? profile.color : 'hsl(var(--border))'}`,
        boxShadow: isActive ? `0 0 25px ${profile.color}50, 0 0 50px ${profile.color}20` : 'none',
      }}
    >
      {/* Active badge */}
      {isActive && (
        <div
          className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider"
          style={{ backgroundColor: profile.color, color: '#000' }}
        >
          AKTIV
        </div>
      )}

      {/* Emoji */}
      <div className="text-5xl mb-3" style={{ filter: isActive ? `drop-shadow(0 0 12px ${profile.color}80)` : 'none' }}>
        {profile.emoji}
      </div>

      {/* Name */}
      <h3 className="text-lg font-bold mb-1" style={{ color: isActive ? profile.color : 'hsl(var(--foreground))' }}>
        {profile.name}
      </h3>

      {/* Description */}
      <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{profile.description}</p>

      {/* Playlist count */}
      <div className="flex items-center gap-1.5 text-xs">
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: playlistCount > 0 ? profile.color : 'hsl(var(--muted-foreground))' }}
        />
        <span className="text-muted-foreground font-mono">
          {playlistCount} {playlistCount === 1 ? 'Playlist' : 'Playlists'}
        </span>
      </div>
    </button>
  );
}