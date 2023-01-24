import Router from 'next/router'
import { useEffect } from 'react'
import { useUser } from './use-user'

export const useRedirectIfSignedIn = () => {
  const user = useUser()
  useEffect(() => {
    // Go to landing page if not logged in.
    if (user) Router.push('/home')
  }, [user])
}
