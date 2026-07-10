import { useState, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from '@/components/ui/use-toast';

export function useSkipControl(player, crossfadeSeconds, handleCrossfadeChange) {
  const [skipping, setSkipping] = useState(false);
  const [hardCut, setHardCut] = useState(false);
  const [skipPulse, setSkipPulse] = useState(false);
  const longPressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);
  const isPressingRef = useRef(false);

  const smoothSkip = useCallback(async () => {
    setSkipping(true);
    setSkipPulse(true);
    try {
      const seconds = crossfadeSeconds || 5;
      await handleCrossfadeChange(seconds);
      await new Promise(r => setTimeout(r, 500));
      await base44.functions.invoke('spotifyApi', { action: 'next' });
      setTimeout(() => player.refresh(), 1500);
    } catch (e) {}
    setSkipping(false);
    setTimeout(() => setSkipPulse(false), 600);
  }, [crossfadeSeconds, handleCrossfadeChange, player]);

  const hardCutSkip = useCallback(async () => {
    setHardCut(true);
    toast({ title: '⚡ Hard Cut' });
    setSkipping(true);
    try {
      await handleCrossfadeChange(0);
      await new Promise(r => setTimeout(r, 200));
      await base44.functions.invoke('spotifyApi', { action: 'next' });
      setTimeout(() => player.refresh(), 1500);
    } catch (e) {}
    setSkipping(false);
    setTimeout(() => setHardCut(false), 1000);
  }, [handleCrossfadeChange, player]);

  const onSkipPressStart = useCallback(() => {
    isPressingRef.current = true;
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      hardCutSkip();
    }, 500);
  }, [hardCutSkip]);

  const onSkipPressEnd = useCallback(() => {
    if (!isPressingRef.current) return;
    isPressingRef.current = false;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (!longPressTriggeredRef.current) {
      smoothSkip();
    }
  }, [smoothSkip]);

  return { skipping, hardCut, skipPulse, onSkipPressStart, onSkipPressEnd };
}