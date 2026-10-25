import { defineConfig, mergeConfig } from 'vite';
import base, { appProxy } from '../../vite.base';

export default defineConfig(({ mode }) => mergeConfig(base, {
  build: { outDir: '../../dist/rider', emptyOutDir: true },
  server: { port: 5173, strictPort: true, proxy: appProxy('rider', mode) },
  preview: { port: 5173, strictPort: true, proxy: appProxy('rider', mode) },
}));
