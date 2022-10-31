import React, { useEffect, useState } from 'react'
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  View,
  Platform,
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
import { FontAwesome5 } from '@expo/vector-icons'
import { OAuthProvider } from 'firebase/auth'

export const AuthModal = (props: {
  modalVisible: boolean
  setModalVisible: (visible: boolean) => void
}) => {
  const { modalVisible, setModalVisible } = props
  const appleAuthAvailable = useAppleAuthentication()

  async function triggerLoginWithApple() {
    try {
      const { credential, data } = await loginWithApple()
      console.log('credential', credential)
      console.log('data', data)
    } catch (error: any) {
      console.error(error)
      Alert.alert('Error', 'Something went wrong. Please try again later.')
    }
  }

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={modalVisible}
      onRequestClose={() => {
        Alert.alert('Modal has been closed.')
        // setModalVisible(!modalVisible)
      }}
    >
      <View style={styles.modalContent}>
        <View style={styles.modalView}>
          <FontAwesome5.Button
            style={styles.googleButton}
            name="google"
            onPress={() => console.log('google')}
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
        <TouchableWithoutFeedback
          onPress={() => {
            console.log('tapped')
            setModalVisible(false)
          }}
        >
          <View style={styles.modalOverlay} />
        </TouchableWithoutFeedback>
      </View>
    </Modal>
  )
}

async function loginWithApple() {
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
