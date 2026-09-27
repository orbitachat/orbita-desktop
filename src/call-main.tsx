import React from 'react'
import ReactDOM from 'react-dom/client'
import { CallWindowView } from './components/call/CallWindowView'
import './App.css'
import './i18n'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <CallWindowView />
  </React.StrictMode>,
)
