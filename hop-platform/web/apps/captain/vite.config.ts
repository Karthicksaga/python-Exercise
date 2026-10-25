import { defineConfig, mergeConfig } from 'vite';
import base, { appProxy } from '../../vite.base';

export default defineConfig(({ mode }) => mergeConfig(base, {
  build: { outDir: '../../dist/captain', emptyOutDir: true },
  server: { port: 5174, strictPort: true, proxy: appProxy('captain', mode) },
  preview: { port: 5174, strictPort: true, proxy: appProxy('captain', mode) },
}));
