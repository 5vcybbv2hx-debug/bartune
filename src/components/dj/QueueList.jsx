import React from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical, X, Plus, Clock, ListMusic } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function formatTime(ms) {
  if (!ms || ms < 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function formatDuration(ms) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

export default function QueueList({ queue, onReorder, onRemove, onAddClick, player, rotation, onBpmSort, sorting }) {
  const items = queue.slice(0, 5);
  const totalQueueMs = queue.reduce((sum, q) => sum + (q.duration_ms || 0), 0);

  // Playlist info
  const contextUri = player?.playback?.context?.uri;
  const playlistId = contextUri?.startsWith('spotify:playlist:') ? contextUri.split(':')[2] : null;
  const currentPlaylist = playlistId ? rotation.find(r => r.playlist_id === playlistId) : null;

  const currentRemaining = player?.playback?.item ? Math.max(0, player.playback.item.duration_ms - player.progress) : 0;
  const totalRemainingMs = currentRemaining + totalQueueMs;
  const endTime = new Date(Date.now() + totalRemainingMs);
  const endStr = endTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ListMusic className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold">Warteschlange</h3>
          {queue.length > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[9px] font-mono font-semibold">
              🎵 Queue aktiv
            </span>
          )}
          <span className="text-xs text-muted-foreground font-mono">({queue.length})</span>
        </div>
        <div className="flex items-center gap-2">
          {onBpmSort && queue.length > 0 && (
            <button
              onClick={onBpmSort}
              disabled={sorting}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-secondary/50 text-xs font-medium text-muted-foreground hover:text-primary transition disabled:opacity-50"
              title="Queue nach BPM sortieren"
            >
              {sorting ? <div className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /> : '🎵'}
              <span className="hidden sm:inline">BPM-Sort</span>
            </button>
          )}
          {queue.length > 0 && (
            <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
              <Clock className="w-3 h-3" />
              ca. {formatDuration(totalQueueMs)}
            </span>
          )}
        </div>
      </div>

      {/* Queue items */}
      {items.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">
          Warteschlange leer — Songs hinzufügen oder Profil aktivieren
        </div>
      ) : (
        <DragDropContext onDragEnd={(result) => {
          if (!result.destination) return;
          onReorder(result.source.index, result.destination.index);
        }}>
          <Droppable droppableId="queue">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
                <AnimatePresence>
                  {items.map((item, index) => (
                    <Draggable key={item.id} draggableId={item.id} index={index}>
                      {(provided, snapshot) => (
                        <motion.div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          layout
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -30 }}
                          transition={{ duration: 0.2 }}
                          className={`group flex items-center gap-2 p-2 rounded-lg transition ${
                            snapshot.isDragging ? 'bg-primary/10' : 'hover:bg-secondary/50'
                          }`}
                        >
                          <span
                            {...provided.dragHandleProps}
                            className="text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
                          >
                            <GripVertical className="w-4 h-4" />
                          </span>
                          <span className="text-xs font-mono text-primary w-5 text-right">
                            {(index + 1).toString().padStart(2, '0')}
                          </span>
                          {item.album_cover_url ? (
                            <img src={item.album_cover_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center shrink-0">
                              <span className="text-xs">🎵</span>
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-mono font-semibold truncate">{item.track_name}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{item.artist}</p>
                          </div>
                          <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                            {formatTime(item.duration_ms)}
                          </span>
                          <button
                            onClick={() => onRemove(item.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </motion.div>
                      )}
                    </Draggable>
                  ))}
                </AnimatePresence>
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}

      {/* Add button */}
      <button
        onClick={onAddClick}
        className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:text-primary hover:border-primary/50 transition"
      >
        <Plus className="w-4 h-4" /> Song hinzufügen
      </button>

      {/* Playlist info */}
      <div className="mt-3 pt-3 border-t border-border">
        <p className="text-[11px] text-muted-foreground font-mono">
          {currentPlaylist ? (
            <>Aktuelle Playlist: {currentPlaylist.playlist_name} · endet ca. um {endStr} Uhr</>
          ) : totalQueueMs > 0 ? (
            <>Queue endet ca. um {endStr} Uhr</>
          ) : (
            <>Keine Playlist aktiv</>
          )}
        </p>
      </div>
    </div>
  );
}