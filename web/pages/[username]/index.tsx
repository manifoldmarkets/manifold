import { useRouter } from 'next/router'
import React from 'react'

import { getUserByUsername, User } from 'web/lib/firebase/users'
import { UserPage } from 'web/components/user-page'
import { useUser } from 'web/hooks/use-user'
import Custom404 from '../404'
import { useTracking } from 'web/hooks/use-tracking'
import { fromPropz, usePropz } from 'web/hooks/use-propz'

export const getStaticProps = fromPropz(getStaticPropz)
export async function getStaticPropz(props: { params: { username: string } }) {
  const { username } = props.params
  const user = await getUserByUsername(username)

  if (user) user.profitCached.allTime = 0

  return {
    props: {
      user,
    },

    revalidate: 60, // regenerate after a minute
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function UserProfile(props: { user: User | null }) {
  props = usePropz(props, getStaticPropz) ?? { user: undefined }
  const { user } = props

  const router = useRouter()
  const { username } = router.query as {
    username: string
  }
  const currentUser = useUser()

  useTracking('view user profile', { username })

  if (user === undefined || user?.username !== username) return <div />

  return user ? (
    <UserPage user={user} currentUser={currentUser || undefined} />
  ) : (
    <Custom404 />
  )
}
