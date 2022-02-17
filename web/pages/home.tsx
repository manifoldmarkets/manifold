import React from 'react'
import Router from 'next/router'
import _ from 'lodash'

import { Contract, listAllContracts } from '../lib/firebase/contracts'
import { Page } from '../components/page'
import { ActivityFeed, findActiveContracts } from './activity'
import { Comment, listAllComments } from '../lib/firebase/comments'
import { Bet, listAllBets } from '../lib/firebase/bets'
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
import { FoldTagList } from '../components/tags-list'
import { SearchIcon } from '@heroicons/react/outline'
import { Row } from '../components/layout/row'
import { SparklesIcon } from '@heroicons/react/solid'
import { useFollowedFolds } from '../hooks/use-fold'
import { SiteLink } from '../components/site-link'

export async function getStaticProps() {
  const [contracts, folds] = await Promise.all([
    listAllContracts().catch((_) => []),
    listAllFolds().catch(() => []),
  ])

  const [contractBets, contractComments] = await Promise.all([
    Promise.all(contracts.map((contract) => listAllBets(contract.id))),
    Promise.all(contracts.map((contract) => listAllComments(contract.id))),
  ])

  return {
    props: {
      contracts,
      contractBets,
      contractComments,
      folds,
    },

    revalidate: 60, // regenerate after a minute
  }
}

const Home = (props: {
  contracts: Contract[]
  contractBets: Bet[][]
  contractComments: Comment[][]
  folds: Fold[]
}) => {
  const { contractBets, contractComments, folds } = props

  const user = useUser()

  const contracts = useUpdatedContracts(props.contracts)
  const contractIdToIndex = _.fromPairs(
    contracts.map((contract, index) => [contract.id, index])
  )

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

  const oneDayMS = 24 * 60 * 60 * 1000
  const recentBets = (feedContracts ?? [])
    .map((c) => contractBets[contractIdToIndex[c.id]])
    .flat()
    .filter((bet) => bet.createdTime > Date.now() - oneDayMS)
  const feedComments = (feedContracts ?? [])
    .map((c) => contractComments[contractIdToIndex[c.id]])
    .flat()

  const activeContracts =
    feedContracts &&
    findActiveContracts(feedContracts, feedComments, recentBets, 365)

  const activeBets = activeContracts
    ? activeContracts.map(
        (contract) => contractBets[contractIdToIndex[contract.id]]
      )
    : []
  const activeComments = activeContracts
    ? activeContracts.map(
        (contract) => contractComments[contractIdToIndex[contract.id]]
      )
    : []

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
          <FastFoldFollowing />
          <Spacer h={10} />
          <Col className="mx-3 mb-3 gap-2 text-sm text-gray-800 sm:flex-row">
            <Row className="gap-2">
              <SparklesIcon className="inline h-5 w-5" aria-hidden="true" />
              <span className="whitespace-nowrap">Recent activity</span>
              <span className="hidden sm:flex">—</span>
            </Row>
            <div className="text-gray-500 sm:text-gray-800">
              <SiteLink href="/folds" className="font-semibold">
                Follow a community
              </SiteLink>{' '}
              to personalize
            </div>
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

const FastFoldFollowing = () => {
  return (
    <>
      <Row className="mx-3 mb-3 items-center gap-2 text-sm text-gray-800">
        <SearchIcon className="inline h-5 w-5" aria-hidden="true" />
        Personalize your feed — click on a community to follow
      </Row>
      <FoldTagList
        className="mx-2"
        noLabel
        folds={[
          { name: 'Politics', slug: 'politics' },
          { name: 'Crypto', slug: 'crypto' },
          { name: 'Sports', slug: 'sports' },
          { name: 'Science', slug: 'science' },
          { name: 'Covid', slug: 'covid' },
          { name: 'AI', slug: 'ai' },
          {
            name: 'Manifold Markets',
            slug: 'manifold-markets',
          },
        ]}
      />
    </>
  )
}

export default Home
