import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'markets.manifold',
  appName: 'Manifold Markets',
  webDir: 'out',
  bundledWebRuntime: false,
  // TODO: Do we need this?
  // server: {
  //   allowNavigation: ['oneword-cf74a.firebaseapp.com', 'accounts.google.com'],
  // },
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
