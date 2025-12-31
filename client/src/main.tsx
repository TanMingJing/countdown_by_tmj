// Define Node-like globals in the browser before importing other modules.
// Inlining here avoids plugin import-order transforms that can break when a plugin
// injects imports into the shim file.
;(globalThis as any).global = globalThis;
;(globalThis as any).process = (globalThis as any).process || { env: { NODE_ENV: import.meta.env.MODE } };
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
