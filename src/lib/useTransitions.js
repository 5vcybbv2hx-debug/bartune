import { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';

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

const DEFAULT_TRANSITIONS = [
  { from: 'Nachmittag', to: 'Feierabend', crossfade: 10, bpm_sort: false, name: 'Nachmittag → Feierabend' },
  { from: 'Feierabend', to: 'Party', crossfade: 2, bpm_sort: false, name: 'Feierabend → Party' },
  { from: 'Party', to: 'Stammtisch', crossfade: 6, bpm_sort: true, name: 'Party → Stammtisch' },
  { from: 'Stammtisch', to: 'Closing Time', crossfade: 10, bpm_sort: true, name: 'Stammtisch → Closing Time' },
  { from: 'Party', to: 'Closing Time', crossfade: 8, bpm_sort: true, name: 'Party → Closing Time' },
];

export async function ensureDefaultTransitions() {
  const existing = await base44.entities.UebergangsProfile.list();
  if (existing.length > 0) return existing;

  const profiles = await base44.entities.StimmungsProfil.list('sort_order', 50);
  const findByName = (name) => profiles.find(p => p.name === name);

  const toCreate = [];
  for (const def of DEFAULT_TRANSITIONS) {
    const fromP = findByName(def.from);
    const toP = findByName(def.to);
    if (fromP && toP) {
      toCreate.push({
        name: def.name,
        from_profil_id: fromP.id,
        from_profil_name: fromP.name,
        to_profil_id: toP.id,
        to_profil_name: toP.name,
        crossfade_seconds: def.crossfade,
        bpm_sort: def.bpm_sort,
      });
    }
  }

  if (toCreate.length > 0) {
    await base44.entities.UebergangsProfile.bulkCreate(toCreate);
  }
  return await base44.entities.UebergangsProfile.list();
}

export function useTransitions(spotifyConnected) {
  const [transitions, setTransitions] = useState([]);
  const [transitionActive, setTransitionActive] = useState(false);
  const [crossfadeSeconds, setCrossfadeSeconds] = useState(5);
  const transitionTimerRef = useRef(null);

  const loadTransitions = useCallback(async () => {
    try {
      const t = await ensureDefaultTransitions();
      setTransitions(t);
    } catch (e) {}
  }, []);

  useEffect(() => { loadTransitions(); }, [loadTransitions]);

  const applyTransition = useCallback(async (fromProfileId, toProfileId) => {
    if (!spotifyConnected || !fromProfileId || fromProfileId === toProfileId) return null;

    const match = transitions.find(t =>
      t.from_profil_id === fromProfileId && t.to_profil_id === toProfileId
    );

    const seconds = match?.crossfade_seconds ?? 5;

    try {
      await base44.functions.invoke('setCrossfade', { seconds });
    } catch (e) {}
    setCrossfadeSeconds(seconds);

    if (match?.bpm_sort) {
      try {
        await base44.functions.invoke('sortQueueByBpm', { session_id: getSessionId() });
      } catch (e) {}
    }

    if (match?.transition_sound_url) {
      try {
        const trackId = match.transition_sound_url.includes('track/')
          ? match.transition_sound_url.split('track/')[1].split('?')[0]
          : match.transition_sound_url;
        await base44.functions.invoke('spotifyApi', { action: 'addToQueue', params: { track_id: trackId } });
      } catch (e) {}
    }

    setTransitionActive(true);
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = setTimeout(() => setTransitionActive(false), (seconds + 3) * 1000);

    return {
      name: match?.name || null,
      seconds,
      bpm_sort: match?.bpm_sort || false,
    };
  }, [transitions, spotifyConnected]);

  const handleCrossfadeChange = useCallback(async (seconds) => {
    setCrossfadeSeconds(seconds);
    try {
      await base44.functions.invoke('setCrossfade', { seconds });
    } catch (e) {}
  }, []);

  const sortQueueByBpm = useCallback(async () => {
    try {
      const res = await base44.functions.invoke('sortQueueByBpm', { session_id: getSessionId() });
      return res.data;
    } catch (e) {
      return null;
    }
  }, []);

  useEffect(() => {
    return () => { if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current); };
  }, []);

  return {
    transitions,
    transitionActive,
    crossfadeSeconds,
    applyTransition,
    handleCrossfadeChange,
    sortQueueByBpm,
    reload: loadTransitions,
  };
}