import { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from '@/components/ui/use-toast';

export function useQueue(player, spotifyConnected, activeSessionId) {
  const [queue, setQueue] = useState([]);
  const [audioFeatures, setAudioFeatures] = useState(null);
  const [skipErrorCount, setSkipErrorCount] = useState(0);

  const lastTrackIdRef = useRef(null);
  const prevQueueLengthRef = useRef(0);
  const playerRef = useRef(player);

  useEffect(() => { playerRef.current = player; }, [player]);

  const loadQueue = useCallback(async () => {
    if (!activeSessionId) { setQueue([]); return; }
    try {
      const items = await base44.entities.BarTuneQueue.filter({ session_id: activeSessionId });
      items.sort((a, b) => (a.position || 0) - (b.position || 0));
      setQueue(items);
    } catch (e) {}
  }, [activeSessionId]);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  // Toast when queue becomes empty — Playlist übernimmt
  useEffect(() => {
    if (prevQueueLengthRef.current > 0 && queue.length === 0) {
      toast({ title: '✅ Warteschlange abgespielt — Playlist übernimmt' });
    }
    prevQueueLengthRef.current = queue.length;
  }, [queue.length]);

  // Track change → load audio features
  useEffect(() => {
    const trackId = player.playback?.item?.id;
    if (!trackId || trackId === lastTrackIdRef.current) return;
    lastTrackIdRef.current = trackId;
    setAudioFeatures(null);

    base44.functions.invoke('spotifyApi', { action: 'getAudioFeatures', params: { track_id: trackId } })
      .then(res => { if (res.data?.tempo) setAudioFeatures(res.data); })
      .catch(() => {});
  }, [player.playback?.item?.id]);

  // Auto-advance polling — queueManager reads session from AppSettings
  useEffect(() => {
    if (!spotifyConnected || !activeSessionId) return;

    const checkAdvance = async () => {
      const p = playerRef.current;
      const pb = p.playback;
      if (!pb?.item) return;

      try {
        const res = await base44.functions.invoke('queueManager', { action: 'checkAndAdvance' });
        if (res.data?.changed || res.data?.cleaned_up) {
          loadQueue();
        }
      } catch (e) {}
    };

    const interval = setInterval(checkAdvance, 5000);
    return () => clearInterval(interval);
  }, [spotifyConnected, activeSessionId, loadQueue]);

  const addToQueue = useCallback(async (track) => {
    if (!activeSessionId) return;
    const nextPosition = queue.length > 0 ? Math.max(...queue.map(q => q.position || 0)) + 1 : 0;
    await base44.entities.BarTuneQueue.create({
      session_id: activeSessionId,
      track_id: track.id,
      track_name: track.name,
      artist: track.artists?.map(a => a.name).join(', ') || '',
      duration_ms: track.duration_ms || 0,
      album_cover_url: track.album?.images?.[0]?.url || '',
      position: nextPosition,
      added_at: new Date().toISOString(),
      source: 'Manual',
    });
    await loadQueue();
  }, [queue, activeSessionId, loadQueue]);

  const removeFromQueue = useCallback(async (itemId) => {
    const item = queue.find(q => q.id === itemId);
    if (!item) return;
    await base44.entities.BarTuneQueue.delete(itemId);
    const after = queue.filter(q => (q.position || 0) > (item.position || 0));
    if (after.length > 0) {
      await base44.entities.BarTuneQueue.bulkUpdate(
        after.map(q => ({ id: q.id, position: (q.position || 0) - 1 }))
      );
    }
    await loadQueue();
  }, [queue, loadQueue]);

  const reorderQueue = useCallback(async (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    const newQueue = [...queue];
    const [moved] = newQueue.splice(fromIndex, 1);
    newQueue.splice(toIndex, 0, moved);
    const updates = newQueue.map((item, i) => ({ id: item.id, position: i }));
    await base44.entities.BarTuneQueue.bulkUpdate(updates);
    await loadQueue();
  }, [queue, loadQueue]);

  const insertAtFront = useCallback(async (track) => {
    if (!activeSessionId) return;
    if (queue.length > 0) {
      await base44.entities.BarTuneQueue.bulkUpdate(
        queue.map(q => ({ id: q.id, position: (q.position || 0) + 1 }))
      );
    }
    await base44.entities.BarTuneQueue.create({
      session_id: activeSessionId,
      track_id: track.id,
      track_name: track.name,
      artist: track.artists?.map(a => a.name).join(', ') || '',
      duration_ms: track.duration_ms || 0,
      album_cover_url: track.album?.images?.[0]?.url || '',
      position: 0,
      added_at: new Date().toISOString(),
      source: 'Wunschzettel',
    });
    await loadQueue();
  }, [queue, activeSessionId, loadQueue]);

  return { queue, audioFeatures, skipErrorCount, sessionId: activeSessionId, addToQueue, removeFromQueue, reorderQueue, insertAtFront, reload: loadQueue };
}