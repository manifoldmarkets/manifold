import React from 'react'
import _ from 'lodash'
import {
  Contract,
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
import { Col } from '../components/layout/col'
import { ContractCard } from '../components/contract-card'
import { Bet, listAllBets } from '../lib/firebase/bets'

export async function getStaticProps() {
  const [contracts, hotContracts, recentComments] = await Promise.all([
    listAllContracts().catch((_) => []),
    getHotContracts().catch(() => []),
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
    },

    revalidate: 60, // regenerate after a minute
  }
}

const Home = (props: {
  activeContracts: Contract[]
  activeContractBets: Bet[][]
  activeContractComments: Comment[][]
  hotContracts: Contract[]
}) => {
  const {
    activeContracts,
    activeContractBets,
    activeContractComments,
    hotContracts,
  } = props

  return (
    <Page>
      <HotMarkets hotContracts={hotContracts} />
      <Spacer h={10} />
      <ActivityFeed
        contracts={activeContracts}
        contractBets={activeContractBets}
        contractComments={activeContractComments}
      />
    </Page>
  )
}

const HotMarkets = (props: { hotContracts: Contract[] }) => {
  const { hotContracts } = props
  if (hotContracts.length < 4) return <></>

  const [c1, c2, c3, c4] = hotContracts

  return (
    <div className="w-full bg-indigo-50 border-2 border-indigo-100 p-6 rounded-lg shadow-md">
      <Title className="mt-0" text="🔥 Markets" />
      <Col className="gap-6">
        <Col className="md:flex-row items-start gap-6">
          <ContractCard className="flex-1" contract={c1} showHotVolume />
          <ContractCard className="flex-1" contract={c2} showHotVolume />
        </Col>
        <Col className="md:flex-row items-start gap-6">
          <ContractCard className="flex-1" contract={c3} showHotVolume />
          <ContractCard className="flex-1" contract={c4} showHotVolume />
        </Col>
      </Col>
    </div>
  )
}

export default Home
