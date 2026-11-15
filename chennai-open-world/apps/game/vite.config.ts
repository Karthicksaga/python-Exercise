import { defineConfig, type Plugin } from "vite";

/**
 * The Android app loads the built game from `file:///android_asset/`. A WebView refuses ES
 * module scripts from `file://` (they count as cross-origin), so the production build is one
 * classic script, and this plugin rewrites the script tag to match.
 */
function classicScript(): Plugin {
  return {
    name: "cow-classic-script",
    apply: "build",
    enforce: "post",
    transformIndexHtml(html) {
      return html.replace(/<script type="module" crossorigin/g, "<script defer");
    },
  };
}

export default defineConfig({
  base: "./",
  // 3D models are imported with `?inline` and embedded in the bundle (see TD-3).
  assetsInclude: ["**/*.glb"],
  plugins: [classicScript()],
  server: { port: 5173, strictPort: true },
  build: {
    target: "es2022",
    modulePreload: false,
    chunkSizeWarningLimit: 4000,
    rollupOptions: { output: { format: "iife", inlineDynamicImports: true } },
  },
});
