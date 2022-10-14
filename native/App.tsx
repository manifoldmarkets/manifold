import { useEffect, useRef, useState } from 'react'
import * as Google from 'expo-auth-session/providers/google'
import { Button, View } from 'react-native'
import WebView from 'react-native-webview'
import {
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
} from 'firebase/auth'
import { initializeApp } from 'firebase/app'
import Constants, { ExecutionEnvironment } from 'expo-constants'
import 'expo-dev-client'
import CookieManager from '@react-native-cookies/cookies'
import { AUTH_COOKIE_NAME, ENV_CONFIG } from 'common/envs/constants'

const TEN_YEARS_SECS = 60 * 60 * 24 * 365 * 10
const isExpoClient =
  Constants.ExecutionEnvironment === ExecutionEnvironment.StoreClient
// Initialize Firebase
console.log('using ', process.env.NEXT_PUBLIC_FIREBASE_ENV, 'env')
console.log('env not switching? run `expo start --clear` and then try again')
const isDev = process.env.NEXT_PUBLIC_FIREBASE_ENV === 'DEV'
const app = initializeApp(ENV_CONFIG.firebaseConfig)
// no other uri works for API requests due to CORS
const uri = 'http://localhost:3000/'

export default function App() {
  const [fbUser, setFbUser] = useState<string | null>()
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest(
    isDev
      ? {
          //dev:
          iosClientId:
            '134303100058-pe0f0oc28cv4u7o3tf3m0021utva0u55.apps.googleusercontent.com',
          expoClientId:
            '134303100058-2uvio555s8mnhde20b4old97ptjnji3u.apps.googleusercontent.com',
        }
      : {
          //prod:
          iosClientId:
            '128925704902-6ci48vjqud9ddcl436go5ma3m9ceei4k.apps.googleusercontent.com',
          clientId:
            '128925704902-bpcbnlp2gt73au3rrjjtnup6cskr89p0.apps.googleusercontent.com',
        }
  )
  const webview = useRef<WebView>()
  const [hasInjectedVariable, setHasInjectedVariable] = useState(false)
  const useWebKit = true
  // We can't just login to google within the webview: see https://developers.googleblog.com/2021/06/upcoming-security-changes-to-googles-oauth-2.0-authorization-endpoint.html#instructions-ios
  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params
      const auth = getAuth(app)
      const credential = GoogleAuthProvider.credential(id_token)
      signInWithCredential(auth, credential).then((result) => {
        const fbUser = result.user.toJSON()
        if (webview.current) {
          webview.current.postMessage(
            JSON.stringify({ type: 'nativeFbUser', data: fbUser })
          )
        }
        setFbUser(JSON.stringify(fbUser))
      })
    }
  }, [response])

  useEffect(() => {
    console.log('is expo client:', isExpoClient)
    if (fbUser) {
      !isExpoClient &&
        CookieManager.set(
          uri,
          {
            name: AUTH_COOKIE_NAME,
            value: encodeURIComponent(fbUser),
            path: '/',
            expires: new Date(TEN_YEARS_SECS).toISOString(),
            secure: true,
          },
          useWebKit
        )
    }
  }, [])

  // Add this
  const handleMessage = ({ nativeEvent }) => {
    if (nativeEvent.data === 'googleLoginClicked') {
      console.log('googleLoginClicked')
      promptAsync()
    } else if (nativeEvent.data.includes('user')) {
      // on reload the fb user from webview cache, set the fb user
      console.log('setting fb user from webciew cache')
      setFbUser(nativeEvent.data)
    } else if (nativeEvent.data === 'signOut') {
      console.log('signOut')
      setFbUser(null)
      !isExpoClient && CookieManager.clearAll(useWebKit)
    } else {
      console.log('nativeEvent.data', nativeEvent.data)
    }
  }

  return (
    <>
      <WebView
        style={{ marginTop: 20 }}
        allowsBackForwardNavigationGestures={true}
        sharedCookiesEnabled={true}
        source={{ uri }}
        ref={webview}
        onMessage={handleMessage}
        onNavigationStateChange={async (navState) => {
          if (!navState.loading && !hasInjectedVariable && webview.current) {
            webview.current.injectJavaScript('window.isNative = true')
            setHasInjectedVariable(true)
          }
        }}
      />

      {!fbUser && (
        <View
          style={{
            alignItems: 'center',
            width: 400,
            height: 200,
            marginTop: 40,
          }}
        >
          <Button
            disabled={!request}
            title="Login"
            color={'black'}
            onPress={() => {
              promptAsync()
            }}
          />
        </View>
      )}
    </>
  )
}
