import React from 'react';

/**
 * SVG crossfade visualization.
 * 0s = hard vertical cut line
 * 1-5s = slight S-curve overlap
 * 6-12s = wide soft S-curve overlap
 */
export default function CrossfadeVisual({ seconds, className = '' }) {
  const w = 120;
  const h = 40;
  const mid = h / 2;

  // Width of the crossfade zone scales with seconds
  const zoneWidth = seconds === 0 ? 0 : 20 + (seconds / 12) * 60;
  const centerX = w / 2;
  const zoneStart = centerX - zoneWidth / 2;
  const zoneEnd = centerX + zoneWidth / 2;

  // Outgoing line: flat at top, fades down
  // Incoming line: fades up from bottom to top
  const outPath = seconds === 0
    ? `M 0 ${mid} L ${centerX} ${mid} L ${centerX} ${h} L ${centerX} 0 L ${centerX} ${mid} L ${w} ${mid}`
    : `M 0 ${mid} L ${zoneStart} ${mid} C ${zoneStart + zoneWidth * 0.3} ${mid}, ${zoneEnd - zoneWidth * 0.3} ${h}, ${zoneEnd} ${h} L ${w} ${h}`;

  const inPath = seconds === 0
    ? `M 0 ${mid} L ${centerX} ${mid} L ${centerX} ${h} L ${centerX} 0 L ${centerX} ${mid} L ${w} ${mid}`
    : `M 0 ${0} L ${zoneStart} ${0} C ${zoneStart + zoneWidth * 0.3} ${0}, ${zoneEnd - zoneWidth * 0.3} ${mid}, ${zoneEnd} ${mid} L ${w} ${mid}`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={className}>
      <defs>
        <linearGradient id="fadeOut" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.6" />
          <stop offset={`${zoneStart < centerX ? (zoneStart / w) * 100 : 50}%`} stopColor="hsl(var(--muted-foreground))" stopOpacity="0.6" />
          <stop offset={`${(zoneEnd / w) * 100}%`} stopColor="hsl(var(--muted-foreground))" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="fadeIn" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset={`${(zoneStart / w) * 100}%`} stopColor="hsl(var(--primary))" stopOpacity="0" />
          <stop offset={`${(zoneEnd / w) * 100}%`} stopColor="hsl(var(--primary))" stopOpacity="1" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="1" />
        </linearGradient>
      </defs>

      {/* Outgoing track (fading out) */}
      <path d={outPath} fill="none" stroke="url(#fadeOut)" strokeWidth="2.5" strokeLinecap="round" />

      {/* Incoming track (fading in) */}
      <path d={inPath} fill="none" stroke="url(#fadeIn)" strokeWidth="2.5" strokeLinecap="round" />

      {/* Center marker */}
      {seconds === 0 && (
        <line x1={centerX} y1="4" x2={centerX} y2={h - 4} stroke="hsl(var(--destructive))" strokeWidth="1.5" strokeDasharray="2 2" />
      )}
    </svg>
  );
}