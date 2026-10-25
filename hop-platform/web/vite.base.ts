import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  publicDir: path.join(root, 'packages/shared/public'),
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('leaflet')) return 'leaflet';
          if (id.includes('@vis.gl') || id.includes('googlemaps')) return 'gmaps';
          if (id.includes('@mantine') || id.includes('@floating-ui') || id.includes('react-remove-scroll')) return 'mantine';
          if (id.includes('@tabler')) return 'icons';
          if (id.includes('/react/') || id.includes('react-dom') || id.includes('scheduler')) return 'react';
          return undefined;
        },
      },
    },
  },

});

// Each app has its own origin and cookie namespace, over the same API.
export function appProxy(app: 'rider' | 'captain' | 'admin', mode: string) {
  const env = loadEnv(mode, path.join(root, 'apps', app), '');
  const target = process.env.BACKEND_URL || env.BACKEND_URL || 'http://localhost:8080';
  return Object.fromEntries(['/api', '/auth'].map(prefix => [prefix, {
    target, headers: { 'X-Hop-App': app },
  }]));
}
