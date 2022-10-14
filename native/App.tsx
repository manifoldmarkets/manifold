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
import { doc, getFirestore, getDoc, updateDoc } from 'firebase/firestore'
import Constants, { ExecutionEnvironment } from 'expo-constants'
import 'expo-dev-client'
import CookieManager from '@react-native-cookies/cookies'

const TEN_YEARS_SECS = 60 * 60 * 24 * 365 * 10
const isExpoClient =
  Constants.ExecutionEnvironment === ExecutionEnvironment.StoreClient
// Initialize Firebase
const app = initializeApp({
  // prod:
  // apiKey: 'AIzaSyDp3J57vLeAZCzxLD-vcPaGIkAmBoGOSYw',
  // authDomain: 'mantic-markets.firebaseapp.com',
  // projectId: 'mantic-markets',
  // region: 'us-central1',
  // storageBucket: 'mantic-markets.appspot.com',
  // messagingSenderId: '128925704902',
  // appId: '1:128925704902:web:f61f86944d8ffa2a642dc7',
  // measurementId: 'G-SSFK1Q138D',

  // dev:
  apiKey: 'AIzaSyBoq3rzUa8Ekyo3ZaTnlycQYPRCA26VpOw',
  authDomain: 'dev-mantic-markets.firebaseapp.com',
  projectId: 'dev-mantic-markets',
  storageBucket: 'dev-mantic-markets.appspot.com',
  messagingSenderId: '134303100058',
  appId: '1:134303100058:web:27f9ea8b83347251f80323',
  measurementId: 'G-YJC9E37P37',
})
const firestore = getFirestore(app)

// no other uri works for API requests due to CORS
const uri = 'http://localhost:3000/'

export default function App() {
  const [fbUser, setFbUser] = useState<string | null>()
  const auth = getAuth(app)

  // way to cache these credentials?
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    //prod:
    // clientId: '128925704902-bpcbnlp2gt73au3rrjjtnup6cskr89p0.apps.googleusercontent.com',
    //dev:
    iosClientId:
      '134303100058-pe0f0oc28cv4u7o3tf3m0021utva0u55.apps.googleusercontent.com',
    expoClientId:
      '134303100058-2uvio555s8mnhde20b4old97ptjnji3u.apps.googleusercontent.com',
  })
  const webview = useRef<WebView>()

  const testFirestore = async () => {
    const currentUserId = auth.currentUser
    console.log('currentUserId', currentUserId)
    // get user doc:
    const userDoc = doc(firestore, 'users', currentUserId?.uid)
    const userDocSnap = (await getDoc(userDoc)).data()
    console.log('userDocSnap', userDocSnap)
    await updateDoc(doc(firestore, 'users', '6hHpzvRG0pMq8PNJs7RZj2qlZGn2'), {
      website: 'Ian ' + Date.now().toString(),
    })
  }
  const [hasInjectedVariable, setHasInjectedVariable] = useState(false)
  const useWebKit = true
  // We can't just login to google within the webview: see https://developers.googleblog.com/2021/06/upcoming-security-changes-to-googles-oauth-2.0-authorization-endpoint.html#instructions-ios
  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params
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
            name: 'FBUSER_DEV_MANTIC_MARKETS',
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
      if (!fbUser) {
        promptAsync()
      } else {
        console.log('already logged in', fbUser)
        webview.current.postMessage(
          JSON.stringify({ type: 'nativeFbUser', data: fbUser })
        )
      }
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
