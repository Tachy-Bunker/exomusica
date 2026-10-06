import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // module workers can split their code, so each audio codec is fetched only when its format is first used
  worker: { format: "es" },
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:3001",
      "/ws": { target: "ws://localhost:3001", ws: true },
    },
  },
});
