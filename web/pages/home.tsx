import React from 'react'
import Router from 'next/router'
import _ from 'lodash'

import { Contract, listAllContracts } from '../lib/firebase/contracts'
import { Page } from '../components/page'
import { ActivityFeed, findActiveContracts } from './activity'
import {
  getRecentComments,
  Comment,
  listAllComments,
} from '../lib/firebase/comments'
import { Bet, getRecentBets, listAllBets } from '../lib/firebase/bets'
import FeedCreate from '../components/feed-create'
import { Spacer } from '../components/layout/spacer'
import { Col } from '../components/layout/col'
import { useUser } from '../hooks/use-user'
import { useContracts } from '../hooks/use-contracts'
import { FoldTag, TagsList } from '../components/tags-list'
import { Row } from '../components/layout/row'

export async function getStaticProps() {
  const [contracts, recentComments, recentBets] = await Promise.all([
    listAllContracts().catch((_) => []),
    getRecentComments().catch(() => []),
    getRecentBets().catch(() => []),
  ])

  const activeContracts = findActiveContracts(
    contracts,
    recentComments,
    recentBets
  )
  const activeContractBets = await Promise.all(
    activeContracts.map((contract) => listAllBets(contract.id).catch((_) => []))
  )
  const activeContractComments = await Promise.all(
    activeContracts.map((contract) =>
      listAllComments(contract.id).catch((_) => [])
    )
  )

  return {
    props: {
      activeContracts,
      activeContractBets,
      activeContractComments,
    },

    revalidate: 60, // regenerate after a minute
  }
}

const Home = (props: {
  activeContracts: Contract[]
  activeContractBets: Bet[][]
  activeContractComments: Comment[][]
}) => {
  const { activeContracts, activeContractBets, activeContractComments } = props

  const user = useUser()

  const contracts = useContracts() ?? activeContracts
  const contractsMap = _.fromPairs(
    contracts.map((contract) => [contract.id, contract])
  )
  const updatedContracts = activeContracts.map(
    (contract) => contractsMap[contract.id]
  )

  if (user === null) {
    Router.replace('/')
    return <></>
  }

  return (
    <Page assertUser="signed-in">
      <Col className="items-center">
        <Col className="max-w-3xl">
          <FeedCreate user={user ?? undefined} />
          <Spacer h={4} />

          <TagsList
            className="mx-2"
            tags={[
              '#politics',
              '#crypto',
              '#covid',
              '#sports',
              '#meta',
              '#science',
            ]}
          />
          <Spacer h={4} />

          <ActivityFeed
            contracts={updatedContracts}
            contractBets={activeContractBets}
            contractComments={activeContractComments}
          />
        </Col>
      </Col>
    </Page>
  )
}

export default Home
