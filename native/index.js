import 'expo-asset'
import { registerRootComponent } from 'expo'
import { Platform } from 'react-native'

import App from './App'

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App)

// Android only: register the headless task that redraws the home-screen streak
// widget when the OS asks (add / resize / reboot / periodic). require()d behind a
// Platform check so the widget library is never loaded on iOS.
if (Platform.OS === 'android') {
  const { registerWidgetTaskHandler } = require('react-native-android-widget')
  const { widgetTaskHandler } = require('./widgets/widget-task-handler')
  registerWidgetTaskHandler(widgetTaskHandler)
}
