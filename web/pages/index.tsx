import React from 'react'

import type { NextPage } from 'next'

import { Hero } from '../components/hero'
import { useUser } from '../hooks/use-user'
import Markets from './markets'
import { useContracts } from '../hooks/use-contracts'
import { SearchableGrid } from '../components/contracts-list'
import { Title } from '../components/title'

const Home: NextPage = () => {
  const user = useUser()

  if (user === undefined) return <></>
  return user ? <Markets /> : <LandingPage />
}

function LandingPage() {
  const contracts = useContracts()

  return (
    <div>
      <Hero />
      <div className="max-w-4xl py-8 mx-auto">
        <Title text="Explore prediction markets" />
        <SearchableGrid contracts={contracts === 'loading' ? [] : contracts} />
      </div>
    </div>
  )
}

export default Home
