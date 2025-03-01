import 'expo-asset'
import { registerRootComponent } from 'expo'
import { ExpoRoot } from 'expo-router'

// Must be exported or Fast Refresh won't update the context
export function App() {
  const ctx = require.context('./app')
  return <ExpoRoot context={ctx} />
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App)
