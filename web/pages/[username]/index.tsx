import { useRouter } from 'next/router'
import React from 'react'

import {
  getUserByUsername,
  getUserAndPrivateUser,
  User,
  UserAndPrivateUser,
} from 'web/lib/firebase/users'
import { UserPage } from 'web/components/user-page'
import Custom404 from '../404'
import { useTracking } from 'web/hooks/use-tracking'
import { GetServerSideProps } from 'next'
import { authenticateOnServer } from 'web/lib/firebase/server-auth'

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const creds = await authenticateOnServer(ctx)
  const username = ctx.params!.username as string // eslint-disable-line @typescript-eslint/no-non-null-assertion
  const [auth, user] = (await Promise.all([
    creds != null ? getUserAndPrivateUser(creds.uid) : null,
    getUserByUsername(username),
  ])) as [UserAndPrivateUser | null, User | null]
  return { props: { auth, user } }
}

export default function UserProfile(props: { user: User | null }) {
  const { user } = props

  const router = useRouter()
  const { username } = router.query as {
    username: string
  }

  useTracking('view user profile', { username })

  return user && !user.userDeleted ? <UserPage user={user} /> : <Custom404 />
}
