import { ImageSourcePropType } from 'react-native'
import { useEffect } from 'react'
import { Splash } from 'components/splash'
import { AuthPage } from 'components/auth-page'
import { User } from 'common/user'

export const SplashAuth = (props: {
  height: number
  width: number
  source: ImageSourcePropType
  user: User | null | undefined
  isConnected: boolean
}) => {
  const { isConnected, user, width, height, source } = props

  useEffect(() => {
    if (!isConnected) {
      alert("You're offline. Please reconnect to the internet to use Manifold.")
    }
  }, [isConnected])

  if (!isConnected) {
    return <Splash height={height} width={width} source={source} />
  }

  if (user === null) return <AuthPage height={height} width={width} />
  else return <></>
}
