import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Check, RefreshCw, QrCode, Download, RotateCcw, Trash, KeyRound, ExternalLink } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { ensureDefaultProfiles } from '@/lib/useSettings';
import { syncPlaylists } from '@/lib/spotifyData';

const BLOCK_OPTIONS = [6, 12, 24, 48, 72];

export default function SettingsPage() {
  const { settings, updateSettings, reload, spotifyConnected } = useOutletContext();
  const [connecting, setConnecting] = useState(false);
  const [syncingPlaylists, setSyncingPlaylists] = useState(false);
  const [staffPin, setStaffPin] = useState(settings?.staff_pin || '');
  const [savingPin, setSavingPin] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await base44.functions.invoke('spotifyAuth', {});
      if (res.data?.authUrl) {
        window.location.href = res.data.authUrl;
      }
    } catch (e) {
      alert('Fehler: ' + (e.response?.data?.error || e.message));
    }
    setConnecting(false);
  };

  const handleSyncPlaylists = async () => {
    setSyncingPlaylists(true);
    try {
      await syncPlaylists();
    } catch (e) {}
    setSyncingPlaylists(false);
  };

  const handleSavePin = async () => {
    setSavingPin(true);
    await updateSettings({ staff_pin: staffPin });
    setSavingPin(false);
  };

  const handleResetProfiles = async () => {
    if (!confirm('Alle Profile zurücksetzen auf Standard?')) return;
    setResetting(true);
    await base44.entities.StimmungsProfil.deleteMany({});
    await ensureDefaultProfiles();
    await updateSettings({ active_profil_id: null });
    setResetting(false);
  };

  const handleClearRotation = async () => {
    if (!confirm('Alle Rotationsdaten löschen? Neuer Abend startet.')) return;
    setClearing(true);
    await base44.entities.PlaylistRotation.deleteMany({});
    if (spotifyConnected) {
      try { await syncPlaylists(); } catch (e) {}
    }
    await updateSettings({ active_profil_id: null });
    setClearing(false);
  };

  const guestUrl = `${window.location.origin}/wunsch`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(guestUrl)}`;

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-3xl mx-auto">
      <h1 className="text-2xl md:text-3xl font-extrabold font-heading mb-6">Settings</h1>

      {/* Spotify connection */}
      <Section title="Spotify">
        {spotifyConnected ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-success/10 border border-success/30 flex items-center justify-center">
                <Check className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="font-semibold">{settings?.spotify_user_name || 'Spotify'}</p>
                <p className="text-xs text-muted-foreground">Verbunden</p>
              </div>
            </div>
            <Button variant="outline" onClick={handleConnect} disabled={connecting}>
              <RefreshCw className={`w-4 h-4 ${connecting ? 'animate-spin' : ''}`} /> Neu verbinden
            </Button>
          </div>
        ) : (
          <div>
            <p className="text-sm text-muted-foreground mb-3">
              Verbinde BarTune mit deinem Spotify-Account, um Playlists zu importieren und Musik zu steuern.
            </p>
            <Button onClick={handleConnect} disabled={connecting} className="bg-primary text-primary-foreground neon-glow-primary">
              {connecting ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
              Mit Spotify verbinden
            </Button>
            <div className="mt-3 p-3 rounded-lg bg-secondary text-xs space-y-1">
              <p className="text-muted-foreground">
                Du benötigst eine Spotify App aus der{' '}
                <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener" className="text-primary underline">
                  Developer Console <ExternalLink className="w-3 h-3 inline" />
                </a>.
              </p>
              <p className="text-muted-foreground">Trage diese Redirect-URI in deiner Spotify App ein:</p>
              <p className="font-mono text-primary break-all">{window.location.origin}/spotify-callback</p>
            </div>
          </div>
        )}
        {spotifyConnected && (
          <button
            onClick={handleSyncPlaylists}
            disabled={syncingPlaylists}
            className="mt-3 flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition"
          >
            <RefreshCw className={`w-4 h-4 ${syncingPlaylists ? 'animate-spin' : ''}`} />
            Playlists neu synchronisieren
          </button>
        )}
      </Section>

      {/* Rotation */}
      <Section title="Rotation">
        <label className="text-sm text-muted-foreground mb-3 block">Playlist-Sperre nach Einsatz</label>
        <div className="flex gap-2">
          {BLOCK_OPTIONS.map(h => (
            <button
              key={h}
              onClick={() => updateSettings({ rotation_block_hours: h })}
              className={`flex-1 py-2.5 rounded-xl text-sm font-mono font-semibold transition ${
                (settings?.rotation_block_hours || 24) === h
                  ? 'bg-primary text-primary-foreground neon-glow-primary'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {h}h
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Playlists werden nach dem Spielen für diese Dauer gesperrt.
        </p>
      </Section>

      {/* Wunschzettel */}
      <Section title="Gäste-Wunschzettel">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-semibold">Wunschzettel {settings?.wunschzettel_active ? 'aktiv' : 'inaktiv'}</p>
            <p className="text-xs text-muted-foreground">Gäste können per QR-Code Songs wünschen</p>
          </div>
          <button
            onClick={() => updateSettings({ wunschzettel_active: !settings?.wunschzettel_active })}
            className={`w-12 h-7 rounded-full transition relative ${settings?.wunschzettel_active ? 'bg-success' : 'bg-secondary'}`}
          >
            <div className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${settings?.wunschzettel_active ? 'left-6' : 'left-1'}`} />
          </button>
        </div>

        {settings?.wunschzettel_active && (
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Wunsch-Playlist (Spotify Playlist ID)</label>
            <input
              type="text"
              defaultValue={settings?.wunschzettel_playlist_id || ''}
              onBlur={(e) => updateSettings({ wunschzettel_playlist_id: e.target.value })}
              placeholder="z.B. 37i9dQZF1DXcBWIGoYBM5M"
              className="w-full px-3 py-2 rounded-lg bg-secondary border-0 text-sm font-mono focus:ring-1 focus:ring-primary"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Genehmigte Wünsche werden dieser Playlist hinzugefügt.
            </p>

            {/* QR Code */}
            <div className="mt-4 p-4 rounded-xl bg-secondary text-center">
              <QrCode className="w-5 h-5 text-primary mx-auto mb-2" />
              <p className="text-xs text-muted-foreground mb-3">QR-Code für Gäste</p>
              <img src={qrUrl} alt="QR Code" className="w-48 h-48 mx-auto rounded-lg bg-white p-2" />
              <p className="text-xs font-mono text-muted-foreground mt-2 break-all">{guestUrl}</p>
              <a
                href={qrUrl}
                download="bartune-qr.png"
                className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </a>
            </div>
          </div>
        )}
      </Section>

      {/* Staff PIN */}
      <Section title="Mitarbeiter-Zugang">
        <p className="text-sm text-muted-foreground mb-3">
          Mitarbeiter können mit dem PIN-Profil wechseln und Skip drücken.
          Link teilen: <span className="font-mono text-primary">{window.location.origin}/staff</span>
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={staffPin}
            onChange={(e) => setStaffPin(e.target.value)}
            placeholder="z.B. 1234"
            maxLength={8}
            className="flex-1 px-3 py-2 rounded-lg bg-secondary border-0 text-sm font-mono focus:ring-1 focus:ring-primary"
          />
          <Button onClick={handleSavePin} disabled={savingPin} className="bg-primary text-primary-foreground">
            <KeyRound className="w-4 h-4" /> Speichern
          </Button>
        </div>
      </Section>

      {/* Danger zone */}
      <Section title="Verwaltung">
        <div className="space-y-2">
          <button
            onClick={handleResetProfiles}
            disabled={resetting}
            className="w-full flex items-center gap-2 px-4 py-3 rounded-xl bg-secondary text-sm font-medium hover:bg-secondary/70 transition disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" /> Profile auf Standard zurücksetzen
          </button>
          <button
            onClick={handleClearRotation}
            disabled={clearing}
            className="w-full flex items-center gap-2 px-4 py-3 rounded-xl bg-destructive/10 text-destructive text-sm font-medium hover:bg-destructive/20 transition disabled:opacity-50"
          >
            <Trash className="w-4 h-4" /> Neuer Abend starten (Rotationsdaten löschen)
          </button>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-6 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">{title}</h2>
      {children}
    </div>
  );
}