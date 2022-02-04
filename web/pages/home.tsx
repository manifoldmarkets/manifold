import React, { useEffect, useState } from 'react'
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
import { useContracts } from '../hooks/use-contracts'
import { getFollowedFolds, listAllFolds } from '../lib/firebase/folds'
import { Fold } from '../../common/fold'
import { filterDefined } from '../../common/util/array'
import { useUserBets } from '../hooks/use-user-bets'
import { LoadingIndicator } from '../components/loading-indicator'
import { FoldTagList } from '../components/tags-list'

export async function getStaticProps() {
  const [contracts, folds] = await Promise.all([
    listAllContracts().catch((_) => []),
    listAllFolds().catch(() => []),
  ])

  return {
    props: {
      contracts,
      folds,
    },

    revalidate: 60, // regenerate after a minute
  }
}

const Home = (props: { contracts: Contract[]; folds: Fold[] }) => {
  const { folds } = props

  const user = useUser()

  const contracts = useContracts() ?? props.contracts

  const [followedFoldIds, setFollowedFoldIds] = useState<string[] | undefined>(
    undefined
  )

  useEffect(() => {
    if (user) {
      getFollowedFolds(user.id).then((foldIds) => setFollowedFoldIds(foldIds))
    }
  }, [user])

  const followedFolds = filterDefined(
    (followedFoldIds ?? []).map((id) => folds.find((fold) => fold.id === id))
  )
  const tagSet = new Set(
    _.flatten(followedFolds.map((fold) => fold.lowercaseTags))
  )

  const yourBets = useUserBets(user?.id)
  const yourBetContracts = new Set(
    (yourBets ?? []).map((bet) => bet.contractId)
  )

  const feedContracts =
    followedFoldIds && yourBets
      ? contracts.filter(
          (contract) =>
            contract.lowercaseTags.some((tag) => tagSet.has(tag)) ||
            yourBetContracts.has(contract.id)
        )
      : undefined

  const feedContractsKey = feedContracts?.map(({ id }) => id).join(',')

  const [feedBets, setFeedBets] = useState<Bet[][] | undefined>()
  const [feedComments, setFeedComments] = useState<Comment[][] | undefined>()

  useEffect(() => {
    if (feedContracts) {
      Promise.all(
        feedContracts.map((contract) => listAllBets(contract.id))
      ).then(setFeedBets)
      Promise.all(
        feedContracts.map((contract) => listAllComments(contract.id))
      ).then(setFeedComments)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedContractsKey])

  const oneDayMS = 24 * 60 * 60 * 1000
  const recentBets =
    feedBets &&
    feedBets.flat().filter((bet) => bet.createdTime > Date.now() - oneDayMS)

  const activeContracts =
    feedContracts &&
    feedComments &&
    recentBets &&
    findActiveContracts(feedContracts, feedComments.flat(), recentBets, 365)

  const contractBets = activeContracts
    ? activeContracts.map(
        (contract) => feedBets[feedContracts.indexOf(contract)]
      )
    : []
  const contractComments = activeContracts
    ? activeContracts.map(
        (contract) => feedComments[feedContracts.indexOf(contract)]
      )
    : []

  console.log({
    followedFoldIds,
    followedFolds,
    yourBetContracts,
    feedContracts,
    feedBets,
    feedComments,
  })

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
          <FoldTagList
            className="mx-2"
            folds={[
              { name: 'Politics', slug: 'politics' },
              { name: 'Crypto', slug: 'crypto' },
              { name: 'Sports', slug: 'sports' },
              { name: 'Science', slug: 'science' },
              {
                name: 'Manifold Markets',
                slug: 'manifold-markets',
              },
            ]}
          />
          <Spacer h={6} />
          {activeContracts ? (
            <ActivityFeed
              contracts={activeContracts}
              contractBets={contractBets}
              contractComments={contractComments}
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
