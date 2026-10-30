import { useEffect } from 'react'

import { useNativeInfo } from 'web/components/native-message-provider'
import { postMessageToNative } from 'web/lib/native/post-message'

// Asks the Android app to switch its pull-to-refresh off while this page is
// open. For pages where a downward swipe means something else, like Predictle's
// drag-to-reorder cards: at the top of the page, Android gives a downward swipe
// to the app's refresh control before the page sees it. The app's message
// bridge reports only the sender's origin, so the request carries this page's
// address, and the app turns refresh back on once it moves to another page.
// Does nothing outside the app or on iOS.
export function useDisableNativePullToRefresh() {
  // On a first load the page's effects run before NativeMessageProvider learns
  // it's inside the app, and postMessageToNative drops messages until then. So
  // send once it knows.
  const { isNative } = useNativeInfo()
  useEffect(() => {
    if (!isNative) return
    postMessageToNative('setPullToRefresh', {
      enabled: false,
      url: window.location.href,
    })
    return () => postMessageToNative('setPullToRefresh', { enabled: true })
  }, [isNative])
}
