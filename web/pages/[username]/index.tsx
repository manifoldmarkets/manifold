import { useRouter } from 'next/router'
import React, { useEffect, useState } from 'react'

import { getUserByUsername, User } from 'web/lib/firebase/users'
import { UserPage } from 'web/components/user-page'
import { useUser } from 'web/hooks/use-user'
import Custom404 from '../404'
import { useTracking } from 'web/hooks/use-tracking'

export default function UserProfile(props: {
  tab?: 'markets' | 'comments' | 'bets'
}) {
  const router = useRouter()
  const [user, setUser] = useState<User | null | 'loading'>('loading')
  const { username } = router.query as { username: string }

  useEffect(() => {
    if (username) {
      getUserByUsername(username).then(setUser)
    }
  }, [username])

  const currentUser = useUser()

  useTracking('view user profile', { username })

  if (user === 'loading') return <></>

  return user ? (
    <UserPage
      user={user}
      currentUser={currentUser || undefined}
      defaultTabTitle={props.tab}
    />
  ) : (
    <Custom404 />
  )
}
