import React from 'react'
import Router from 'next/router'
import _ from 'lodash'

import { Contract } from '../lib/firebase/contracts'
import { Page } from '../components/page'
import { ActivityFeed } from '../components/feed/activity-feed'
import { Comment } from '../lib/firebase/comments'
import FeedCreate from '../components/feed-create'
import { Spacer } from '../components/layout/spacer'
import { Col } from '../components/layout/col'
import { useUser } from '../hooks/use-user'
import { Fold } from '../../common/fold'
import { LoadingIndicator } from '../components/loading-indicator'
import {
  getAllContractInfo,
  useFilterYourContracts,
  useFindActiveContracts,
} from '../hooks/use-find-active-contracts'
import { fromPropz, usePropz } from '../hooks/use-propz'
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
  props = usePropz(props, getStaticPropz) ?? {
    contracts: [],
    folds: [],
    recentComments: [],
  }
  const { folds } = props
  const user = useUser()

  const contracts = useActiveContracts() ?? props.contracts
  const { yourContracts } = useFilterYourContracts(user, folds, contracts)

  const initialRecentBets = useGetRecentBets()
  const recentBets = useRecentBets() ?? initialRecentBets
  const recentComments = useRecentComments() ?? props.recentComments

  const { activeContracts } = useFindActiveContracts({
    contracts: yourContracts,
    recentBets: initialRecentBets ?? [],
    recentComments: props.recentComments,
  })

  if (user === null) {
    Router.replace('/')
    return <></>
  }

  const activityContent = recentBets ? (
    <ActivityFeed
      contracts={activeContracts}
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
          <Spacer h={6} />

          {/* {initialFollowedFoldSlugs !== undefined &&
            initialFollowedFoldSlugs.length === 0 &&
            !IS_PRIVATE_MANIFOLD && (
              <FastFoldFollowing
                user={user}
                followedFoldSlugs={initialFollowedFoldSlugs}
              />
            )} */}

          <Spacer h={5} />

          {activityContent}
        </Col>
      </Col>
    </Page>
  )
}

export default Home
