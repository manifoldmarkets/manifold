import { IS_NATIVE_KEY, PLATFORM_KEY } from 'common/native-message'
import { log } from 'components/logger'
import { Splash } from 'components/splash'
import { RefObject, useState } from 'react'
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import WebView, { WebViewProps } from 'react-native-webview'
import {
  WebViewErrorEvent,
  WebViewRenderProcessGoneEvent,
  WebViewTerminatedEvent,
} from 'react-native-webview/lib/WebViewTypes'
import { AuthPageStyles } from './auth-page'

const PREVENT_ZOOM_SET_NATIVE = `(function() {
  const meta = document.createElement('meta'); 
  meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'); 
  meta.setAttribute('name', 'viewport'); 
  document.getElementsByTagName('head')[0].appendChild(meta);
  window.localStorage.setItem('${IS_NATIVE_KEY}', 'true');
  window.localStorage.setItem('${PLATFORM_KEY}', '${Platform.OS}');
})();`
const isIOS = Platform.OS === 'ios'

export const CustomWebview = (props: {
  urlToLoad: string
  webview: RefObject<WebView>
  resetWebView: () => void
  setHasLoadedWebView: (loaded: boolean) => void
  handleMessageFromWebview: (m: any) => Promise<void>
  handleExternalLink: (url: string) => void
  display: boolean
}) => {
  const {
    urlToLoad,
    webview,
    resetWebView,
    setHasLoadedWebView,
    handleMessageFromWebview,
    handleExternalLink,
    display,
  } = props

  const [refreshing, setRefreshing] = useState(false)
  const [refresherEnabled, setEnableRefresher] = useState(true)
  //Code to get scroll position
  const handleScroll = (event: any) => {
    const yOffset = Number(event.nativeEvent.contentOffset.y)
    if (yOffset === 0) {
      // Top of the page
      setEnableRefresher(true)
    } else if (refresherEnabled) {
      setEnableRefresher(false)
    }
  }

  return (
    <View
      style={display ? styles.rootVisible : styles.rootHidden}
      pointerEvents={display ? 'auto' : 'none'}
    >
      {Platform.OS === 'android' ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.container, { position: 'relative' }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              enabled={refresherEnabled}
              onRefresh={() => {
                webview.current?.reload()
                setRefreshing(true)
              }}
            />
          }
        >
          <WebView
            {...sharedWebViewProps}
            style={styles.webView}
            onLoadEnd={() => {
              console.log('WebView onLoadEnd for url:', urlToLoad)
              setHasLoadedWebView(true)
              setRefreshing(false)
            }}
            source={{ uri: urlToLoad }}
            ref={webview}
            onError={(e) => handleWebviewError(e, resetWebView)}
            renderError={(e) => handleRenderError(e)}
            onOpenWindow={(e) => handleExternalLink(e.nativeEvent.targetUrl)}
            onRenderProcessGone={(e) => handleWebviewKilled(e, resetWebView)}
            onContentProcessDidTerminate={(e) =>
              handleWebviewKilled(e, resetWebView)
            }
            onScroll={handleScroll}
            onMessage={async (m) => {
              try {
                await handleMessageFromWebview(m)
              } catch (e) {
                console.log('Error in handleMessageFromWebview', e)
              }
            }}
          />
        </ScrollView>
      ) : (
        <View style={[styles.container, { position: 'relative' }]}>
          <WebView
            {...sharedWebViewProps}
            style={styles.webView}
            onLoadEnd={() => {
              console.log('WebView onLoadEnd for url:', urlToLoad)
              setHasLoadedWebView(true)
              setRefreshing(false)
            }}
            source={{ uri: urlToLoad }}
            ref={webview}
            onError={(e) => handleWebviewError(e, resetWebView)}
            renderError={(e) => handleRenderError(e)}
            onOpenWindow={(e) => handleExternalLink(e.nativeEvent.targetUrl)}
            onRenderProcessGone={(e) => handleWebviewKilled(e, resetWebView)}
            onContentProcessDidTerminate={(e) =>
              handleWebviewKilled(e, resetWebView)
            }
            onMessage={async (m) => {
              try {
                await handleMessageFromWebview(m)
              } catch (e) {
                console.log('Error in handleMessageFromWebview', e)
              }
            }}
          />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  rootVisible: {
    flex: 1,
    opacity: 1,
  },
  rootHidden: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
  },
  container: {
    display: 'flex',
    flex: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  webView: {
    display: 'flex',
    overflow: 'hidden',
    marginTop: 0,
    marginBottom: 0,
  },
})

const sharedWebViewProps: WebViewProps = {
  allowsInlineMediaPlayback: true,
  showsHorizontalScrollIndicator: false,
  showsVerticalScrollIndicator: false,
  pullToRefreshEnabled: true,
  overScrollMode: 'never',
  decelerationRate: 0.998,
  allowsBackForwardNavigationGestures: true,
  sharedCookiesEnabled: true,
  mediaPlaybackRequiresUserAction: true,
  allowsFullscreenVideo: true,
  autoManageStatusBarEnabled: false,
  injectedJavaScript: PREVENT_ZOOM_SET_NATIVE,
  cacheEnabled: true,
}

const handleWebviewKilled = (
  syntheticEvent: WebViewTerminatedEvent | WebViewRenderProcessGoneEvent,
  callback: () => void
) => {
  log(
    `Content process terminated, reloading ${Platform.OS}. Error:`,
    syntheticEvent.nativeEvent
  )
  callback()
}

const handleWebviewError = (e: WebViewErrorEvent, callback: () => void) => {
  const { nativeEvent } = e
  log('Webview error native event', nativeEvent)

  callback()
}

const handleRenderError = (e: string | undefined) => {
  log('error on render webview', e)

  // Renders this view while we resolve the error
  return (
    <View style={AuthPageStyles.container}>
      <Splash />
    </View>
  )
}
