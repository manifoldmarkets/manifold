import React from 'react'

import { useUser } from '../hooks/use-user'
import Markets from './markets'
import LandingPage from './landing-page'
import {
  Contract,
  getHotContracts,
  listAllContracts,
} from '../lib/firebase/contracts'
import _ from 'lodash'

export async function getStaticProps() {
  const [contracts, hotContractIds] = await Promise.all([
    listAllContracts().catch((_) => []),
    getHotContracts().catch(() => []),
  ])

  return {
    props: {
      contracts,
      hotContractIds,
    },

    revalidate: 60, // regenerate after a minute
  }
}

const Home = (props: { contracts: Contract[]; hotContractIds: string[] }) => {
  const user = useUser()

  if (user === undefined) return <></>

  return user ? (
    <Markets
      contracts={props.contracts}
      hotContractIds={props.hotContractIds}
    />
  ) : (
    <LandingPage />
  )
}

export default Home
