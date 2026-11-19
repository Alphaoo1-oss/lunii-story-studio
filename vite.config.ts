import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const serverPort = Number(process.env.PORT ?? 5174);
const serverUrl = `http://127.0.0.1:${serverPort}`;

export default defineConfig({
  root: "src/web",
  plugins: [react()],
  resolve: {
    alias: { "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)) },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": serverUrl,
      "/media": serverUrl,
    },
  },
  build: {
    outDir: fileURLToPath(new URL("./dist/web", import.meta.url)),
    emptyOutDir: true,
  },
});
