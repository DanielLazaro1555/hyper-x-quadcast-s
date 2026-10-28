import { defineConfig } from "vite";

// En desarrollo, la web habla con el servicio local a través de este proxy: así
// el navegador solo ve un origen y el servicio no necesita CORS.
export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:7878", changeOrigin: true },
    },
  },
});
