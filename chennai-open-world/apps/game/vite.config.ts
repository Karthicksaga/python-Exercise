import { defineConfig, type Plugin } from "vite";

/**
 * The production build is one classic script (TD-3), and this plugin rewrites the script tag to
 * match. It was needed while the Android app loaded the game from `file:///android_asset/`, where
 * a WebView refuses ES module scripts; the app now uses an https origin (TD-16), but the classic
 * script and `base: "./"` are kept so the build also opens from disk and from any folder.
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
