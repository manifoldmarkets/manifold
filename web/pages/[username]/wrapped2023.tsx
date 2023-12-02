import { removeUndefinedProps } from 'common/util/object'
import { usePrivateUser } from 'web/hooks/use-user'

import { User, getUserByUsername } from 'web/lib/firebase/users'
import { getPostsByUser } from 'web/lib/supabase/post'
import { getAverageUserRating, getUserRating } from 'web/lib/supabase/reviews'
import Custom404 from '../404'
import { DeletedUser } from '.'
import { BlockedUser } from 'web/components/profile/blocked-user'
import clsx from 'clsx'
import { Col } from 'web/components/layout/col'
import Snowfall from 'react-snowfall'
import { usePersistentQueriesState } from 'web/hooks/use-persistent-query-state'
import { Unwrap } from 'web/components/wrapped/Unwrap'
import { useState } from 'react'
import { MonthlyBets } from 'web/components/wrapped/MonthlyBets'
import { useMonthlyBets } from 'web/hooks/use-wrapped-2023'
import { GeneralStats } from 'web/components/wrapped/GeneralStats'

export const getStaticProps = async (props: {
  params: {
    username: string
  }
}) => {
  const { username } = props.params
  const user = await getUserByUsername(username)

  return {
    props: removeUndefinedProps({
      user,
      username,
    }),
    // revalidate: 60 * 5, // Regenerate after 5 minutes
    revalidate: 4,
  }
}

export const getStaticPaths = () => {
  return { paths: [], fallback: 'blocking' }
}

export default function Wrapped2023(props: {
  user: User | null
  username: string
}) {
  const { user, ...profileProps } = props
  const privateUser = usePrivateUser()
  const blockedByCurrentUser =
    privateUser?.blockedUserIds.includes(user?.id ?? '_') ?? false
  if (!user) return <Custom404 />
  else if (user.userDeleted) return <DeletedUser />

  return privateUser && blockedByCurrentUser ? (
    <BlockedUser user={user} privateUser={privateUser} />
  ) : (
    <Wrapped2023Content user={user} {...profileProps} />
  )
}

function Wrapped2023Content(props: { user: User; username: string }) {
  const { user, username } = props
  const [state, updateState] = usePersistentQueriesState({ page: '0' })
  const goToNextPage = () => {
    updateState({ page: `${parseInt(state.page) + 1}` })
  }
  const goToPrevPage = () => {
    const currentPage = parseInt(state.page)
    if (currentPage <= 0) return
    updateState({ page: `${parseInt(state.page) - 1}` })
  }

  const monthlyBets = useMonthlyBets(user.id)
  console.log(monthlyBets)
  return (
    <Col
      className={clsx(
        'text-ink-1000 mx-auto min-h-screen w-full bg-indigo-800'
      )}
    >
      <Snowfall style={{ opacity: 0.2 }} />
      {state.page == '0' ? (
        <Unwrap goToNextPage={goToNextPage} />
      ) : state.page == '1' ? (
        <GeneralStats
          monthlyBets={monthlyBets}
          goToPrevPage={goToPrevPage}
          goToNextPage={goToNextPage}
          user={user}
        />
      ) : state.page == '2' ? (
        <MonthlyBets
          monthlyBets={monthlyBets}
          goToPrevPage={goToPrevPage}
          goToNextPage={goToNextPage}
          user={user}
        />
      ) : (
        <></>
      )}
    </Col>
  )
}
