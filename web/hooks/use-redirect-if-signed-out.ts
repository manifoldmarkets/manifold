import Router from 'next/router'
import { useEffect } from 'react'
import { useUser } from './use-user'
import { getIsNative } from 'web/lib/native/is-native'

export const useRedirectIfSignedOut = () => {
  const user = useUser()
  useEffect(() => {
    if (user !== null) return
    // Go to landing page if not logged in.
    if (getIsNative()) Router.replace('/sign-in-waiting')
    else Router.replace('/')
  }, [user])
}
