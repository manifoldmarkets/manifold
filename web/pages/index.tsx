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

  const { contracts, hotContractIds } = props
  const hotContracts = hotContractIds
    .map((id) => contracts.find((contract) => contract.id === id) as Contract)
    .filter((contract) => !contract.isResolved)
    .slice(0, 4)

  return user ? (
    <Markets contracts={contracts} hotContractIds={hotContractIds} />
  ) : (
    <LandingPage hotContracts={hotContracts} />
  )
}

export default Home
