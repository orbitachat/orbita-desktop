import React from 'react'
import ReactDOM from 'react-dom/client'
import './services/browserAdapter'
import App from './App'
import './App.css'

// Предзагрузка шрифта эмодзи в память и растровый кеш браузера при старте приложения
if (typeof document !== 'undefined' && document.fonts) {
  document.fonts.load('21px "Apple Color Emoji"', '😀🎉🚀❤️👍').catch(() => {});
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)