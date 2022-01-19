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
      <FeedCreate />
      <Spacer h={5} />
      <ActivityFeed
        contracts={activeContracts}
        contractBets={activeContractBets}
        contractComments={activeContractComments}
      />
    </Page>
  )
}

export default Home
