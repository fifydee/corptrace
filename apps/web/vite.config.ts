import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxy = {
  "/health": {
    target: "http://127.0.0.1:8787",
    changeOrigin: true,
  },
  "/sec": {
    target: "http://127.0.0.1:8787",
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
});
