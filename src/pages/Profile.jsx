import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Plus, Pencil, Trash2, GripVertical, X, Check } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ensureDefaultProfiles } from '@/lib/useSettings';

const PRESET_COLORS = ['#FFB300', '#FF6D00', '#B44FFF', '#2979FF', '#3D5AFE', '#00E676', '#FF3D9A', '#FF1744'];
const PRESET_EMOJIS = ['☀️', '🌆', '🎉', '🍺', '🌙', '🎵', '🔥', '🎸', '🎹', '☕', '🌊', '🍻'];

export default function ProfileManagement() {
  const [profiles, setProfiles] = useState([]);
  const [rotation, setRotation] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showDialog, setShowDialog] = useState(false);

  const load = async () => {
    setProfiles(await ensureDefaultProfiles());
    setRotation(await base44.entities.PlaylistRotation.list());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    const reordered = [...profiles];
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);

    const updates = reordered.map((p, i) => ({ id: p.id, sort_order: i }));
    await base44.entities.StimmungsProfil.bulkUpdate(updates);
    setProfiles(await base44.entities.StimmungsProfil.list('sort_order', 50));
  };

  const handleSave = async (data) => {
    if (editing?.id) {
      await base44.entities.StimmungsProfil.update(editing.id, data);
    } else {
      await base44.entities.StimmungsProfil.create({ ...data, sort_order: profiles.length, is_active: false });
    }
    setProfiles(await base44.entities.StimmungsProfil.list('sort_order', 50));
    setShowDialog(false);
    setEditing(null);
  };

  const handleDelete = async (id) => {
    await base44.entities.StimmungsProfil.delete(id);
    setProfiles(await base44.entities.StimmungsProfil.list('sort_order', 50));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold font-heading">Stimmungs-Profile</h1>
          <p className="text-sm text-muted-foreground">Drag & Drop zum Sortieren</p>
        </div>
        <Button
          onClick={() => { setEditing(null); setShowDialog(true); }}
          className="bg-primary text-primary-foreground neon-glow-primary"
        >
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Profil</span>
        </Button>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="profiles">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
              {profiles.map((profile, index) => (
                <Draggable key={profile.id} draggableId={profile.id} index={index}>
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border"
                    >
                      <div {...provided.dragHandleProps} className="cursor-grab text-muted-foreground">
                        <GripVertical className="w-5 h-5" />
                      </div>
                      <div className="text-3xl" style={{ filter: `drop-shadow(0 0 8px ${profile.color}60)` }}>
                        {profile.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold" style={{ color: profile.color }}>{profile.name}</h3>
                          {profile.is_active && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: profile.color, color: '#000' }}>
                              AKTIV
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{profile.description}</p>
                        <p className="text-xs font-mono text-muted-foreground mt-0.5">
                          {profile.playlist_ids?.length || 0} Playlists
                        </p>
                      </div>
                      <button
                        onClick={() => { setEditing(profile); setShowDialog(true); }}
                        className="p-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {!profile.is_active && (
                        <button
                          onClick={() => handleDelete(profile.id)}
                          className="p-2 rounded-lg bg-secondary text-muted-foreground hover:text-destructive transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      <ProfileEditDialog
        open={showDialog}
        profile={editing}
        playlists={rotation}
        onClose={() => { setShowDialog(false); setEditing(null); }}
        onSave={handleSave}
      />
    </div>
  );
}

function ProfileEditDialog({ open, profile, playlists, onClose, onSave }) {
  const [name, setName] = useState(profile?.name || '');
  const [emoji, setEmoji] = useState(profile?.emoji || '🎵');
  const [description, setDescription] = useState(profile?.description || '');
  const [color, setColor] = useState(profile?.color || '#B44FFF');
  const [selectedPlaylists, setSelectedPlaylists] = useState(profile?.playlist_ids || []);

  useEffect(() => {
    setName(profile?.name || '');
    setEmoji(profile?.emoji || '🎵');
    setDescription(profile?.description || '');
    setColor(profile?.color || '#B44FFF');
    setSelectedPlaylists(profile?.playlist_ids || []);
  }, [profile, open]);

  const togglePlaylist = (id) => {
    setSelectedPlaylists(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSave({ name, emoji, description, color, playlist_ids: selectedPlaylists });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{profile ? 'Profil bearbeiten' : 'Neues Profil'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Emoji + Name */}
          <div className="flex gap-3">
            <div className="w-16 shrink-0">
              <label className="text-xs text-muted-foreground mb-1 block">Emoji</label>
              <Input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                className="text-center text-2xl bg-secondary border-border"
                maxLength={2}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Party-Abend"
                className="bg-secondary border-border"
              />
            </div>
          </div>

          {/* Emoji presets */}
          <div className="flex flex-wrap gap-1.5">
            {PRESET_EMOJIS.map(e => (
              <button
                key={e}
                onClick={() => setEmoji(e)}
                className={`w-9 h-9 rounded-lg text-xl flex items-center justify-center transition ${
                  emoji === e ? 'bg-primary/20 ring-2 ring-primary' : 'bg-secondary hover:bg-secondary/70'
                }`}
              >
                {e}
              </button>
            ))}
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Beschreibung</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Kurze Beschreibung der Stimmung"
              className="bg-secondary border-border resize-none"
              rows={2}
            />
          </div>

          {/* Color */}
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Farbe</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition ${color === c ? 'ring-2 ring-offset-2 ring-offset-card' : ''}`}
                  style={{ backgroundColor: c, boxShadow: color === c ? `0 0 12px ${c}` : 'none', '--tw-ring-color': c }}
                />
              ))}
            </div>
          </div>

          {/* Playlist multi-select */}
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">
              Playlists zuordnen ({selectedPlaylists.length} ausgewählt)
            </label>
            <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg bg-secondary p-2">
              {playlists.map(p => (
                <button
                  key={p.id}
                  onClick={() => togglePlaylist(p.playlist_id)}
                  className={`w-full flex items-center gap-2 p-2 rounded-md text-left transition ${
                    selectedPlaylists.includes(p.playlist_id) ? 'bg-primary/15' : 'hover:bg-secondary/70'
                  }`}
                >
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                    selectedPlaylists.includes(p.playlist_id) ? 'bg-primary border-primary' : 'border-muted-foreground'
                  }`}>
                    {selectedPlaylists.includes(p.playlist_id) && <Check className="w-3 h-3 text-primary-foreground" />}
                  </div>
                  {p.playlist_cover && <img src={p.playlist_cover} alt="" className="w-6 h-6 rounded" />}
                  <span className="text-sm font-mono truncate">{p.playlist_name}</span>
                </button>
              ))}
              {playlists.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">Keine Playlists. Sync in den Playlists/Cockpit.</p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Abbrechen</Button>
            <Button onClick={handleSubmit} className="flex-1 bg-primary text-primary-foreground">Speichern</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}