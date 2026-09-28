import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { store } from '@/database/store';
import { initSync } from '@/services/sync';
import { loadVaultState } from '@/services/vault';
import '@fontsource-variable/geist';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/screens.css';
import './styles/sections.css';
import './styles/v3.css';
import '@/services/player';
import { startUpdater } from '@/services/updater';

// Sin zoom en la app (iOS ignora user-scalable en algunos casos). El dibujo tiene su propio zoom.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener('touchmove', (e) => {
  if (e.touches.length > 1 && !(e.target as Element | null)?.closest?.('.draw-canvas, .map-canvas, .graph-canvas')) e.preventDefault();
}, { passive: false });

void store.init().then(async () => {
  const { runMigrations } = await import('@/services/migrate');
  await runMigrations().catch((e) => console.error('[migrate]', e));
  const splash = document.getElementById('splash');
  if (splash) {
    splash.classList.add('hide');
    setTimeout(() => splash.remove(), 300);
  }
  void initSync();
  void loadVaultState();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.PROD) startUpdater();
