Deploying the client to Vercel

1) Create a new Vercel project and select your repository.

2) If your repo is a monorepo, set the Root Directory to `client`.

3) Build & Output settings:
   - Framework Preset: Vite (or leave as Other)
   - Build Command: npm run build
   - Output Directory: dist

4) Environment variables:
   - VITE_WS_URL — set this to your server's public URL (e.g. https://your-server.onrender.com). This will be embedded at build time.

5) Deploy. When Vercel finishes, visit the production URL.

Notes:
- `vercel.json` in this folder rewrites all routes to `index.html` so client-side routing works (prevents 404 on refresh/direct links).
- If you change `VITE_WS_URL`, re-deploy the site so the new env var is built into the bundle.
