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
const uri = !isExpoClient
  ? 'https://a6f7-154-9-128-144.ngrok.io'
  : // : 'https://b9d7-24-128-53-123.ngrok.io'
    'http://localhost:3000/'
// const url = 'https://24f6-71-218-239-220.ngrok.io/IanPhilips';

export default function App() {
  // const [googleCred, setGoogleCred] = useState<string | null>()
  const [fbUser, setFbUser] = useState<string | null>(JSON.stringify(fakeUser))

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
  const [hasInjectedVariable, setHasInjectedVariable] = useState(false)
  const useWebKit = true
  // we can't just login to google via webview: see https://developers.googleblog.com/2021/06/upcoming-security-changes-to-googles-oauth-2.0-authorization-endpoint.html#instructions-ios
  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params
      webview.current.postMessage(
        JSON.stringify({ type: 'nativeFbUser', data: id_token })
      )

      // const auth = getAuth(app)
      // const credential = GoogleAuthProvider.credential(id_token)
      // // on sign in from the native side, pass the webview the fb user
      // signInWithCredential(auth, credential).then((result) => {
      //   const fbUserPrint = JSON.stringify(result.user, null, 2) // spacing level = 2
      //   const fbUser = result.user.toJSON()
      //   // setGoogleCred(JSON.stringify(credential.toJSON()))
      //   if (webview.current) {
      //     console.log('setting fbUser', fbUserPrint.slice(0, 100))
      //     webview.current.postMessage(
      //       // JSON.stringify({ type: 'nativeFbUser', data: credential.toJSON() })
      //       // JSON.stringify({ type: 'nativeFbUser', data: credential.idToken })
      //       JSON.stringify({ type: 'nativeFbUser', data: fbUser })
      //     )
      //   }
      //   setFbUser(JSON.stringify(result.user.toJSON()))
      // })
    }
  }, [response])

  useEffect(() => {
    console.log('is expo client:', isExpoClient)
    // if (fbUser) {

    if (webview.current) {
      console.log('setting native flag')
      webview.current.injectJavaScript('window.isNative = true')
      setHasInjectedVariable(true)
      // webview.current.postMessage(
      //   JSON.stringify({ type: 'nativeFbUser', data: fbUser })
      // )
    }
    // }
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
      // } else if (nativeEvent.data.includes('user')) {
      //   on reload the fb user from webview cache, set the fb user
      // console.log('setting fb user from webciew cache')
      // setFbUser(nativeEvent.data)
      // } else if (nativeEvent.data === 'signOut') {
      //   console.log('signOut')
      //   setFbUser(null)
      //   isExpoClient &&
      //     require('@react-native-cookies/cookies').default.clearAll()
    } else {
      console.log('nativeEvent.data', nativeEvent.data)
    }
  }

  return (
    <>
      <CustomHeaderWebView
        uri={uri}
        ref={webview}
        onMessage={handleMessage}
        login={promptAsync}
        onNavigationStateChange={async (navState) => {
          if (!navState.loading && !hasInjectedVariable && webview.current) {
            // @ts-ignore
            webview.current.injectJavaScript('window.isNative = true')
            setHasInjectedVariable(true)
          }
        }}
      />

      {/*{!fbUser && (*/}
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
      {/*)}*/}
    </>
  )
}

const CustomHeaderWebView = forwardRef((props: any, ref) => {
  const { uri, onLoadStart, login, ...restProps } = props
  const [currentURI, setURI] = useState(props.uri)
  const newSource = { ...props.source, uri: currentURI }

  return (
    <WebView
      {...restProps}
      ref={ref}
      style={{ marginTop: 20 }}
      allowsBackForwardNavigationGestures={true}
      source={newSource}
      sharedCookiesEnabled={true}
      onShouldStartLoadWithRequest={(request) => {
        const url = request.url
        console.log('request url', request.url)
        if (url.includes('firebaseapp.com/__/auth/')) {
          console.log('not loading url:', url)
          // setURI(uri + 'home')
          return false
        }
        return true
        // // If we're loading the current URI, allow it to load
        // if (url === currentURI) {
        //   console.log('Allowing load of current URI', url)
        //   return true
        // }
        // if (
        //   !url.includes(uri) ||
        //   url.includes('firebaseapp.com/__/auth/') ||
        //   url.includes('about:blank')
        // ) {
        //   console.log('not loading url:', url)
        //   // setURI(uri + 'home')
        //   return false
        // }
        // console.log('Preventing load of URI', url)
        // // We're loading a new URL -- change state first
        // setURI(url)
        // return false
      }}
    />
  )
})

