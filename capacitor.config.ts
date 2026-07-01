import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: "com.narsil.museum",
  appName: "Narsil",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
