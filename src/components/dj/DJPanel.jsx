import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import NowPlayingCard from '@/components/dj/NowPlayingCard';
import QueueList from '@/components/dj/QueueList';
import AddSongSheet from '@/components/dj/AddSongSheet';
import WunschPanel from '@/components/dj/WunschPanel';
import NextTrackLine from '@/components/dj/NextTrackLine';
import { useQueue } from '@/lib/useQueue';
import { useSkipControl } from '@/hooks/useSkipControl';

export default function DJPanel({ player, spotifyConnected, rotation, transitionActive, crossfadeSeconds, onCrossfadeChange, onBpmSort, sorting, wunschzettelActive }) {
  const { queue, audioFeatures, skipErrorCount, addToQueue, removeFromQueue, reorderQueue, insertAtFront } = useQueue(player, spotifyConnected);
  const { skipping, hardCut, skipPulse, onSkipPressStart, onSkipPressEnd } = useSkipControl(player, crossfadeSeconds, onCrossfadeChange);
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
    <div className="space-y-4">
      <NowPlayingCard
        player={player}
        audioFeatures={audioFeatures}
        spotifyConnected={spotifyConnected}
        crossfadeSeconds={crossfadeSeconds}
        onCrossfadeChange={onCrossfadeChange}
        transitionActive={transitionActive}
        onSkipPressStart={onSkipPressStart}
        onSkipPressEnd={onSkipPressEnd}
        skipPulse={skipPulse}
        hardCut={hardCut}
        skipping={skipping}
      />

      <NextTrackLine queue={queue} blink={skipPulse} />

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

      <WunschPanel wunschzettelActive={wunschzettelActive} onAccept={insertAtFront} />

      <AddSongSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onAdd={addToQueue}
      />
    </div>
  );
}