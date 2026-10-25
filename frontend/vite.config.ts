import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev mode proxies /api to the local FastAPI backend so both share one origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://127.0.0.1:8420", changeOrigin: false } },
  },
  build: { outDir: "dist", sourcemap: false },
});
