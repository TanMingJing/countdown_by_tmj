import { io } from 'socket.io-client';

// Use Vite env variable VITE_WS_URL when provided (set this in Vercel as VITE_WS_URL)
// Fallback to http://localhost:3001 for local development
const WS_URL = (import.meta.env.VITE_WS_URL as string) || 'http://localhost:3001';

export const socket = io(WS_URL);
