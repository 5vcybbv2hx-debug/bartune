import { useState, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from '@/components/ui/use-toast';

export function useSkipControl(player, crossfadeSeconds, sessionId, onSkipComplete) {
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
      const res = await base44.functions.invoke('skipToNext', {
        session_id: sessionId,
        crossfade_seconds: crossfadeSeconds || 5,
      });
      if (res.data?.noDevice) {
        toast({ title: '⚠️ Kein aktives Spotify-Gerät', variant: 'destructive' });
      }
      setTimeout(() => player.refresh(), 1500);
      if (onSkipComplete) onSkipComplete();
    } catch (e) {}
    setSkipping(false);
    setTimeout(() => setSkipPulse(false), 600);
  }, [crossfadeSeconds, sessionId, player, onSkipComplete]);

  const hardCutSkip = useCallback(async () => {
    setHardCut(true);
    toast({ title: '⚡ Hard Cut' });
    setSkipping(true);
    try {
      const res = await base44.functions.invoke('skipToNext', {
        session_id: sessionId,
        hard_cut: true,
      });
      if (res.data?.noDevice) {
        toast({ title: '⚠️ Kein aktives Spotify-Gerät', variant: 'destructive' });
      }
      setTimeout(() => player.refresh(), 1500);
      if (onSkipComplete) onSkipComplete();
    } catch (e) {}
    setSkipping(false);
    setTimeout(() => setHardCut(false), 1000);
  }, [sessionId, player, onSkipComplete]);

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