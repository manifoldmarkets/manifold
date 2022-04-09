import React from 'react'
import Router from 'next/router'
import _ from 'lodash'

import { Page } from '../components/page'
import { ActivityFeed } from '../components/feed/activity-feed'
import FeedCreate from '../components/feed-create'
import { Spacer } from '../components/layout/spacer'
import { Col } from '../components/layout/col'
import { useUser } from '../hooks/use-user'
import { LoadingIndicator } from '../components/loading-indicator'
import { useGetRecentBets, useRecentBets } from '../hooks/use-bets'
import { useGetActiveContracts } from '../hooks/use-contracts'
import { useGetRecentComments, useRecentComments } from '../hooks/use-comments'
import { useAlgoFeed } from '../hooks/use-algo-feed'

const Home = () => {
  const user = useUser()

  const initialContracts = useGetActiveContracts()

  const initialRecentBets = useGetRecentBets()
  const recentBets = useRecentBets() ?? initialRecentBets

  const initialRecentComments = useGetRecentComments()
  const recentComments = useRecentComments() ?? initialRecentComments

  const feedContracts = useAlgoFeed(
    user,
    initialContracts,
    initialRecentBets,
    initialRecentComments
  )

  if (user === null) {
    Router.replace('/')
    return <></>
  }

  const activityContent =
    initialContracts && recentBets && recentComments ? (
      <ActivityFeed
        contracts={feedContracts}
        recentBets={recentBets}
        recentComments={recentComments}
        mode="only-recent"
      />
    ) : (
      <LoadingIndicator className="mt-4" />
    )

  return (
    <Page assertUser="signed-in">
      <Col className="items-center">
        <Col className="w-full max-w-[700px]">
          <FeedCreate user={user ?? undefined} />
          <Spacer h={10} />
          {activityContent}
        </Col>
      </Col>
    </Page>
  )
}

export default Home
