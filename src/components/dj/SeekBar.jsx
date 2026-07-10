import React, { useState, useRef, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';

function formatTime(ms) {
  if (!ms || ms < 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export default function SeekBar({ progress, duration, skipping, onSeek }) {
  const { toast } = useToast();
  const barRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [dragMs, setDragMs] = useState(null);

  const pct = duration > 0
    ? Math.min(100, Math.max(0, ((dragging ? dragMs : progress) / duration) * 100))
    : 0;
  const displayMs = dragging ? dragMs : progress;
  const active = dragging || hovering;

  const calcMs = useCallback((clientX) => {
    const rect = barRef.current.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.floor(ratio * duration);
  }, [duration]);

  const handlePointerDown = useCallback((e) => {
    if (!duration) return;
    e.preventDefault();
    setDragging(true);
    setDragMs(calcMs(e.clientX));
  }, [duration, calcMs]);

  const handlePointerMove = useCallback((e) => {
    if (!dragging) return;
    setDragMs(calcMs(e.clientX));
  }, [dragging, calcMs]);

  const handlePointerUp = useCallback(async () => {
    if (!dragging) return;
    const targetMs = dragMs;
    setDragging(false);
    setDragMs(null);
    const result = await onSeek(targetMs);
    if (result?.noDevice) {
      toast({ title: '⚠️ Kein aktives Spotify-Gerät', variant: 'destructive' });
    }
  }, [dragging, dragMs, onSeek, toast]);

  return (
    <div className="mt-3 flex items-center gap-2">
      <span className={`text-[10px] font-mono w-8 text-right tabular-nums ${active ? 'text-primary' : 'text-muted-foreground'}`}>
        {formatTime(displayMs)}
      </span>
      <div
        ref={barRef}
        className="relative flex-1 cursor-pointer touch-none py-1.5"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => { setHovering(false); if (dragging) handlePointerUp(); }}
        onPointerEnter={() => setHovering(true)}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        {/* Track */}
        <div
          className={`rounded-full bg-secondary/50 transition-all duration-150 ${active ? 'h-2' : 'h-1'}`}
        >
          {/* Fill */}
          <div
            className="rounded-full transition-none"
            style={{
              width: `${pct}%`,
              height: '100%',
              backgroundColor: 'hsl(var(--primary))',
              opacity: skipping ? 0.3 : 1,
            }}
          />
        </div>
        {/* Drag handle */}
        {active && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.6)] border-2 border-card transition-transform"
            style={{ left: `${pct}%` }}
          />
        )}
      </div>
      <span className="text-[10px] font-mono text-muted-foreground w-8">{formatTime(duration)}</span>
    </div>
  );
}