const fakeUser = {
  uid: '6hHpzvRG0pMq8PNJs7RZj2qlZGn2',
  email: 'iansphilips@gmail.com',
  emailVerified: true,
  displayName: 'Ian Philips',
  isAnonymous: false,
  photoURL:
    'https://lh3.googleusercontent.com/a-/AOh14GhGa0Vhb3LTBXbd2fGfekbG5clPQSVe59Xh35CrKw=s96-c',
  providerData: [
    {
      providerId: 'google.com',
      uid: '104873811885476820901',
      displayName: 'Ian Philips',
      email: 'iansphilips@gmail.com',
      phoneNumber: null,
      photoURL:
        'https://lh3.googleusercontent.com/a/ALm5wu2L9687DDQ_ifWj1ByKV2fggze7MlFK_B8mFwcU-DY=s96-c',
    },
  ],
  stsTokenManager: {
    refreshToken:
      'AOEOulbccgCwkis-c7EXs3NHhAk5gHd2bKjBnI7XZNBho6cyqYwWM5LXBSX9O4Paut6-cJChJYcODG-btqbs7OfE58uIm-BixV0kgYJ8iZxRyUDvbNI0PfosDEoUvAR4D1jWvLca0Tjov_HfW9ZREWWuJCh9vw0unNdAXDjwkjhpRtp5HYB8khGeD2VVuZYDBEj0v8U1iSFI0yvYjCEnlB-DRN0cYSwZFCavTRji_wnW7Ks9x4OWqrs1uOk0z3QEDJeRePe9gzUG_RXV1sbkz3z5WC6meQVLblh8MrMDZ3FNlWjb-N8XdB4RwbHSCZ7SOt6_E9omxupCSoFmZBWg9Ad5_qoC3oWpRR8tdEu7CTNT9DV1yGhWYKAzSp-MUJEzzVNqy72tjdVQMfyOfAfjPpMbOyi8uHpdRSgERJ3myNmurrhTDQNTZpY',
    accessToken:
      'eyJhbGciOiJSUzI1NiIsImtpZCI6Ijk5NjJmMDRmZWVkOTU0NWNlMjEzNGFiNTRjZWVmNTgxYWYyNGJhZmYiLCJ0eXAiOiJKV1QifQ.eyJuYW1lIjoiSWFuIFBoaWxpcHMiLCJwaWN0dXJlIjoiaHR0cHM6Ly9saDMuZ29vZ2xldXNlcmNvbnRlbnQuY29tL2EtL0FPaDE0R2hHYTBWaGIzTFRCWGJkMmZHZmVrYkc1Y2xQUVNWZTU5WGgzNUNyS3c9czk2LWMiLCJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vZGV2LW1hbnRpYy1tYXJrZXRzIiwiYXVkIjoiZGV2LW1hbnRpYy1tYXJrZXRzIiwiYXV0aF90aW1lIjoxNjY1NzUwMDc0LCJ1c2VyX2lkIjoiNmhIcHp2UkcwcE1xOFBOSnM3UlpqMnFsWkduMiIsInN1YiI6IjZoSHB6dlJHMHBNcThQTkpzN1JaajJxbFpHbjIiLCJpYXQiOjE2NjU3NTAwNzQsImV4cCI6MTY2NTc1MzY3NCwiZW1haWwiOiJpYW5zcGhpbGlwc0BnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6eyJnb29nbGUuY29tIjpbIjEwNDg3MzgxMTg4NTQ3NjgyMDkwMSJdLCJlbWFpbCI6WyJpYW5zcGhpbGlwc0BnbWFpbC5jb20iXX0sInNpZ25faW5fcHJvdmlkZXIiOiJnb29nbGUuY29tIn19.U0dnyvSJd0ErV1iZU-feJwgjE3H2oybJF9dUmCf7IJGVAv5bXy8_GhWPVJeUQQ2ne-VErgmxziN4aOQ09Y6nRCFov-QTVC1KlN2oV9QB2pWsya-r_e0rsSO2BNcEQHuw9ju_H65LqOAp-oM1Rmsej7OHv6uGL-q35qnUIsnvkqL9oKSiG4A87L_iApGcw3ixqxXppMAG54bkevpKLKZvdEKxCdp7aMyn-kipkx3YvCA8NRzS_f6oxwF6koSjnEmJLxtdHvoYfsLjAgZvcnRPu7API52-Qi5NGqJn9rbabywf87GeSZbAL22xpkrzfqH8Lw_dGhgTZhPsZ4R6n5OaMQ',
    expirationTime: 1665753674429,
  },
  createdAt: '1650038386755',
  lastLoginAt: '1665704537930',
  apiKey: 'AIzaSyBoq3rzUa8Ekyo3ZaTnlycQYPRCA26VpOw',
  appName: '[DEFAULT]',
}
