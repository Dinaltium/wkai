import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': process.env.VITE_BACKEND_URL ?? 'http://localhost:4000',
      '/ws': {
        target: (process.env.VITE_BACKEND_URL ?? 'http://localhost:4000').replace('http', 'ws'),
        ws: true,
      },
    },
  },
});
