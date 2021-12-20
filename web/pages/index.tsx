import React from 'react'

import { useUser } from '../hooks/use-user'
import Markets from './markets'
import LandingPage from './landing-page'
import { Contract, listAllContracts } from '../lib/firebase/contracts'

export async function getStaticProps() {
  const contracts = await listAllContracts().catch((_) => [])

  return {
    props: {
      contracts,
    },

    revalidate: 60, // regenerate after a minute
  }
}

const Home = (props: { contracts: Contract[] }) => {
  const user = useUser()

  if (user === undefined) return <></>

  return user ? <Markets contracts={props.contracts} /> : <LandingPage />
}

export default Home
