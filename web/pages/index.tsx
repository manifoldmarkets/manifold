import React from 'react'
import type { NextPage } from 'next'

import { useUser } from '../hooks/use-user'
import Markets from './markets'
import LandingPage from './landing-page'

const Home: NextPage = () => {
  const user = useUser()

  if (user === undefined) return <></>
  return user ? <Markets /> : <LandingPage />
}

export default Home
