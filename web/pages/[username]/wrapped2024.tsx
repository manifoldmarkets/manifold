import { removeUndefinedProps } from 'common/util/object'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { type User } from 'web/lib/firebase/users'
import Custom404 from '../404'
import { DeletedUser } from '.'
import { BlockedUser } from 'web/components/profile/blocked-user'
import clsx from 'clsx'
import { Col } from 'web/components/layout/col'
import Snowfall from 'react-snowfall'
import { usePersistentQueriesState } from 'web/hooks/use-persistent-query-state'
import { Unwrap } from 'web/components/wrapped/Unwrap'
import { MonthlyBets } from 'web/components/wrapped/MonthlyBets'
import { useMonthlyBets } from 'web/hooks/use-wrapped-2024'
import { GeneralStats } from 'web/components/wrapped/GeneralStats'
import { TotalProfit } from 'web/components/wrapped/TotalProfit'
import { Row } from 'web/components/layout/row'
import { TheEnd } from 'web/components/wrapped/TheEnd'
import { MaxMinProfit } from 'web/components/wrapped/MaxMinProfit'
import { SEO } from 'web/components/SEO'
import { getUserForStaticProps } from 'common/supabase/users'
import { db } from 'common/supabase/db'

export const getStaticProps = async (props: {
  params: {
    username: string
  }
}) => {
  const { username } = props.params
  const user = await getUserForStaticProps(db, username)
  return {
    props: removeUndefinedProps({
      user,
      username,
    }),
    // revalidate: 60 * 5, // Regenerate after 5 minutes
    revalidate: 60,
  }
}

export const getStaticPaths = () => {
  return { paths: [], fallback: 'blocking' }
}

export default function Wrapped2024(props: {
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
    <Wrapped2024Content user={user} {...profileProps} />
  )
}

function Wrapped2024Content(props: { user: User; username: string }) {
  const { user, username } = props
  const currentUser = useUser()
  const isCurrentUser = currentUser?.id === user.id
  const [state, updateState] = usePersistentQueriesState(
    { page: '0' },
    'wrapped'
  )
  const maxPages = 6
  const page = parseInt(state.page)
  const goToNextPage = () => {
    if (page >= maxPages - 1) return
    updateState({ page: `${page + 1}` })
  }
  const goToPrevPage = () => {
    if (page <= 0) return
    updateState({ page: `${page - 1}` })
  }

  const monthlyBets = useMonthlyBets(user.id)

  return (
    <Col
      className={clsx(
        'relative mx-auto max-h-screen min-h-screen w-full overflow-hidden bg-gradient-to-b from-blue-800 to-blue-600 text-white'
      )}
    >
      <SEO
        title={`${user.name}'s Manifold Wrapped 2024`}
        description={`See ${user.name}'s biggest gains and losses on Manifold in 2024.`}
        image="/manifold-wrapped.png"
      />

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
        <TotalProfit
          goToPrevPage={goToPrevPage}
          goToNextPage={goToNextPage}
          user={user}
        />
      ) : state.page == '3' ? (
        <MaxMinProfit
          goToPrevPage={goToPrevPage}
          goToNextPage={goToNextPage}
          user={user}
        />
      ) : state.page == '4' ? (
        <MonthlyBets
          monthlyBets={monthlyBets}
          goToPrevPage={goToPrevPage}
          goToNextPage={goToNextPage}
        />
      ) : (
        <TheEnd
          goToPrevPage={goToPrevPage}
          username={username}
          restart={() => updateState({ page: '0' })}
          isCurrentUser={isCurrentUser}
        />
      )}
      <Tracker currentPage={page} maxPages={maxPages} />
    </Col>
  )
}

function Tracker(props: { currentPage: number; maxPages: number }) {
  const { currentPage, maxPages } = props
  return (
    <Row className="absolute left-0 right-0 top-0 opacity-40">
      <Row className="mx-auto w-full max-w-lg">
        {Array.from({ length: maxPages }).map((_, i) => {
          return (
            <div
              key={i}
              className={clsx(
                `mx-1 my-2 h-1.5 w-1/6 rounded-full transition-colors`,
                i <= currentPage ? 'bg-gray-300' : ' bg-gray-700'
              )}
            />
          )
        })}
      </Row>
    </Row>
  )
}
