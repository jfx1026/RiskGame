import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.strategery2.app',
  appName: 'Strategery2',
  webDir: 'dist',
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: false,
    scrollEnabled: false
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#0f0f1a'
    }
  }
};

export default config;
