import React from 'react'
import _ from 'lodash'
import {
  Contract,
  getClosingSoonContracts,
  getHotContracts,
  listAllContracts,
} from '../lib/firebase/contracts'
import { Spacer } from '../components/layout/spacer'
import { Page } from '../components/page'
import { Title } from '../components/title'
import { ActivityFeed, findActiveContracts } from './activity'
import {
  getRecentComments,
  Comment,
  listAllComments,
} from '../lib/firebase/comments'
import { Bet, listAllBets } from '../lib/firebase/bets'
import { ContractsGrid } from '../components/contracts-list'

export async function getStaticProps() {
  const [contracts, hotContracts, closingSoonContracts, recentComments] =
    await Promise.all([
      listAllContracts().catch((_) => []),
      getHotContracts().catch(() => []),
      getClosingSoonContracts().catch(() => []),
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
      hotContracts,
      closingSoonContracts,
    },

    revalidate: 60, // regenerate after a minute
  }
}

const Home = (props: {
  activeContracts: Contract[]
  activeContractBets: Bet[][]
  activeContractComments: Comment[][]
  hotContracts: Contract[]
  closingSoonContracts: Contract[]
}) => {
  const {
    activeContracts,
    activeContractBets,
    activeContractComments,
    hotContracts,
    closingSoonContracts,
  } = props

  return (
    <Page>
      <HotMarkets contracts={hotContracts} />
      <Spacer h={10} />
      <ClosingSoonMarkets contracts={closingSoonContracts} />
      <Spacer h={10} />
      <ActivityFeed
        contracts={activeContracts}
        contractBets={activeContractBets}
        contractComments={activeContractComments}
      />
    </Page>
  )
}

const HotMarkets = (props: { contracts: Contract[] }) => {
  const { contracts } = props
  if (contracts.length === 0) return <></>

  return (
    <div className="w-full bg-indigo-50 border-2 border-indigo-100 p-6 rounded-lg shadow-md">
      <Title className="mt-0" text="🔥 Markets" />
      <ContractsGrid contracts={contracts} showHotVolume />
    </div>
  )
}

const ClosingSoonMarkets = (props: { contracts: Contract[] }) => {
  const { contracts } = props
  if (contracts.length === 0) return <></>

  return (
    <div className="w-full bg-green-50 border-2 border-green-100 p-6 rounded-lg shadow-md">
      <Title className="mt-0" text="⏰ Closing soon" />
      <ContractsGrid contracts={contracts} showCloseTime />
    </div>
  )
}

export default Home
