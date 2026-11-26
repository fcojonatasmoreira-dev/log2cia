import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const registrarServiceWorker = () => {
    navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    }).catch(() => {});
  };

  if (document.readyState === 'complete') {
    registrarServiceWorker();
  } else {
    window.addEventListener('load', registrarServiceWorker, { once: true });
  }
}
