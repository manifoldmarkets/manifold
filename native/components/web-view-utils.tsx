import WebView, { WebViewProps } from 'react-native-webview'
import { Platform, View } from 'react-native'
import React, { RefObject } from 'react'
import {
  WebViewErrorEvent,
  WebViewRenderProcessGoneEvent,
  WebViewTerminatedEvent,
} from 'react-native-webview/lib/WebViewTypes'
import * as Sentry from 'sentry-expo'
import { SplashLoading } from 'components/splash-loading'
import { log } from 'components/logger'
import { IS_NATIVE_KEY, PLATFORM_KEY } from 'common/src/native-message'
const PREVENT_ZOOM_SET_NATIVE = `(function() {
  const meta = document.createElement('meta'); 
  meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'); 
  meta.setAttribute('name', 'viewport'); 
  document.getElementsByTagName('head')[0].appendChild(meta);
  window.localStorage.setItem('${IS_NATIVE_KEY}', 'true');
  window.localStorage.setItem('${PLATFORM_KEY}', '${Platform.OS}');
})();`
export const sharedWebViewProps: WebViewProps = {
  allowsInlineMediaPlayback: true,
  showsHorizontalScrollIndicator: false,
  showsVerticalScrollIndicator: false,
  pullToRefreshEnabled: true,
  overScrollMode: 'never',
  decelerationRate: 'normal',
  allowsBackForwardNavigationGestures: true,
  sharedCookiesEnabled: true,
  mediaPlaybackRequiresUserAction: true,
  allowsFullscreenVideo: true,
  autoManageStatusBarEnabled: false,
  injectedJavaScript: PREVENT_ZOOM_SET_NATIVE,
}

export const handleWebviewCrash = (
  webview: RefObject<WebView>,
  syntheticEvent: WebViewTerminatedEvent | WebViewRenderProcessGoneEvent,
  callback: () => void
) => {
  const { nativeEvent } = syntheticEvent
  log(
    `Content process terminated, reloading ${Platform.OS}. Error:`,
    nativeEvent
  )
  callback()
  webview.current?.reload()
}

export const handleWebviewError = (
  e: WebViewErrorEvent,
  callback: () => void
) => {
  const { nativeEvent } = e
  log('Webview error', e)
  log('Webview error native event', nativeEvent)
  Sentry.Native.captureException(nativeEvent.description, {
    extra: {
      message: 'webview error',
      nativeEvent,
    },
  })
  callback()
}

export const handleRenderError = (
  e: string | undefined,
  width: number,
  height: number
) => {
  log('error on render webview', e)
  Sentry.Native.captureException(e, {
    extra: {
      message: 'webview render error',
      e,
    },
  })
  // Renders this view while we resolve the error
  return (
    <View style={{ height, width }}>
      <SplashLoading
        height={height}
        width={width}
        source={require('../assets/splash.png')}
      />
    </View>
  )
}
