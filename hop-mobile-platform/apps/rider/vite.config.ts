import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL(".", import.meta.url));
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, "");
  return {
    root,
    publicDir: "public",
    envDir: root,
    define: { "import.meta.env.VITE_HOP_ROLE": JSON.stringify("rider") },
    build: { outDir: "../../dist/rider", emptyOutDir: true },
    server: {
      host: "127.0.0.1",
      port: 5183,
      strictPort: true,
      fs: { allow: [fileURLToPath(new URL("../../../", import.meta.url))] },
      proxy: Object.fromEntries(
        ["/api", "/auth"].map((prefix) => [
          prefix,
          {
            target: env.BACKEND_URL || "http://localhost:8080",
            changeOrigin: true,
            headers: { "X-Hop-App": "rider" },
          },
        ]),
      ),
    },
    resolve: {
      alias: {
        "@prototype": fileURLToPath(
          new URL(
            "../../../hop-platform/prototypes/mobile-first",
            import.meta.url,
          ),
        ),
        "@shared": fileURLToPath(new URL("../../shared", import.meta.url)),
      },
    },
  };
});
