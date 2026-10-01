import React from 'react'
import ReactDOM from 'react-dom/client'
import './services/browserAdapter'
import App from './App'
import './App.css'

async function preloadResourcesAndNotify() {
  if (typeof document !== 'undefined' && document.fonts) {
    try {
      await document.fonts.ready;
    } catch {}
  }
  if (window.orbita?.notifyAppReady) {
    window.orbita.notifyAppReady();
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

void preloadResourcesAndNotify()