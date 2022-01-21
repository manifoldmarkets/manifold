import React from 'react'
import _ from 'lodash'
import {
  Contract,
  getHotContracts,
  listAllContracts,
} from '../lib/firebase/contracts'
import { Page } from '../components/page'
import { ActivityFeed, findActiveContracts } from './activity'
import {
  getRecentComments,
  Comment,
  listAllComments,
} from '../lib/firebase/comments'
import { Bet, listAllBets } from '../lib/firebase/bets'
import FeedCreate, { FeedPromo } from '../components/feed-create'
import { Spacer } from '../components/layout/spacer'
import { Col } from '../components/layout/col'
import { useUser } from '../hooks/use-user'

export async function getStaticProps() {
  const [contracts, recentComments, hotContracts] = await Promise.all([
    listAllContracts().catch((_) => []),
    getRecentComments().catch(() => []),
    getHotContracts().catch(() => []),
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

  const user = useUser()

  return (
    <Page>
      <Col className="items-center">
        <Col className="max-w-3xl">
          <div className="-mx-2 sm:mx-0">
            {user ? (
              <FeedCreate user={user} />
            ) : (
              <FeedPromo hotContracts={hotContracts} />
            )}
            <Spacer h={4} />
            <ActivityFeed
              contracts={activeContracts}
              contractBets={activeContractBets}
              contractComments={activeContractComments}
            />
          </div>
        </Col>
      </Col>
    </Page>
  )
}

export default Home
