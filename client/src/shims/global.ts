// Shim to provide `global` in browser environments for libraries that expect Node globals
// It must be imported before any library that expects `global` (e.g., socket.io-client, simple-peer)
(window as any).global = window;

// Provide a minimal `process.env.NODE_ENV` for libraries that check it
;(window as any).process = (window as any).process || { env: { NODE_ENV: import.meta.env.MODE } };
