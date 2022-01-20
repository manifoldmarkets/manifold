import React from 'react'
import _ from 'lodash'
import { Contract, listAllContracts } from '../lib/firebase/contracts'
import { Page } from '../components/page'
import { ActivityFeed, findActiveContracts } from './activity'
import {
  getRecentComments,
  Comment,
  listAllComments,
} from '../lib/firebase/comments'
import { Bet, listAllBets } from '../lib/firebase/bets'
import FeedCreate from '../components/feed-create'
import { Spacer } from '../components/layout/spacer'
import { Col } from '../components/layout/col'

export async function getStaticProps() {
  const [contracts, recentComments] = await Promise.all([
    listAllContracts().catch((_) => []),
    getRecentComments().catch(() => []),
  ])

  const activeContracts = findActiveContracts(contracts, recentComments)
  const activeContractBets = await Promise.all(
    activeContracts.map((contract) => listAllBets(contract.id))
  )
  const activeContractComments = await Promise.all(
    activeContracts.map((contract) => listAllComments(contract.id))
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

  return (
    <Page>
      <Col className="items-center">
        <Col className="max-w-3xl">
          <FeedCreate />
          <Spacer h={4} />
          <ActivityFeed
            contracts={activeContracts}
            contractBets={activeContractBets}
            contractComments={activeContractComments}
          />
        </Col>
      </Col>
    </Page>
  )
}

export default Home
