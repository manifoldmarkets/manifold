import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'markets.manifold',
  appName: 'Manifold Markets',
  webDir: 'out',
  bundledWebRuntime: false,
  server: {
    // Allow these sites to be loaded from the webview
    allowNavigation: ['mantic-markets.firebaseapp.com', 'accounts.google.com'],
  },
  plugins: {
    CapacitorFirebaseAuth: {
      providers: ['google.com'],
      languageCode: 'en',
      permissions: {
        google: ['profile'],
      },
    },
  },
}

export default config
