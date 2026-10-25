import { defineConfig, mergeConfig } from 'vite';
import base, { appProxy } from '../../vite.base';

export default defineConfig(({ mode }) => mergeConfig(base, {
  build: { outDir: '../../dist/admin', emptyOutDir: true },
  server: { port: 5175, strictPort: true, proxy: appProxy('admin', mode) },
  preview: { port: 5175, strictPort: true, proxy: appProxy('admin', mode) },
}));
