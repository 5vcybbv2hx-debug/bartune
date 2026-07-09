import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function SpotifyCallback() {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const err = params.get('error');

    if (err) {
      setStatus('error');
      setError('Spotify-Autorisierung abgelehnt: ' + err);
      return;
    }

    if (!code) {
      setStatus('error');
      setError('Kein Autorisierungscode erhalten.');
      return;
    }

    base44.functions.invoke('spotifyCallback', { code })
      .then(() => {
        window.location.href = '/settings';
      })
      .catch((e) => {
        setStatus('error');
        setError(e.response?.data?.error || e.message || 'Unbekannter Fehler');
      });
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        {status === 'loading' && (
          <>
            <div className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
            <h1 className="text-lg font-bold mb-1">Verbinde mit Spotify...</h1>
            <p className="text-sm text-muted-foreground">Bitte warte einen Moment.</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 rounded-full bg-destructive/10 border border-destructive/30 flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-destructive" />
            </div>
            <h1 className="text-lg font-bold mb-1">Verbindung fehlgeschlagen</h1>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <a
              href="/settings"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium"
            >
              Zu den Settings
            </a>
          </>
        )}
      </div>
    </div>
  );
}