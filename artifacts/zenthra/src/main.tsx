import { createRoot } from 'react-dom/client';
import { setBaseUrl } from '@workspace/api-client-react';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

// Di Replit, frontend & API sama-sama di-proxy lewat "/api" (1 origin), jadi
// base URL gak perlu diset. Begitu frontend (Vercel) dan API (Railway) jadi
// dua origin terpisah, VITE_API_BASE_URL wajib diisi — lihat .env.example.
setBaseUrl(import.meta.env.VITE_API_BASE_URL ?? null);

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
