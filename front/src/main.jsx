import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import '@fontsource/dm-sans/latin-400.css'
import '@fontsource/dm-sans/latin-500.css'
import '@fontsource/dm-sans/latin-600.css'
import '@fontsource/dm-sans/latin-700.css'
import '@fontsource/press-start-2p/latin-400.css'
import '@fontsource/press-start-2p/cyrillic-400.css'
import '@fontsource/noto-sans/cyrillic-400.css'
import '@fontsource/noto-sans/cyrillic-500.css'
import '@fontsource/noto-sans/cyrillic-600.css'
import '@fontsource/noto-sans/cyrillic-700.css'
import './style.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
