import React, { useEffect, useState } from 'react'
import {
  Alert,
  StyleSheet,
  View,
  Platform,
  ActivityIndicator,
  Image,
  TouchableOpacity,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native'
import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
  AppleAuthenticationScope,
  isAvailableAsync,
  signInAsync,
} from 'expo-apple-authentication'
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto'
import {
  GoogleAuthProvider,
  OAuthProvider,
  updateEmail,
  updateProfile,
} from 'firebase/auth'
import { signInWithCredential } from '@firebase/auth'
import { auth } from '../init'
import WebView from 'react-native-webview'
import * as Google from 'expo-auth-session/providers/google'
import { ENV_CONFIG } from 'common/envs/constants'
import { Text } from 'components/text'
import { log } from 'components/logger'

export const AuthPage = (props: {
  webview: React.RefObject<WebView | undefined>
  height: number
  width: number
}) => {
  const { webview, height, width } = props
  const [loading, setLoading] = useState(false)
  const [_, response, promptAsync] = Google.useIdTokenAuthRequest(
    // @ts-ignore
    ENV_CONFIG.expoConfig
  )
  const appleAuthAvailable = useAppleAuthentication()

  // We can't just log in to google within the webview: see https://developers.googleblog.com/2021/06/upcoming-security-changes-to-googles-oauth-2.0-authorization-endpoint.html#instructions-ios
  useEffect(() => {
    try {
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
        })
      }
    } catch (err) {
      log('[google sign in] Error : ', err)
    }
    setLoading(false)
  }, [response])

  async function triggerLoginWithApple() {
    setLoading(true)
    try {
      const { credential, data } = await loginWithApple()
      log('credential', credential)
      log('data', data)
      const { user } = await signInWithCredential(auth, credential)
      log('user', user)
      if (data?.email && !user.email) {
        await updateEmail(user, data.email)
      }
      if (data?.displayName && !user.displayName) {
        await updateProfile(user, { displayName: data.displayName })
      }
      const fbUser = user.toJSON()
      webview.current?.postMessage(
        JSON.stringify({ type: 'nativeFbUser', data: fbUser })
      )
    } catch (error: any) {
      log('login with apple error:', error)
    }
    setLoading(false)
  }

  const loginWithApple = async () => {
    log('Signing in with Apple...')
    const state = Math.random().toString(36).substring(2, 15)
    const rawNonce = Math.random().toString(36).substring(2, 10)
    const requestedScopes = [
      AppleAuthenticationScope.FULL_NAME,
      AppleAuthenticationScope.EMAIL,
    ]

    try {
      const nonce = await digestStringAsync(
        CryptoDigestAlgorithm.SHA256,
        rawNonce
      )

      const appleCredential = await signInAsync({
        requestedScopes,
        state,
        nonce,
      })

      const { identityToken, email, fullName } = appleCredential

      if (!identityToken) {
        throw new Error('No identity token provided.')
      }

      const provider = new OAuthProvider('apple.com')

      provider.addScope('email')
      provider.addScope('fullName')

      const credential = provider.credential({
        idToken: identityToken,
        rawNonce,
      })

      const displayName = fullName
        ? `${fullName.givenName} ${fullName.familyName}`
        : undefined
      const data = { email, displayName }

      return { credential, data }
    } catch (error: any) {
      throw error
    }
  }

  const computedStyles = StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      backgroundColor: '#4337C9',
      height,
      width,
      position: 'absolute',
      zIndex: 1000,
    },
  })
  return (
    <View style={computedStyles.container}>
      <View style={styles.centerFlex}>
        <Image
          source={require('../assets/logo.png')}
          style={{ height: 200, resizeMode: 'contain' }}
        />
        {loading ? (
          <ActivityIndicator size="large" color="#0000ff" />
        ) : (
          <View style={styles.authContent}>
            <TouchableOpacity
              style={styles.googleButton}
              onPress={async () => {
                setLoading(true)
                await promptAsync()
                setLoading(false)
              }}
            >
              <View style={styles.googleButtonContent}>
                <Image
                  source={require('../assets/square-google.png')}
                  style={{
                    height: 28,
                    width: 28,
                    resizeMode: 'contain',
                  }}
                />
                <Text style={styles.googleText}>Sign in with Google</Text>
              </View>
            </TouchableOpacity>

            {appleAuthAvailable && (
              <AppleAuthenticationButton
                buttonType={AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={5}
                style={{
                  width: '100%',
                  height: 48,
                  marginTop: 16,
                }}
                onPress={triggerLoginWithApple}
              />
            )}
            <Eula />
          </View>
        )}
      </View>
    </View>
  )
}

function useAppleAuthentication() {
  const [authenticationLoaded, setAuthenticationLoaded] =
    useState<boolean>(false)

  useEffect(() => {
    async function checkAvailability() {
      try {
        const available = await isAvailableAsync()
        setAuthenticationLoaded(available)
      } catch (error: any) {
        Alert.alert('Error', error?.message)
      }
    }

    if (Platform.OS === 'ios' && !authenticationLoaded) {
      checkAvailability()
    }
  }, [])

  return authenticationLoaded
}

const styles = StyleSheet.create({
  googleButton: {
    // backgroundColor: '#4285F4',
    backgroundColor: 'white',
    borderRadius: 5,
    width: '100%',
    height: 48,
  },
  googleButtonContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleText: {
    color: '#4285F4',
    marginLeft: -2,
    fontSize: 17.5,
    fontWeight: 'bold',
  },
  centerFlex: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  authContent: {
    width: 300,
    padding: 35,
    alignItems: 'center',
  },
  modalView: {
    margin: 20,
    width: 300,
    height: 500,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 35,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    zIndex: 1,
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    flexDirection: 'column',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  eulaContainer: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
  },
  text: { fontSize: 11 },
  eulaText: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  clickable: {
    textDecorationLine: 'underline',
  },
})

function Eula() {
  const [expanded, setExpanded] = useState<'privacy' | 'tos' | null>()
  const [open, setOpen] = useState(false)

  return (
    <>
      <View style={styles.eulaContainer}>
        <Text style={styles.text}>
          By signing up for Manifold, you agree to
        </Text>
        <TouchableOpacity
          style={{ marginRight: 5 }}
          onPress={() => {
            setOpen(true)
            setExpanded('privacy')
          }}
        >
          <Text style={[styles.clickable, styles.text]}>Privacy Policy,</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            setOpen(true)
            setExpanded('tos')
          }}
        >
          <Text style={[styles.clickable, styles.text]}>Terms of Service</Text>
        </TouchableOpacity>
      </View>
      <Modal
        animationType="slide"
        transparent={true}
        visible={open}
        onRequestClose={() => setOpen(false)}
        style={{ flex: 1 }}
      >
        <View style={styles.centerFlex}>
          <View style={styles.modalView}>
            {expanded === 'tos' && (
              <WebView
                style={{ height: 500, width: 300 }}
                source={{ uri: 'https://manifold.markets/terms' }}
              />
            )}
            {expanded === 'privacy' && (
              <WebView
                style={{ height: 500, width: 300 }}
                source={{ uri: 'https://manifold.markets/privacy' }}
              />
            )}
          </View>
          <TouchableWithoutFeedback
            onPress={() => {
              setOpen(false)
              setExpanded(null)
            }}
          >
            <View style={styles.modalOverlay} />
          </TouchableWithoutFeedback>
        </View>
      </Modal>
    </>
  )
}
