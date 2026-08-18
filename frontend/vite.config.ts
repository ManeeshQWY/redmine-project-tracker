import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Frontend calls the backend only — the backend proxies Redmine and holds the API key.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4001",
        changeOrigin: true,
      },
    },
  },
});
