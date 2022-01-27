import React from 'react'
import Router from 'next/router'

import {
  Contract,
  getClosingSoonContracts,
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
import FeedCreate from '../components/feed-create'
import { Spacer } from '../components/layout/spacer'
import { Col } from '../components/layout/col'
import { useUser } from '../hooks/use-user'

export async function getStaticProps() {
  const [contracts, recentComments, hotContracts, closingSoonContracts] =
    await Promise.all([
      listAllContracts().catch((_) => []),
      getRecentComments().catch(() => []),
      getHotContracts().catch(() => []),
      getClosingSoonContracts().catch(() => []),
    ])

  const activeContracts = findActiveContracts(contracts, recentComments)
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
    // hotContracts,
    // closingSoonContracts,
  } = props

  const user = useUser()

  // const initialActiveContracts = props.activeContracts ?? []
  // const contracts = useContracts()
  // const recentComments = useRecentComments()
  // const activeContracts =
  //   recentComments && contracts
  //     ? findActiveContracts(contracts, recentComments)
  //     : initialActiveContracts
  // TODO: get activeContractBets, activeContractComments associated with activeContracts

  if (user === null) {
    Router.replace('/')
    return <></>
  }

  return (
    <Page>
      <Col className="items-center">
        <Col className="max-w-3xl">
          <div className="-mx-2 sm:mx-0">
            <FeedCreate user={user ?? undefined} />
            <Spacer h={4} />

            {/* <HotMarkets contracts={hotContracts?.slice(0, 4) ?? []} />
            <Spacer h={4} />

            <ClosingSoonMarkets contracts={closingSoonContracts ?? []} />
            <Spacer h={10} /> */}

            <ActivityFeed
              contracts={activeContracts ?? []}
              contractBets={activeContractBets ?? []}
              contractComments={activeContractComments ?? []}
            />
          </div>
        </Col>
      </Col>
    </Page>
  )
}

export default Home
