import { loadEnv } from 'vite';
import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.hop.rider',
  appName: 'Hop Rider',
  webDir: '../../dist/rider',
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false },
  plugins: {
    HopTracking: { apiOrigin: process.env.VITE_MOBILE_API_URL || loadEnv('android', '../../apps/rider', 'VITE_').VITE_MOBILE_API_URL },
    CapacitorCookies: { enabled: true },
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
};
export default config;
