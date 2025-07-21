import { User as FirebaseUser } from '@firebase/auth'
import { AuthPage } from 'components/auth-page'
import { Splash } from 'components/splash'
import React, { useEffect } from 'react'
import { ImageSourcePropType } from 'react-native'
import WebView from 'react-native-webview'

export const SplashAuth = (props: {
  webview: React.RefObject<WebView | undefined>
  height: number
  width: number
  source: ImageSourcePropType
  hasLoadedWebView: boolean
  fbUser: FirebaseUser | null
  isConnected: boolean
}) => {
  const {
    isConnected,
    hasLoadedWebView,
    fbUser,
    webview,
    width,
    height,
    source,
  } = props

  useEffect(() => {
    if (!isConnected) {
      alert("You're offline. Please reconnect to the internet to use Manifold.")
    }
  }, [isConnected])
  if (!isConnected) {
    return <Splash height={height} width={width} source={source} />
  }
  if (!hasLoadedWebView)
    return <Splash height={height} width={width} source={source} />
  else if (hasLoadedWebView && !fbUser)
    return <AuthPage webview={webview} height={height} width={width} />
  else return <></>
}
