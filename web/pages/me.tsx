import { useEffect } from 'react'
import { useRouter } from 'next/router'

import { useUser } from 'web/hooks/use-user'
import { redirectIfLoggedOut } from 'web/lib/firebase/server-auth'

export const getServerSideProps = redirectIfLoggedOut('/')

export default function MePage() {
  const router = useRouter()
  const user = useUser()

  useEffect(() => {
    if (user) {
      const query = { ...router.query }
      delete query.username // Remove username if it exists
      router.replace({
        pathname: `/${user.username}`,
        query,
      })
    }
  }, [user, router.query])

  return <></>
}
