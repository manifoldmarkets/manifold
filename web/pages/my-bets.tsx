import React from 'react'
import { Header } from '../components/header'
import { Col } from '../components/layout/col'
import { useUser } from '../hooks/use-user'
import { useUserBets } from '../hooks/use-user-bets'

export default function MyBets() {
  const user = useUser()

  const bets = useUserBets(user?.id ?? '')

  if (bets === 'loading') {
    return <div />
  }

  return (
    <div className="max-w-7xl mx-auto sm:px-6 lg:px-8">
      <Header />

      <Col className="w-full md:justify-between md:flex-row mt-4">
        {bets.length === 0 ? (
          <div>You have not made any bets yet!</div>
        ) : (
          <div>{bets.length}</div>
        )}
      </Col>
    </div>
  )
}
