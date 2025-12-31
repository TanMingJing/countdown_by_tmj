Render deployment steps for `server` (Socket.IO)

1) Create a Render account and connect your Git repository.

2) Create a new Web Service:
   - In Render dashboard choose New → Web Service
   - Connect the repository containing this project
   - Set the Root Directory to `server`
   - Build Command: (leave empty if none)
   - Start Command: `node index.js`
   - Environment: choose the region and plan you want

3) Environment variables:
   - `CLIENT_ORIGIN` — set this to your Vercel client URL (e.g. `https://your-app.vercel.app`) to restrict CORS in production. If omitted, CORS allows all origins.

4) Deploy. Render will provide a stable public URL (e.g. https://your-server.onrender.com).

5) Update client to connect to the server URL:
   - On Vercel, set an environment variable `VITE_WS_URL` to your Render URL, e.g. `https://your-server.onrender.com`
   - Re-deploy the client on Vercel so the new env var is baked into the build.

6) Verify:
   - Visit the Render service URL in a browser — the root path returns `OK` (health check).
   - Open the client deployed on Vercel and verify real-time features connect.

Notes:
- Render supports persistent WebSocket and long-lived Node processes so it will work with your existing Socket.IO server.
- If you want TLS/domain or other customization, configure it via Render's dashboard.
