import { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from '@/components/ui/use-toast';

function getSessionId() {
  try {
    let id = localStorage.getItem('bartune_session_id');
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) || ('sess_' + Date.now() + '_' + Math.random().toString(36).slice(2));
      localStorage.setItem('bartune_session_id', id);
    }
    return id;
  } catch (e) {
    return 'sess_fallback';
  }
}

export function useQueue(player, spotifyConnected) {
  const [queue, setQueue] = useState([]);
  const [audioFeatures, setAudioFeatures] = useState(null);
  const [skipErrorCount, setSkipErrorCount] = useState(0);

  const sessionId = useRef(getSessionId()).current;
  const lastTrackIdRef = useRef(null);
  const prevQueueLengthRef = useRef(0);
  const playerRef = useRef(player);

  useEffect(() => { playerRef.current = player; }, [player]);

  const loadQueue = useCallback(async () => {
    try {
      const items = await base44.entities.BarTuneQueue.filter({ session_id: sessionId });
      items.sort((a, b) => (a.position || 0) - (b.position || 0));
      setQueue(items);
    } catch (e) {}
  }, [sessionId]);

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

  // Auto-advance polling — BarTune-Queue has priority, backend handles all logic
  useEffect(() => {
    if (!spotifyConnected) return;

    const checkAdvance = async () => {
      const p = playerRef.current;
      const pb = p.playback;
      if (!pb?.item) return;

      try {
        const res = await base44.functions.invoke('queueManager', { action: 'checkAndAdvance', session_id: sessionId });
        if (res.data?.advanced || res.data?.queued_new) {
          loadQueue();
        }
      } catch (e) {}
    };

    const interval = setInterval(checkAdvance, 5000);
    return () => clearInterval(interval);
  }, [spotifyConnected, sessionId, loadQueue]);

  const addToQueue = useCallback(async (track) => {
    const nextPosition = queue.length > 0 ? Math.max(...queue.map(q => q.position || 0)) + 1 : 0;
    await base44.entities.BarTuneQueue.create({
      session_id: sessionId,
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
  }, [queue, sessionId, loadQueue]);

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
    if (queue.length > 0) {
      await base44.entities.BarTuneQueue.bulkUpdate(
        queue.map(q => ({ id: q.id, position: (q.position || 0) + 1 }))
      );
    }
    await base44.entities.BarTuneQueue.create({
      session_id: sessionId,
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
  }, [queue, sessionId, loadQueue]);

  return { queue, audioFeatures, skipErrorCount, sessionId, addToQueue, removeFromQueue, reorderQueue, insertAtFront, reload: loadQueue };
}