import { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

export function useSpotifyPlayer(connected) {
  const [playback, setPlayback] = useState(null);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [noDeviceCount, setNoDeviceCount] = useState(0);
  const pollRef = useRef(null);
  const interpolateRef = useRef(null);
  const lastPollProgressRef = useRef(0);

  const fetchPlayback = useCallback(async () => {
    if (!connected) return;
    try {
      const res = await base44.functions.invoke('spotifyApi', { action: 'getPlaybackState' });
      setPlayback(res.data);
      if (res.data?.item) {
        const realProgress = res.data.progress_ms || 0;
        const interpolated = lastPollProgressRef.current;
        const diff = Math.abs(realProgress - interpolated);
        if (diff > 3000) {
          setProgress(realProgress);
        } else if (realProgress < interpolated) {
          // keep interpolating, don't jump backwards
        } else {
          setProgress(realProgress);
        }
        lastPollProgressRef.current = realProgress;
        setNoDeviceCount(0);
      } else if (!res.data?.device) {
        setNoDeviceCount(c => c + 1);
      }
    } catch (e) {}
  }, [connected]);

  useEffect(() => {
    if (!connected) return;
    fetchPlayback();
    pollRef.current = setInterval(fetchPlayback, 5000);
    return () => clearInterval(pollRef.current);
  }, [connected, fetchPlayback]);

  useEffect(() => {
    if (!playback?.is_playing || !playback?.item) return;
    interpolateRef.current = setInterval(() => {
      setProgress(p => {
        const max = playback.item.duration_ms;
        if (p >= max) return p;
        return p + 1000;
      });
    }, 1000);
    return () => clearInterval(interpolateRef.current);
  }, [playback?.is_playing, playback?.item?.duration_ms]);

  const play = useCallback(async (contextUri) => {
    setLoading(true);
    try {
      await base44.functions.invoke('spotifyApi', { action: 'play', params: { context_uri: contextUri } });
      setTimeout(fetchPlayback, 1500);
    } finally { setLoading(false); }
  }, [fetchPlayback]);

  const pause = useCallback(async () => {
    try {
      await base44.functions.invoke('spotifyApi', { action: 'pause' });
      setTimeout(fetchPlayback, 500);
    } catch (e) {}
  }, [fetchPlayback]);

  const next = useCallback(async () => {
    setLoading(true);
    try {
      await base44.functions.invoke('spotifyApi', { action: 'next' });
      setTimeout(fetchPlayback, 1500);
    } finally { setLoading(false); }
  }, [fetchPlayback]);

  const previous = useCallback(async () => {
    setLoading(true);
    try {
      await base44.functions.invoke('spotifyApi', { action: 'previous' });
      setTimeout(fetchPlayback, 1500);
    } finally { setLoading(false); }
  }, [fetchPlayback]);

  const setVolume = useCallback(async (volumePercent) => {
    try {
      await base44.functions.invoke('spotifyApi', { action: 'setVolume', params: { volume_percent: volumePercent } });
    } catch (e) {}
  }, []);

  const seek = useCallback(async (positionMs) => {
    try {
      const res = await base44.functions.invoke('seekTrack', { position_ms: positionMs });
      setProgress(positionMs);
      lastPollProgressRef.current = positionMs;
      return res.data;
    } catch (e) {
      return { success: false, error: e.message };
    }
  }, []);

  const reconnect = useCallback(async () => {
    setNoDeviceCount(0);
    await fetchPlayback();
  }, [fetchPlayback]);

  return { playback, progress, loading, play, pause, next, previous, setVolume, seek, refresh: fetchPlayback, reconnect, noDeviceCount };
}