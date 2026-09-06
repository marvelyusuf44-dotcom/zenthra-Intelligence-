import { createRoot } from 'react-dom/client';
import { setBaseUrl } from '@workspace/api-client-react';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

// Production ships as one combined Vercel deployment (see the root
// vercel.json — it builds the API as a serverless function alongside this
// app under the same domain), so the API is same-origin and no base URL is
// needed. VITE_API_BASE_URL only matters if you ever split the API out to
// a separate origin — leave it unset for the normal single-domain setup.
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
