import React from 'react';
import CrossfadeVisual from './CrossfadeVisual';

export default function CrossfadeSlider({ value, onChange }) {
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-mono text-muted-foreground">Übergang</span>
        <span className="text-[10px] font-mono text-primary font-semibold">{value}s</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[9px] text-muted-foreground/60 shrink-0">hart</span>
        <input
          type="range"
          min="0"
          max="12"
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="flex-1 accent-primary h-1"
        />
        <span className="text-[9px] text-muted-foreground/60 shrink-0">smooth</span>
      </div>
      <div className="flex justify-center mt-1">
        <CrossfadeVisual seconds={value} />
      </div>
    </div>
  );
}