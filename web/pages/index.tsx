import React from 'react'
import _ from 'lodash'
import { useUser } from '../hooks/use-user'
import Markets from './markets'
import LandingPage from './landing-page'
import {
  Contract,
  getHotContracts,
  listAllContracts,
} from '../lib/firebase/contracts'

export async function getStaticProps() {
  const [contracts, hotContracts] = await Promise.all([
    listAllContracts().catch((_) => []),
    getHotContracts().catch(() => []),
  ])

  return {
    props: {
      contracts,
      hotContracts,
    },

    revalidate: 60, // regenerate after a minute
  }
}

const Home = (props: { contracts: Contract[]; hotContracts: Contract[] }) => {
  const user = useUser()

  if (user === undefined) return <></>

  const { contracts, hotContracts } = props

  return user ? (
    <Markets contracts={contracts} hotContracts={hotContracts} />
  ) : (
    <LandingPage hotContracts={hotContracts} />
  )
}

export default Home
