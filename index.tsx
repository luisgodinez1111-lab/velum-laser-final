import { initSentry } from './services/sentry';
// Sentry debe inicializarse antes de montar React para capturar errores tempranos.
initSentry();

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Detectar actualizaciones del Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then(registration => {
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // Hay una nueva versión disponible — notificar al usuario
          const banner = document.createElement('div');
          banner.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#544538;color:#fff;padding:12px 20px;border-radius:12px;font-size:14px;z-index:9999;display:flex;gap:12px;align-items:center;box-shadow:0 4px 20px rgba(0,0,0,0.2)';
          banner.innerHTML = '<span>Nueva versión disponible</span><button style="background:rgba(255,255,255,0.2);border:none;color:#fff;padding:4px 12px;border-radius:8px;cursor:pointer;font-size:13px" onclick="window.location.reload()">Actualizar</button>';
          document.body.appendChild(banner);
          setTimeout(() => banner.remove(), 10_000);
        }
      });
    });
  }).catch(() => {});
}