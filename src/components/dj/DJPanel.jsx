import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import NowPlayingCard from '@/components/dj/NowPlayingCard';
import QueueList from '@/components/dj/QueueList';
import AddSongSheet from '@/components/dj/AddSongSheet';
import { useQueue } from '@/lib/useQueue';

export default function DJPanel({ player, spotifyConnected, rotation, transitionActive, crossfadeSeconds, onCrossfadeChange, onBpmSort, sorting }) {
  const { queue, audioFeatures, skipErrorCount, addToQueue, removeFromQueue, reorderQueue } = useQueue(player, spotifyConnected);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (skipErrorCount > 0) {
      toast({
        title: 'Song übersprungen',
        description: 'Song konnte nicht abgespielt werden — übersprungen',
        variant: 'destructive',
      });
    }
  }, [skipErrorCount, toast]);

  return (
    <div className="space-y-4 lg:sticky lg:top-20">
      <NowPlayingCard
        player={player}
        audioFeatures={audioFeatures}
        spotifyConnected={spotifyConnected}
        crossfadeSeconds={crossfadeSeconds}
        onCrossfadeChange={onCrossfadeChange}
        transitionActive={transitionActive}
      />

      <QueueList
        queue={queue}
        onReorder={reorderQueue}
        onRemove={removeFromQueue}
        onAddClick={() => setSheetOpen(true)}
        player={player}
        rotation={rotation}
        onBpmSort={onBpmSort}
        sorting={sorting}
      />

      <AddSongSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onAdd={addToQueue}
      />
    </div>
  );
}