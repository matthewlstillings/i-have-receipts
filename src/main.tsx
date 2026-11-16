import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { StoreProvider } from './data/store.tsx'
import '@fontsource/hanken-grotesk/latin-400.css'
import '@fontsource/hanken-grotesk/latin-600.css'
import '@fontsource/hanken-grotesk/latin-700.css'
import '@fontsource/syne/latin-600.css'
import '@fontsource/syne/latin-700.css'
import '@fontsource/syne/latin-800.css'
import './styles/app.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <StoreProvider>
        <App />
      </StoreProvider>
    </BrowserRouter>
  </StrictMode>,
)
