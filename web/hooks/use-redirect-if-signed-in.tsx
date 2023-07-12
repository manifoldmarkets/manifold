import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { useUser } from './use-user'

export const useRedirectIfSignedIn = () => {
  const router = useRouter()
  const user = useUser()
  useEffect(() => {
    // New users go to questions until we make the new user feed great
    if (user && user.createdTime > Date.now() - 10000) router.push('/questions')
    else if (user) router.push('/home')
  }, [user])
}
