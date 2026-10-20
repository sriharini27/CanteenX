import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api is proxied to Flask so the browser talks to one origin during development
export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1200 },
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:5000", "/uploads": "http://127.0.0.1:5000" } },
});
