import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';
import { syncManager } from './services/syncManager';

// Initialize offline sync engine & online reconnect listener
syncManager.init();

// Register active PWA Service Worker for installability & full offline support
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      setInterval(() => {
        registration.update().catch(() => {});
      }, 60 * 60 * 1000);
    }
  },
  onOfflineReady() {
    // Offline precache ready
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
