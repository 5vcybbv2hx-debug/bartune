import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { ensureDefaultTransitions } from '@/lib/useTransitions';
import CrossfadeVisual from '@/components/dj/CrossfadeVisual';

export default function TransitionManager({ profiles }) {
  const [transitions, setTransitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const t = await ensureDefaultTransitions();
      setTransitions(t);
    } catch (e) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (id, data) => {
    await base44.entities.UebergangsProfile.update(id, data);
    setEditing(null);
    await load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Übergangs-Profil löschen?')) return;
    await base44.entities.UebergangsProfile.delete(id);
    await load();
  };

  const handleCreate = async (data) => {
    const fromP = profiles.find(p => p.id === data.from_profil_id);
    const toP = profiles.find(p => p.id === data.to_profil_id);
    await base44.entities.UebergangsProfile.create({
      ...data,
      name: `${fromP?.name || '?'} → ${toP?.name || '?'}`,
      from_profil_name: fromP?.name || '',
      to_profil_name: toP?.name || '',
    });
    setAdding(false);
    await load();
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground py-4">Lade Übergänge...</div>;
  }

  return (
    <div>
      <div className="space-y-2 mb-3">
        {transitions.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">Noch keine Übergänge definiert.</p>
        )}
        {transitions.map(t => (
          <TransitionCard
            key={t.id}
            transition={t}
            profiles={profiles}
            onEdit={() => setEditing(t)}
            onDelete={() => handleDelete(t.id)}
          />
        ))}
      </div>

      <button
        onClick={() => setAdding(true)}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:text-primary hover:border-primary/50 transition"
      >
        <Plus className="w-4 h-4" /> Neuen Übergang hinzufügen
      </button>

      {editing && (
        <TransitionEditor
          transition={editing}
          profiles={profiles}
          onSave={(data) => handleSave(editing.id, data)}
          onClose={() => setEditing(null)}
        />
      )}
      {adding && (
        <TransitionEditor
          profiles={profiles}
          onSave={handleCreate}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}

function TransitionCard({ transition, onEdit, onDelete }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50">
      <CrossfadeVisual seconds={transition.crossfade_seconds || 0} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-mono font-semibold truncate">{transition.name}</p>
        <p className="text-xs text-muted-foreground">
          {transition.crossfade_seconds || 0}s Crossfade
          {transition.bpm_sort && ' · 🎵 BPM-Sort'}
          {transition.transition_sound_url && ' · 🔊 Sound'}
        </p>
      </div>
      <button onClick={onEdit} className="p-1.5 text-muted-foreground hover:text-primary transition">
        <Edit2 className="w-3.5 h-3.5" />
      </button>
      <button onClick={onDelete} className="p-1.5 text-muted-foreground hover:text-destructive transition">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function TransitionEditor({ transition, profiles, onSave, onClose }) {
  const [fromId, setFromId] = useState(transition?.from_profil_id || '');
  const [toId, setToId] = useState(transition?.to_profil_id || '');
  const [crossfade, setCrossfade] = useState(transition?.crossfade_seconds ?? 5);
  const [bpmSort, setBpmSort] = useState(transition?.bpm_sort ?? false);
  const [soundUrl, setSoundUrl] = useState(transition?.transition_sound_url || '');

  const handleSave = () => {
    if (!fromId || !toId) return;
    onSave({
      from_profil_id: fromId,
      to_profil_id: toId,
      crossfade_seconds: crossfade,
      bpm_sort: bpmSort,
      transition_sound_url: soundUrl,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-card rounded-2xl border border-border p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold">Übergang bearbeiten</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-secondary">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Von Profil</label>
            <select
              value={fromId}
              onChange={e => setFromId(e.target.value)}
              disabled={transition}
              className="w-full px-3 py-2 rounded-lg bg-secondary text-sm font-mono outline-none"
            >
              <option value="">Wählen...</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Nach Profil</label>
            <select
              value={toId}
              onChange={e => setToId(e.target.value)}
              disabled={transition}
              className="w-full px-3 py-2 rounded-lg bg-secondary text-sm font-mono outline-none"
            >
              <option value="">Wählen...</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-muted-foreground">Crossfade</label>
              <span className="text-xs font-mono text-primary font-semibold">{crossfade}s</span>
            </div>
            <input
              type="range"
              min="0"
              max="12"
              value={crossfade}
              onChange={e => setCrossfade(parseInt(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-center mt-1">
              <CrossfadeVisual seconds={crossfade} />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground">🎵 Queue nach BPM sortieren</label>
            <button
              onClick={() => setBpmSort(!bpmSort)}
              className={`w-10 h-6 rounded-full transition relative ${bpmSort ? 'bg-primary' : 'bg-secondary'}`}
            >
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${bpmSort ? 'left-5' : 'left-1'}`} />
            </button>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Transition Sound URL (optional)</label>
            <input
              type="text"
              value={soundUrl}
              onChange={e => setSoundUrl(e.target.value)}
              placeholder="Spotify Track URL oder ID"
              className="w-full px-3 py-2 rounded-lg bg-secondary text-xs font-mono outline-none"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={!fromId || !toId}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40"
          >
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}