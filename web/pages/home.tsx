import React from 'react'
import Router from 'next/router'

import { Contract } from '../lib/firebase/contracts'
import { Page } from '../components/page'
import { ActivityFeed } from './activity'
import { Comment } from '../lib/firebase/comments'
import { Bet } from '../lib/firebase/bets'
import FeedCreate from '../components/feed-create'
import { Spacer } from '../components/layout/spacer'
import { Col } from '../components/layout/col'
import { useUser } from '../hooks/use-user'
import { Fold } from '../../common/fold'
import { LoadingIndicator } from '../components/loading-indicator'
import { Row } from '../components/layout/row'
import { SparklesIcon } from '@heroicons/react/solid'
import { FastFoldFollowing } from '../components/fast-fold-following'
import {
  getAllContractInfo,
  useFindActiveContracts,
} from '../hooks/use-active-contracts'
import { useGetRecentBets } from '../hooks/use-bets'
import { usePropz } from '../hooks/use-propz'

export async function getStaticPropz() {
  const contractInfo = await getAllContractInfo()

  return {
    props: contractInfo,
    revalidate: 60, // regenerate after a minute
  }
}

const Home = (props: {
  contracts: Contract[]
  folds: Fold[]
  recentBets: Bet[]
  recentComments: Comment[]
}) => {
  props = usePropz(getStaticPropz) ?? {
    contracts: [],
    folds: [],
    recentComments: [],
  }
  const { contracts, folds, recentComments } = props
  const user = useUser()

  const recentBets = useGetRecentBets()

  const {
    activeContracts,
    activeBets,
    activeComments,
    initialFollowedFoldSlugs,
  } = useFindActiveContracts(
    { contracts, folds, recentBets: recentBets ?? [], recentComments },
    user
  )

  if (user === null) {
    Router.replace('/')
    return <></>
  }

  return (
    <Page assertUser="signed-in">
      <Col className="items-center">
        <Col className="w-full max-w-3xl">
          <FeedCreate user={user ?? undefined} />
          <Spacer h={6} />

          {initialFollowedFoldSlugs !== undefined &&
            initialFollowedFoldSlugs.length === 0 && (
              <FastFoldFollowing
                user={user}
                followedFoldSlugs={initialFollowedFoldSlugs}
              />
            )}

          <Col className="mx-3 mb-3 gap-2 text-sm text-gray-800 sm:flex-row">
            <Row className="gap-2">
              <SparklesIcon className="inline h-5 w-5" aria-hidden="true" />
              <span className="whitespace-nowrap">Recent activity</span>
            </Row>
          </Col>

          {activeContracts && recentBets ? (
            <ActivityFeed
              contracts={activeContracts}
              contractBets={activeBets}
              contractComments={activeComments}
            />
          ) : (
            <LoadingIndicator className="mt-4" />
          )}
        </Col>
      </Col>
    </Page>
  )
}

export default Home
