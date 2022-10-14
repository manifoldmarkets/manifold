import { forwardRef, useEffect, useRef, useState } from 'react'
import * as Google from 'expo-auth-session/providers/google'
import { Button, Platform, View } from 'react-native'
import WebView, { WebViewProps } from 'react-native-webview'
import {
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
} from 'firebase/auth'
import { initializeApp } from 'firebase/app'
import {
  doc,
  getFirestore,
  setDoc,
  getDoc,
  updateDoc,
} from 'firebase/firestore'
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
const uri = 'http://localhost:3000/'
// ? 'https://a6f7-154-9-128-144.ngrok.io'
// : // : 'https://b9d7-24-128-53-123.ngrok.io'
// const url = 'https://24f6-71-218-239-220.ngrok.io/IanPhilips';

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
  // we can't just login to google via webview: see https://developers.googleblog.com/2021/06/upcoming-security-changes-to-googles-oauth-2.0-authorization-endpoint.html#instructions-ios
  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params
      const credential = GoogleAuthProvider.credential(id_token)
      // on sign in from the native side, pass the webview the fb user
      signInWithCredential(auth, credential).then((result) => {
        const fbUserPrint = JSON.stringify(result.user, null, 2) // spacing level = 2
        const fbUser = result.user.toJSON()

        if (webview.current) {
          console.log('setting fbUser', fbUserPrint.slice(0, 100))
          testFirestore()
          webview.current.postMessage(
            // token
            //   JSON.stringify({
            //     type: 'nativeFbUser',
            //     data: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJodHRwczovL2lkZW50aXR5dG9vbGtpdC5nb29nbGVhcGlzLmNvbS9nb29nbGUuaWRlbnRpdHkuaWRlbnRpdHl0b29sa2l0LnYxLklkZW50aXR5VG9vbGtpdCIsImlhdCI6MTY2NTc1OTIzNSwiZXhwIjoxNjY1NzYyODM1LCJpc3MiOiJmaXJlYmFzZS1hZG1pbnNkay1zaXI1bUBkZXYtbWFudGljLW1hcmtldHMuaWFtLmdzZXJ2aWNlYWNjb3VudC5jb20iLCJzdWIiOiJmaXJlYmFzZS1hZG1pbnNkay1zaXI1bUBkZXYtbWFudGljLW1hcmtldHMuaWFtLmdzZXJ2aWNlYWNjb3VudC5jb20iLCJ1aWQiOiI2aEhwenZSRzBwTXE4UE5KczdSWmoycWxaR24yIn0.OP3RlXe8JXicZFzT6oQu0DrmsfrHewk2kSRsY0RMvkSl7NxXaX7JOhcZqoFAtOuk7Mk8XxRPKsfFBovjsG5r42WzoY6pCwu1t9QWxZS8uxmhMOPnsUd0dWWOCU2Fy4HqYtc39plz9i2tMNsGNyl93VWondmxh-xQLpddSGre3jyahHYRehGneaYxurcw9JAP41D4f9oIJsXcbpUs9dVYRJDGH-bkuKZpbfdR6ZOLU9uNEQfjDfXsgz0HXsNzBo56gXVtlMkmv0V9Y4dYx4T8rdrBxJ1sLwmK6poOcIloWzyr-cSigfv7mqiGhvyty8O5ixu8McyD4kmwEzVb6-PJwg',
            //   })
            // credential
            // JSON.stringify({ type: 'nativeFbUser', data: credential.toJSON() })
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
      !isExpoClient && CookieManager.clearAll()
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
            // @ts-ignore
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
