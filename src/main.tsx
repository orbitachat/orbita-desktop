import React from 'react'
import ReactDOM from 'react-dom/client'
import './services/browserAdapter'
import App from './App'
import './App.css'

const PRELOAD_FONTS = [
  'JetBrains Mono',
  'Inter',
  'Roboto',
  'Open Sans',
  'Montserrat',
  'Rubik',
  'Nunito',
  'Ubuntu',
  'Manrope',
  'Fira Code',
  'Merriweather',
  'Playfair Display',
  'Caveat',
  'Pacifico',
]

async function preloadResourcesAndNotify() {
  if (typeof document !== 'undefined' && document.fonts) {
    try {
      await Promise.allSettled([
        document.fonts.load('21px "Apple Color Emoji"', '😀🎉🚀❤️👍'),
        ...PRELOAD_FONTS.map((font) => document.fonts.load(`14px "${font}"`, 'Orbita 123 abc абв ABC АБВ')),
        ...PRELOAD_FONTS.map((font) => document.fonts.load(`700 14px "${font}"`, 'Orbita 123 abc абв ABC АБВ')),
      ])
      await document.fonts.ready
    } catch {}
  }
  if (window.orbita?.notifyAppReady) {
    window.orbita.notifyAppReady()
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

void preloadResourcesAndNotify()