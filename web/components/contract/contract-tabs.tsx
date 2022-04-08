import { useState } from 'react'
import clsx from 'clsx'

import { Bet } from '../../../common/bet'
import { Contract } from '../../../common/contract'
import { Comment } from '../../lib/firebase/comments'
import { User } from '../../../common/user'
import { useBets } from '../../hooks/use-bets'
import { ContractActivity } from '../feed/contract-activity'
import { ContractBetsTable, MyBetsSummary } from '../bets-list'
import { Spacer } from '../layout/spacer'
import { Tabs } from '../layout/tabs'

export function ContractTabs(props: {
  contract: Contract
  user: User | null | undefined
  bets: Bet[]
  comments: Comment[]
}) {
  const { contract, user, comments } = props

  const bets = useBets(contract.id) ?? props.bets
  // Decending creation time.
  bets.sort((bet1, bet2) => bet2.createdTime - bet1.createdTime)
  const userBets = user && bets.filter((bet) => bet.userId === user.id)

  const activity = (
    <ContractActivity
      contract={contract}
      bets={bets}
      comments={comments}
      user={user}
      mode="all"
      betRowClassName="!mt-0 xl:hidden"
    />
  )

  if (!user || !userBets?.length) return activity

  const yourTrades = (
    <div>
      <MyBetsSummary className="px-2" contract={contract} bets={userBets} />
      <Spacer h={6} />
      <ContractBetsTable contract={contract} bets={userBets} />
      <Spacer h={12} />
    </div>
  )

  return (
    <Tabs
      tabs={[
        { title: 'Timeline', content: activity },
        { title: 'Your trades', content: yourTrades },
      ]}
    />
  )
}
