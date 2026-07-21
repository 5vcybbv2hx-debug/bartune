import React from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { Music, ListMusic, SlidersHorizontal, ClipboardList, Settings as SettingsIcon, Dices } from 'lucide-react';
import NowPlayingBar from '@/components/NowPlayingBar';
import { useSpotifyPlayer } from '@/lib/useSpotifyPlayer';
import { useSettings } from '@/lib/useSettings';

const navItems = (wunschzettelActive) => {
  const items = [
    { to: '/', icon: Music, label: 'Cockpit' },
    { to: '/playlists', icon: ListMusic, label: 'Playlists' },
    { to: '/profile', icon: SlidersHorizontal, label: 'Profile' },
    { to: '/generator', icon: Dices, label: 'Generator' },
  ];
  if (wunschzettelActive) {
    items.push({ to: '/wunschzettel', icon: ClipboardList, label: 'Wunschzettel' });
  }
  items.push({ to: '/settings', icon: SettingsIcon, label: 'Settings' });
  return items;
};

export default function Layout() {
  const location = useLocation();
  const { settings, loading, updateSettings, reload } = useSettings();
  const spotifyConnected = !!(settings?.spotify_access_token);
  const player = useSpotifyPlayer(spotifyConnected);
  const items = navItems(settings?.wunschzettel_active);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="flex items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <span className="text-2xl">🎵</span>
            <span className="text-xl font-extrabold tracking-tight font-heading">BarTune</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {items.map(item => {
              const active = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    active
                      ? 'bg-primary text-primary-foreground neon-glow-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden md:flex items-center gap-2 shrink-0">
            {spotifyConnected ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 border border-success/30">
                <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <span className="text-xs font-mono text-success">{settings?.spotify_user_name || 'Spotify'}</span>
              </div>
            ) : (
              <Link to="/settings" className="text-xs text-muted-foreground hover:text-primary">
                Spotify verbinden →
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-44 md:pb-36">
        <Outlet context={{ settings, player, updateSettings, reload, spotifyConnected }} />
      </main>

      <NowPlayingBar player={player} connected={spotifyConnected} />

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-md pb-safe" style={{ minHeight: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}>
        <div className="flex items-center justify-around py-2">
          {items.map(item => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg transition-all ${
                  active ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}