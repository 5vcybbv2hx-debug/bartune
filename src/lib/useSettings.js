import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

const DEFAULT_PROFILES = [
  { name: 'Nachmittag', emoji: '☀️', description: 'Ruhig, entspannt', color: '#FFB300', sort_order: 0 },
  { name: 'Feierabend', emoji: '🌆', description: 'Warm, gemütlich', color: '#FF6D00', sort_order: 1 },
  { name: 'Party', emoji: '🎉', description: 'Energie, Crowd', color: '#B44FFF', sort_order: 2 },
  { name: 'Stammtisch', emoji: '🍺', description: 'Locker, gesellig', color: '#2979FF', sort_order: 3 },
  { name: 'Closing Time', emoji: '🌙', description: 'Ruhiger werdend', color: '#3D5AFE', sort_order: 4 },
];

export function useSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadSettings = useCallback(async () => {
    try {
      const list = await base44.entities.AppSettings.list();
      if (list.length === 0) {
        const created = await base44.entities.AppSettings.create({
          wunschzettel_active: false,
          rotation_block_hours: 24,
        });
        setSettings(created);
      } else {
        setSettings(list[0]);
      }
    } catch (e) {
      // try service role
      try {
        const list = await base44.asServiceRole.entities.AppSettings.list();
        if (list.length > 0) setSettings(list[0]);
        else {
          const created = await base44.entities.AppSettings.create({
            wunschzettel_active: false,
            rotation_block_hours: 24,
          });
          setSettings(created);
        }
      } catch (e2) {}
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const updateSettings = useCallback(async (updates) => {
    if (!settings) return;
    const updated = await base44.entities.AppSettings.update(settings.id, updates);
    setSettings(updated);
    return updated;
  }, [settings]);

  return { settings, loading, updateSettings, reload: loadSettings };
}

export async function ensureDefaultProfiles() {
  const profiles = await base44.entities.StimmungsProfil.list('sort_order', 50);
  if (profiles.length === 0) {
    await base44.entities.StimmungsProfil.bulkCreate(DEFAULT_PROFILES);
    return await base44.entities.StimmungsProfil.list('sort_order', 50);
  }
  return profiles;
}

export function formatRemaining(blockedUntil) {
  if (!blockedUntil) return null;
  const diff = new Date(blockedUntil).getTime() - Date.now();
  if (diff <= 0) return 'verfügbar';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `gesperrt noch ${hours}h ${minutes}min`;
  return `gesperrt noch ${minutes}min`;
}

export function formatLastPlayed(lastPlayedAt) {
  if (!lastPlayedAt) return 'nie gespielt';
  const diff = Date.now() - new Date(lastPlayedAt).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) return `vor ${Math.floor(hours / 24)} Tagen`;
  if (hours > 0) return `vor ${hours}h ${minutes}min`;
  if (minutes > 0) return `vor ${minutes}min`;
  return 'gerade eben';
}