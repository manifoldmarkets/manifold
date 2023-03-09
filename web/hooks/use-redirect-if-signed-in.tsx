import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { useUser } from './use-user'

export const useRedirectIfSignedIn = () => {
  const router = useRouter()
  const user = useUser()
  useEffect(() => {
    if (user) router.push('/home')
  }, [user])
}
