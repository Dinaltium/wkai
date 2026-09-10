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
    // Bind every interface, not just localhost: a phone or a second laptop on
    // the same wifi is the whole point of testing this app, and it cannot
    // resolve "localhost" to this machine.
    host: true,
    proxy: {
      '/api': process.env.VITE_BACKEND_URL ?? 'http://localhost:4000',
      '/ws': {
        target: (process.env.VITE_BACKEND_URL ?? 'http://localhost:4000').replace('http', 'ws'),
        ws: true,
      },
    },
  },
});
