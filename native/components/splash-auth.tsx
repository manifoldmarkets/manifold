import { User as FirebaseUser } from '@firebase/auth'
import { AuthPage } from 'components/auth-page'
import { Splash } from 'components/splash'
import React, { useEffect } from 'react'

export const SplashAuth = (props: {
  hasLoadedWebView: boolean
  fbUser: FirebaseUser | null
  isConnected: boolean
}) => {
  const { isConnected, hasLoadedWebView, fbUser } = props

  useEffect(() => {
    if (!isConnected) {
      alert("You're offline. Please reconnect to the internet to use Manifold.")
    }
  }, [isConnected])

  if (!isConnected || !hasLoadedWebView) {
    return <Splash />
  }

  if (!fbUser) {
    return <AuthPage />
  }

  // This shouldn't happen as App.tsx handles this case
  return null
}
