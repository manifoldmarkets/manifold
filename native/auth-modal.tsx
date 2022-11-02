import React, { useEffect, useState } from 'react'
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  View,
  Platform,
  TouchableWithoutFeedback,
  ActivityIndicator,
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
import { FontAwesome5 } from '@expo/vector-icons'
import {
  GoogleAuthProvider,
  OAuthProvider,
  updateEmail,
  updateProfile,
} from 'firebase/auth'
import { signInWithCredential } from '@firebase/auth'
import { auth } from './App'
import WebView from 'react-native-webview'
import * as Google from 'expo-auth-session/providers/google'
import { ENV_CONFIG } from 'common/envs/constants'
import * as Sentry from 'sentry-expo'

export const AuthModal = (props: {
  showModal: boolean
  setShowModal: (shouldShowAuth: boolean) => void
  webview: React.RefObject<WebView | undefined>
  setFbUser: (user: string) => void
  setUserId: (userId: string) => void
}) => {
  const { showModal, setShowModal, webview, setFbUser, setUserId } = props
  const [loading, setLoading] = useState(false)
  const [_, response, promptAsync] = Google.useIdTokenAuthRequest(
    // @ts-ignore
    ENV_CONFIG.expoConfig
  )
  const appleAuthAvailable = useAppleAuthentication()

  useEffect(() => {
    if (showModal) {
      if (Platform.OS === 'ios') {
        setShowModal(true)
      } else {
        promptAsync()
      }
    } else {
      setShowModal(false)
      setLoading(false)
    }
  }, [showModal])

  // We can't just log in to google within the webview: see https://developers.googleblog.com/2021/06/upcoming-security-changes-to-googles-oauth-2.0-authorization-endpoint.html#instructions-ios
  useEffect(() => {
    try {
      if (response?.type === 'success') {
        const { id_token } = response.params
        const credential = GoogleAuthProvider.credential(id_token)
        signInWithCredential(auth, credential).then((result) => {
          const fbUser = result.user.toJSON()
          setFbUser(JSON.stringify(fbUser))
          setUserId(result.user.uid)
          if (webview.current) {
            webview.current.postMessage(
              JSON.stringify({ type: 'nativeFbUser', data: fbUser })
            )
          }
        })
      }
    } catch (err) {
      Sentry.Native.captureException(err, {
        extra: { message: 'google sign in' },
      })
      console.log('[google sign in] Error : ', err)
    }
    setShowModal(false)
    setLoading(false)
  }, [response])

  async function triggerLoginWithApple() {
    setLoading(true)
    try {
      const { credential, data } = await loginWithApple()
      console.log('credential', credential)
      console.log('data', data)
      const { user } = await signInWithCredential(auth, credential)
      console.log('user', user)
      if (data?.email && !user.email) {
        await updateEmail(user, data.email)
      }
      if (data?.displayName && !user.displayName) {
        await updateProfile(user, { displayName: data.displayName })
      }
      const fbUser = user.toJSON()
      console.log('fbUser', JSON.stringify(fbUser))
      webview.current?.postMessage(
        JSON.stringify({ type: 'nativeFbUser', data: fbUser })
      )
      setFbUser(JSON.stringify(fbUser))
      setUserId(user.uid)
    } catch (error: any) {
      console.error(error)
    }
    setLoading(false)
    setShowModal(false)
  }

  const loginWithApple = async () => {
    console.log('Signing in with Apple...')
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

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={showModal}
      onRequestClose={() => {
        Alert.alert('Modal has been closed.')
        // setModalVisible(!modalVisible)
      }}
    >
      <View style={styles.modalContent}>
        {loading ? (
          <ActivityIndicator size="large" color="#0000ff" />
        ) : (
          <View style={styles.modalView}>
            <FontAwesome5.Button
              style={styles.googleButton}
              name="google"
              onPress={async () => {
                setLoading(true)
                await promptAsync()
                setLoading(false)
              }}
              //any other customization you want, like borderRadius, color, or size
            >
              <Text style={styles.googleText}>Log In With Google</Text>
            </FontAwesome5.Button>

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
          </View>
        )}
        <TouchableWithoutFeedback
          onPress={() => {
            console.log('tapped')
            setShowModal(false)
          }}
        >
          <View style={styles.modalOverlay} />
        </TouchableWithoutFeedback>
      </View>
    </Modal>
  )
}

function useAppleAuthentication() {
  const [authenticationLoaded, setAuthenticationLoaded] =
    useState<boolean>(false)

  useEffect(() => {
    async function checkAvailability() {
      try {
        const available = await isAvailableAsync()
        console.log('Apple authentication available:', available)
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
    backgroundColor: '#4285F4',
    width: '100%',
    height: 48,
    paddingHorizontal: 26,
  },
  googleText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalView: {
    margin: 20,
    width: 300,
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
  },
  button: {
    borderRadius: 20,
    padding: 10,
    elevation: 2,
  },
  buttonOpen: {
    backgroundColor: '#F194FF',
  },
  buttonClose: {
    backgroundColor: '#2196F3',
  },
  textStyle: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  modalText: {
    marginBottom: 15,
    textAlign: 'center',
  },
})
