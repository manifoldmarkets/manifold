import React from 'react'
import _ from 'lodash'
import { useUser } from '../hooks/use-user'
import {
  Contract,
  getHotContracts,
  listAllContracts,
} from '../lib/firebase/contracts'
import LandingPage from './landing-page'
import { ContractsGrid } from '../components/contracts-list'
import { Spacer } from '../components/layout/spacer'
import { Page } from '../components/page'
import { Title } from '../components/title'
import { ActivityFeed } from './activity'
import { getRecentComments, Comment } from '../lib/firebase/comments'

export async function getStaticProps() {
  const [contracts, hotContracts, recentComments] = await Promise.all([
    listAllContracts().catch((_) => []),
    getHotContracts().catch(() => []),
    getRecentComments().catch(() => []),
  ])

  return {
    props: {
      contracts,
      hotContracts,
      recentComments,
    },

    revalidate: 60, // regenerate after a minute
  }
}

const Home = (props: {
  contracts: Contract[]
  hotContracts: Contract[]
  recentComments: Comment[]
}) => {
  const user = useUser()

  if (user === undefined) return <></>

  const { contracts, hotContracts, recentComments } = props

  if (user === null) {
    return <LandingPage hotContracts={hotContracts} />
  }

  return (
    <Page>
      <div className="w-full bg-indigo-50 border-2 border-indigo-100 p-6 rounded-lg shadow-md">
        <Title className="mt-0" text="🔥 Markets" />
        <ContractsGrid contracts={hotContracts} showHotVolume />
      </div>

      <Spacer h={10} />

      <ActivityFeed contracts={contracts} recentComments={recentComments} />
    </Page>
  )
}

export default Home
