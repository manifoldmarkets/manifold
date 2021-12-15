import React from 'react'

import type { NextPage } from 'next'

import { Hero } from '../components/hero'
import { useUser } from '../hooks/use-user'
import Markets from './markets'

const Home: NextPage = () => {
  const user = useUser()
  return user ? <Markets /> : <Hero />
}

export default Home
