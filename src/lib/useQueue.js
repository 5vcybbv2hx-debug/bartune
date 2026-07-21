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
  const sessionIdRef = useRef(activeSessionId);

  useEffect(() => { playerRef.current = player; }, [player]);
  useEffect(() => { sessionIdRef.current = activeSessionId; }, [activeSessionId]);

  // Ensure a session exists — auto-create one if missing
  const ensureSession = useCallback(async () => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const newSessionId = (crypto.randomUUID && crypto.randomUUID()) || ('sess_' + Date.now() + '_' + Math.random().toString(36).slice(2));
    sessionIdRef.current = newSessionId;
    try {
      const settings = await base44.entities.AppSettings.list();
      if (settings.length > 0) {
        await base44.entities.AppSettings.update(settings[0].id, { active_session_id: newSessionId });
      }
    } catch (e) {}
    return newSessionId;
  }, []);

  const loadQueue = useCallback(async () => {
    const sid = sessionIdRef.current;
    try {
      let items;
      if (sid) {
        items = await base44.entities.BarTuneQueue.filter({ session_id: sid });
      } else {
        // Fallback: show all entries visible to this user (RLS filters to own records)
        items = await base44.entities.BarTuneQueue.list();
      }
      items = items.filter(q => q.status !== 'played');
      items.sort((a, b) => (a.position || 0) - (b.position || 0));
      setQueue(items);
    } catch (e) {}
  }, []);

  useEffect(() => { loadQueue(); }, [loadQueue, activeSessionId]);

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
    if (!spotifyConnected) return;

    const checkAdvance = async () => {
      const p = playerRef.current;
      const pb = p.playback;
      if (!pb?.item) return;

      try {
        const res = await base44.functions.invoke('queueManager', { action: 'checkAndAdvance', playback: pb });
        if (res.data?.changed || res.data?.cleaned_up || res.data?.pre_queued || res.data?.pushed) {
          loadQueue();
        }
      } catch (e) {}
    };

    const interval = setInterval(checkAdvance, 5000);
    return () => clearInterval(interval);
  }, [spotifyConnected, loadQueue]);

  const addToQueue = useCallback(async (track) => {
    const sid = sessionIdRef.current || ('temp_' + Date.now());
    const nextPosition = queue.length > 0 ? Math.max(...queue.map(q => q.position || 0)) + 1 : 0;
    const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const newItem = {
      id: tempId,
      session_id: sid,
      track_id: track.id,
      track_name: track.name,
      artist: track.artists?.map(a => a.name).join(', ') || '',
      duration_ms: track.duration_ms || 0,
      album_cover_url: track.album?.images?.[0]?.url || '',
      position: nextPosition,
      added_at: new Date().toISOString(),
      source: 'Manual',
      status: 'pending',
    };
    // Optimistic: show immediately
    setQueue(prev => [...prev, newItem]);
    // Persist to DB
    try {
      const realSid = await ensureSession();
      const created = await base44.entities.BarTuneQueue.create({ ...newItem, session_id: realSid });
      setQueue(prev => prev.map(q => q.id === tempId ? { ...created, position: nextPosition } : q));
    } catch (e) {
      setQueue(prev => prev.filter(q => q.id !== tempId));
    }
  }, [queue, ensureSession]);

  const removeFromQueue = useCallback(async (itemId) => {
    const item = queue.find(q => q.id === itemId);
    if (!item) return;
    // Optimistic: remove and reindex locally
    const reindexed = queue
      .filter(q => q.id !== itemId)
      .sort((a, b) => (a.position || 0) - (b.position || 0))
      .map((q, i) => ({ ...q, position: i }));
    setQueue(reindexed);
    // Persist to DB
    try {
      await base44.entities.BarTuneQueue.delete(itemId);
      if (reindexed.length > 0) {
        await base44.entities.BarTuneQueue.bulkUpdate(
          reindexed.map((q, i) => ({ id: q.id, position: i }))
        );
      }
    } catch (e) {
      await loadQueue();
    }
  }, [queue, loadQueue]);

  const reorderQueue = useCallback(async (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    const newQueue = [...queue];
    const [moved] = newQueue.splice(fromIndex, 1);
    newQueue.splice(toIndex, 0, moved);
    const reindexed = newQueue.map((item, i) => ({ ...item, position: i }));
    // Optimistic: update immediately
    setQueue(reindexed);
    // Persist to DB
    try {
      const updates = reindexed.map((item, i) => ({ id: item.id, position: i }));
      await base44.entities.BarTuneQueue.bulkUpdate(updates);
    } catch (e) {
      await loadQueue();
    }
  }, [queue, loadQueue]);

  const insertAtFront = useCallback(async (track) => {
    const sid = await ensureSession();
    if (queue.length > 0) {
      await base44.entities.BarTuneQueue.bulkUpdate(
        queue.map(q => ({ id: q.id, position: (q.position || 0) + 1 }))
      );
    }
    await base44.entities.BarTuneQueue.create({
      session_id: sid,
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
  }, [queue, ensureSession, loadQueue]);

  return { queue, audioFeatures, skipErrorCount, sessionId: sessionIdRef.current, addToQueue, removeFromQueue, reorderQueue, insertAtFront, reload: loadQueue };
}