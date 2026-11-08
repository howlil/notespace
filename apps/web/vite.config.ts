import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const codeRunnerWorkerPath = "/code-runner-worker.js";
const codeRunnerWorkerCsp = "frame-ancestors 'none'; default-src 'none'; script-src 'unsafe-eval'; connect-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'";

function codeRunnerWorkerHeaders() {
  const applyHeaders = (server: { middlewares: { use: (handler: (request: { url?: string; headers: Record<string, string | string[] | undefined> }, response: { setHeader: (name: string, value: string) => void; statusCode: number; end: () => void }, next: () => void) => void) => void } }) => {
    server.middlewares.use((request, response, next) => {
      const pathname = request.url?.split("?", 1)[0];
      const destination = request.headers["sec-fetch-dest"];
      if (pathname === codeRunnerWorkerPath && destination && destination !== "worker") {
        response.statusCode = 404;
        response.end();
        return;
      }
      if (pathname === codeRunnerWorkerPath) {
        response.setHeader("Content-Security-Policy", codeRunnerWorkerCsp);
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Cache-Control", "no-store");
      }
      next();
    });
  };

  return {
    name: "notespace-code-runner-worker-headers",
    configureServer: applyHeaders,
    configurePreviewServer: applyHeaders,
  };
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    codeRunnerWorkerHeaders(),
    tanstackStart({
      spa: { enabled: true, prerender: { outputPath: "/index" } },
    }),
    react(),
  ],
  // Keep prerender's preview listener and fetch on the same loopback family in Docker.
  preview: { host: "127.0.0.1" },
  server: {
    strictPort: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:8080", changeOrigin: false },
    },
  },
});
