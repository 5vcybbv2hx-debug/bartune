import React from 'react';

const LEVELS = [
  { value: 1, emoji: '😴', label: 'Entspannt' },
  { value: 2, emoji: '🌿', label: 'Locker' },
  { value: 3, emoji: '🎵', label: 'Ausgewogen' },
  { value: 4, emoji: '🔥', label: 'Energetisch' },
  { value: 5, emoji: '⚡', label: 'Turbo' },
];

const COLORS = ['#3D5AFE', '#6C5BFF', '#B44FFF', '#E44FFF', '#FF3D9A'];

export default function EnergySlider({ value, onChange }) {
  return (
    <div className="flex gap-2">
      {LEVELS.map((level, i) => {
        const isActive = value === level.value;
        const isPast = value > level.value;
        const color = COLORS[i];
        return (
          <button
            key={level.value}
            onClick={() => onChange(level.value)}
            className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl transition-all ${
              isActive ? 'scale-105' : 'opacity-50 hover:opacity-80'
            }`}
            style={{
              backgroundColor: isActive ? `${color}15` : 'hsl(var(--card))',
              border: `2px solid ${isActive ? color : 'hsl(var(--border))'}`,
              boxShadow: isActive ? `0 0 16px ${color}40` : 'none',
            }}
          >
            <span className="text-xl md:text-2xl">{level.emoji}</span>
            <span className="text-[9px] md:text-[10px] font-medium whitespace-nowrap">{level.label}</span>
          </button>
        );
      })}
    </div>
  );
}