import { ImageSourcePropType } from 'react-native'
import { useEffect } from 'react'
import { User as FirebaseUser } from '@firebase/auth'
import { Splash } from 'components/splash'
import { AuthPage } from 'components/auth-page'

export const SplashAuth = (props: {
  height: number
  width: number
  source: ImageSourcePropType
  fbUser: FirebaseUser | null
  isConnected: boolean
}) => {
  const { isConnected, fbUser, width, height, source } = props

  useEffect(() => {
    if (!isConnected) {
      alert("You're offline. Please reconnect to the internet to use Manifold.")
    }
  }, [isConnected])

  if (!isConnected) {
    return <Splash height={height} width={width} source={source} />
  }

  if (!fbUser) return <AuthPage height={height} width={width} />
  else return <></>
}
