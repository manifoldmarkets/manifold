import React, { useState } from 'react'
import Router from 'next/router'
import { SparklesIcon, GlobeAltIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import _ from 'lodash'

import { Contract } from '../lib/firebase/contracts'
import { Page } from '../components/page'
import { ActivityFeed, SummaryActivityFeed } from '../components/activity-feed'
import { Comment } from '../lib/firebase/comments'
import FeedCreate from '../components/feed-create'
import { Spacer } from '../components/layout/spacer'
import { Col } from '../components/layout/col'
import { useUser } from '../hooks/use-user'
import { Fold } from '../../common/fold'
import { LoadingIndicator } from '../components/loading-indicator'
import { Row } from '../components/layout/row'
import { FastFoldFollowing } from '../components/fast-fold-following'
import {
  getAllContractInfo,
  useExploreContracts,
  useFilterYourContracts,
  useFindActiveContracts,
} from '../hooks/use-find-active-contracts'
import { fromPropz, usePropz } from '../hooks/use-propz'
import { IS_PRIVATE_MANIFOLD } from '../lib/firebase/init'
import { useGetRecentBets, useRecentBets } from '../hooks/use-bets'
import { useActiveContracts } from '../hooks/use-contracts'
import { useRecentComments } from '../hooks/use-comments'

export const getStaticProps = fromPropz(getStaticPropz)
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
  recentComments: Comment[]
}) => {
  props = props ??
    usePropz(getStaticPropz) ?? {
      contracts: [],
      folds: [],
      recentComments: [],
    }
  const { folds } = props
  const user = useUser()

  const contracts = useActiveContracts() ?? props.contracts
  const { yourContracts, initialFollowedFoldSlugs } = useFilterYourContracts(
    user,
    folds,
    contracts
  )

  const initialRecentBets = useGetRecentBets()
  const recentBets = useRecentBets() ?? initialRecentBets
  const recentComments = useRecentComments() ?? props.recentComments

  const { activeContracts } = useFindActiveContracts({
    contracts: yourContracts,
    recentBets: initialRecentBets ?? [],
    recentComments: props.recentComments,
  })

  const exploreContracts = useExploreContracts()

  const [feedMode, setFeedMode] = useState<'activity' | 'explore'>('activity')

  if (user === null) {
    Router.replace('/')
    return <></>
  }

  return (
    <Page assertUser="signed-in">
      <Col className="items-center">
        <Col className="w-full max-w-[700px]">
          <FeedCreate user={user ?? undefined} />
          <Spacer h={6} />

          {initialFollowedFoldSlugs !== undefined &&
            initialFollowedFoldSlugs.length === 0 &&
            !IS_PRIVATE_MANIFOLD && (
              <FastFoldFollowing
                user={user}
                followedFoldSlugs={initialFollowedFoldSlugs}
              />
            )}

          <Spacer h={5} />

          <Col className="mb-3 gap-2 text-sm text-gray-800 sm:flex-row">
            <Row className="gap-2">
              <div className="tabs">
                <div
                  className={clsx(
                    'tab gap-2',
                    feedMode === 'activity' && 'tab-active'
                  )}
                  onClick={() => setFeedMode('activity')}
                >
                  <SparklesIcon className="inline h-5 w-5" aria-hidden="true" />
                  Recent activity
                </div>
                <div
                  className={clsx(
                    'tab gap-2',
                    feedMode === 'explore' && 'tab-active'
                  )}
                  onClick={() => setFeedMode('explore')}
                >
                  <GlobeAltIcon className="inline h-5 w-5" aria-hidden="true" />
                  Explore
                </div>
              </div>
            </Row>
          </Col>

          {feedMode === 'activity' &&
            (recentBets ? (
              <ActivityFeed
                contracts={activeContracts}
                recentBets={recentBets}
                recentComments={recentComments}
              />
            ) : (
              <LoadingIndicator className="mt-4" />
            ))}

          {feedMode === 'explore' &&
            (exploreContracts ? (
              <SummaryActivityFeed contracts={exploreContracts} />
            ) : (
              <LoadingIndicator className="mt-4" />
            ))}
        </Col>
      </Col>
    </Page>
  )
}

export default Home
