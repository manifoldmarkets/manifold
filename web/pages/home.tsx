import React from 'react'
import Router from 'next/router'
import _ from 'lodash'

import { Contract, listAllContracts } from '../lib/firebase/contracts'
import { Page } from '../components/page'
import { ActivityFeed, findActiveContracts } from './activity'
import { Comment, getRecentComments } from '../lib/firebase/comments'
import { Bet, getRecentBets } from '../lib/firebase/bets'
import FeedCreate from '../components/feed-create'
import { Spacer } from '../components/layout/spacer'
import { Col } from '../components/layout/col'
import { useUser } from '../hooks/use-user'
import { useUpdatedContracts } from '../hooks/use-contracts'
import { listAllFolds } from '../lib/firebase/folds'
import { Fold } from '../../common/fold'
import { filterDefined } from '../../common/util/array'
import { useUserBetContracts } from '../hooks/use-user-bets'
import { LoadingIndicator } from '../components/loading-indicator'
import { Row } from '../components/layout/row'
import { SparklesIcon } from '@heroicons/react/solid'
import { useFollowedFolds } from '../hooks/use-fold'
import { FastFoldFollowing } from '../components/fast-fold-following'

export async function getStaticProps() {
  let [contracts, folds] = await Promise.all([
    listAllContracts().catch((_) => []),
    listAllFolds().catch(() => []),
  ])

  const [recentBets, recentComments] = await Promise.all([
    getRecentBets(),
    getRecentComments(),
  ])

  return {
    props: {
      contracts,
      recentBets,
      recentComments,
      folds,
    },

    revalidate: 60, // regenerate after a minute
  }
}

const Home = (props: {
  contracts: Contract[]
  folds: Fold[]
  recentBets: Bet[]
  recentComments: Comment[]
}) => {
  const { folds, recentBets, recentComments } = props

  const user = useUser()

  const contracts = useUpdatedContracts(props.contracts)

  const followedFoldIds = useFollowedFolds(user)
  const followedFolds = filterDefined(
    (followedFoldIds ?? []).map((id) => folds.find((fold) => fold.id === id))
  )
  const tagSet = new Set(
    _.flatten(followedFolds.map((fold) => fold.lowercaseTags))
  )

  const yourBetContractIds = useUserBetContracts(user?.id)
  const yourBetContracts = yourBetContractIds
    ? new Set(yourBetContractIds)
    : undefined

  // Show no contracts before your info is loaded.
  let feedContracts: Contract[] = []
  if (yourBetContracts && followedFoldIds) {
    // Show all contracts if no folds are followed.
    if (followedFoldIds.length === 0) feedContracts = contracts
    else
      feedContracts = contracts.filter(
        (contract) =>
          contract.lowercaseTags.some((tag) => tagSet.has(tag)) ||
          yourBetContracts.has(contract.id)
      )
  }

  const activeContracts = findActiveContracts(
    feedContracts,
    recentComments,
    recentBets,
    365
  )

  const betsByContract = _.groupBy(recentBets, (bet) => bet.contractId)
  const activeBets = activeContracts.map(
    (contract) => betsByContract[contract.id] ?? []
  )

  const commentsByContract = _.groupBy(
    recentComments,
    (comment) => comment.contractId
  )
  const activeComments = activeContracts.map(
    (contract) => commentsByContract[contract.id] ?? []
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

          {followedFolds.length === 0 && (
            <FastFoldFollowing
              user={user}
              followedFoldSlugs={followedFolds.map((f) => f.slug)}
            />
          )}

          <Col className="mx-3 mb-3 gap-2 text-sm text-gray-800 sm:flex-row">
            <Row className="gap-2">
              <SparklesIcon className="inline h-5 w-5" aria-hidden="true" />
              <span className="whitespace-nowrap">Recent activity</span>
            </Row>
          </Col>

          {activeContracts ? (
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
