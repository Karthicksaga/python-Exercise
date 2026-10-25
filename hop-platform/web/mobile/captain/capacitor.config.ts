import { loadEnv } from 'vite';
import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.hop.captain',
  appName: 'Hop Captain',
  webDir: '../../dist/captain',
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false },
  plugins: {
    HopTracking: { apiOrigin: process.env.VITE_MOBILE_API_URL || loadEnv('android', '../../apps/captain', 'VITE_').VITE_MOBILE_API_URL },
    CapacitorCookies: { enabled: true },
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
};
export default config;
