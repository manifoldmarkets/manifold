import WebView, { WebViewProps } from 'react-native-webview'
import {
  Platform,
  Pressable,
  Share,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { AntDesign, Feather } from '@expo/vector-icons'
import React, { useRef, useState } from 'react'
import {
  WebViewErrorEvent,
  WebViewRenderProcessGoneEvent,
  WebViewTerminatedEvent,
} from 'react-native-webview/lib/WebViewTypes'
import * as Sentry from 'sentry-expo'
import { SplashLoading } from 'components/splash-loading'
const isIOS = Platform.OS === 'ios'

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
}

export const handleWebviewCrash = (
  webview: WebView | undefined,
  syntheticEvent: WebViewTerminatedEvent | WebViewRenderProcessGoneEvent
) => {
  const { nativeEvent } = syntheticEvent
  console.warn(
    `Content process terminated, reloading ${Platform.OS} `,
    nativeEvent
  )
  webview?.reload()
}

export const handleWebviewError = (
  e: WebViewErrorEvent,
  callback: () => void
) => {
  const { nativeEvent } = e
  console.log('error in webview', e)
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
  console.log('error on render webview', e)
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

export const ExternalWebView = (props: {
  url: string | undefined
  setUrl: (url: string | undefined) => void
  height: number
  width: number
}) => {
  const { url, height, setUrl, width } = props
  const webview = useRef<WebView>()
  const [loading, setLoading] = useState(false)

  if (!url) return <View />

  const toolbarHeight = isIOS ? 90 : 75
  const styles = StyleSheet.create({
    container: {
      height,
      display: 'flex',
    },
    webView: {
      display: 'flex',
      overflow: 'hidden',
      marginTop: (isIOS ? 0 : RNStatusBar.currentHeight ?? 0) + toolbarHeight,
      marginBottom: !isIOS ? 10 : 0,
    },
    toolbar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: toolbarHeight,
      backgroundColor: 'lightgray',
      zIndex: 100,
    },
    row: {
      flexDirection: 'row',
      flex: 1,
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      marginBottom: 15,
      marginHorizontal: 20,
    },
    toolBarText: {
      fontSize: 20,
      width: 50,
    },
    toolBarPress: {
      width: 60,
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'center',
    },
  })

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <View style={styles.row}>
          <Pressable
            style={[styles.toolBarPress, { justifyContent: 'flex-start' }]}
            onPress={() => setUrl(undefined)}
          >
            <Text style={styles.toolBarText}>Done</Text>
          </Pressable>
          <Pressable
            style={styles.toolBarPress}
            onPress={async () => {
              await Share.share({
                message: url,
              })
            }}
          >
            <Feather name="share" size={24} color="black" />
          </Pressable>
          <Pressable
            style={[styles.toolBarPress, { justifyContent: 'flex-end' }]}
            onPress={() => {
              if (loading) {
                webview.current?.stopLoading()
                setLoading(false)
              } else {
                webview.current?.reload()
                setLoading(true)
              }
            }}
          >
            {loading ? (
              <Feather name="x" size={24} color="black" />
            ) : (
              <AntDesign name="reload1" size={24} color="black" />
            )}
          </Pressable>
        </View>
      </View>
      <WebView
        {...sharedWebViewProps}
        onLoadEnd={() => setLoading(false)}
        onLoadStart={() => setLoading(true)}
        onError={(e) => handleWebviewError(e, () => setUrl(undefined))}
        style={styles.webView}
        source={{ uri: url }}
        // @ts-ignore
        ref={webview}
        renderError={(e) => handleRenderError(e, width, height)}
        onRenderProcessGone={(e) => handleWebviewCrash(webview.current, e)}
        onContentProcessDidTerminate={(e) =>
          handleWebviewCrash(webview.current, e)
        }
      />
    </View>
  )
}
