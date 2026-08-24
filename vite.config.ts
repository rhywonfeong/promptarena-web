import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackRouter({ target: "react", autoCodeSplitting: true }), // 必须在 react() 之前
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      // 「同域代理」开关在本地 dev 的等价物：/api/or/* → openrouter.ai
      // （生产是 wrangler.jsonc 的透传 Worker；前提开发机可直连 openrouter）
      "/api/or/": {
        target: "https://openrouter.ai",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/or/, ""),
      },
      // IP 归属地检测的 dev 等价物（生产在 Worker 里报 cf.country）
      "/api/loc": {
        target: "https://www.cloudflare.com",
        changeOrigin: true,
        rewrite: () => "/cdn-cgi/trace",
      },
    },
  },
});
