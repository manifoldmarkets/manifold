import React from 'react'
import Router from 'next/router'
import _ from 'lodash'

import { Contract, listAllContracts } from '../lib/firebase/contracts'
import { Page } from '../components/page'
import { ActivityFeed, getActivity } from './activity'
import { listAllComments } from '../lib/firebase/comments'
import { listAllBets } from '../lib/firebase/bets'
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
import { ActivityItem } from '../components/contract-feed'

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
      ...getActivity(contracts, contractBets, contractComments),
      folds,
    },

    revalidate: 60, // regenerate after a minute
  }
}

const Home = (props: {
  contracts: Contract[]
  contractActivityItems: ActivityItem[][]
  folds: Fold[]
}) => {
  const { contractActivityItems, folds } = props

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

  const feedContracts =
    followedFoldIds && yourBetContracts
      ? contracts
          .filter(
            (contract) =>
              contract.lowercaseTags.some((tag) => tagSet.has(tag)) ||
              yourBetContracts.has(contract.id)
          )
          .slice(0, 75)
      : undefined

  const feedContractSet = new Set(feedContracts?.map((contract) => contract.id))

  const feedActivityItems = contractActivityItems.filter((_, index) =>
    feedContractSet.has(contracts[index].id)
  )

  if (user === null) {
    Router.replace('/')
    return <></>
  }

  return (
    <Page assertUser="signed-in">
      <Col className="items-center">
        <Col className="max-w-3xl w-full">
          <FeedCreate user={user ?? undefined} />
          <Spacer h={6} />
          <Row className="text-sm text-gray-800 mx-3 mb-3 gap-2 items-center">
            <SearchIcon className="inline w-5 h-5" aria-hidden="true" />
            Explore our communities
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
          <Spacer h={10} />
          <Row className="text-sm text-gray-800 mx-3 mb-3 gap-2 items-center">
            <SparklesIcon className="inline w-5 h-5" aria-hidden="true" />
            Recent activity
          </Row>
          {feedContracts ? (
            <ActivityFeed
              contracts={feedContracts}
              contractActivityItems={feedActivityItems}
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
