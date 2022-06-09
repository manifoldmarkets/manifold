import dayjs from 'dayjs'
import { Contract } from 'common/contract'
import { Bet } from 'common/bet'
import { User } from 'common/user'
import { useUser, useUserById } from 'web/hooks/use-user'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/avatar'
import clsx from 'clsx'
import { UserIcon, UsersIcon } from '@heroicons/react/solid'
import { formatMoney } from 'common/util/format'
import { OutcomeLabel } from 'web/components/outcome-label'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import React, { Fragment } from 'react'
import { uniqBy, partition, sumBy, groupBy } from 'lodash'
import { JoinSpans } from 'web/components/join-spans'

export function FeedBet(props: {
  contract: Contract
  bet: Bet
  hideOutcome: boolean
  smallAvatar: boolean
}) {
  const { contract, bet, hideOutcome, smallAvatar } = props
  const { userId, createdTime } = bet

  const isBeforeJune2022 = dayjs(createdTime).isBefore('2022-06-01')
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const bettor = isBeforeJune2022 ? undefined : useUserById(userId)

  const user = useUser()
  const isSelf = user?.id === userId

  return (
    <>
      <Row className={'flex w-full gap-2 pt-3'}>
        {isSelf ? (
          <Avatar
            className={clsx(smallAvatar && 'ml-1')}
            size={smallAvatar ? 'sm' : undefined}
            avatarUrl={user.avatarUrl}
            username={user.username}
          />
        ) : bettor ? (
          <Avatar
            className={clsx(smallAvatar && 'ml-1')}
            size={smallAvatar ? 'sm' : undefined}
            avatarUrl={bettor.avatarUrl}
            username={bettor.username}
          />
        ) : (
          <div className="relative px-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
              <UserIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />
            </div>
          </div>
        )}
        <div className={'min-w-0 flex-1 py-1.5'}>
          <BetStatusText
            bet={bet}
            contract={contract}
            isSelf={isSelf}
            bettor={bettor}
            hideOutcome={hideOutcome}
          />
        </div>
      </Row>
    </>
  )
}

export function BetStatusText(props: {
  contract: Contract
  bet: Bet
  isSelf: boolean
  bettor?: User
  hideOutcome?: boolean
}) {
  const { bet, contract, bettor, isSelf, hideOutcome } = props
  const { amount, outcome, createdTime } = bet

  const bought = amount >= 0 ? 'bought' : 'sold'
  const money = formatMoney(Math.abs(amount))

  return (
    <div className="text-sm text-gray-500">
      <span>{isSelf ? 'You' : bettor ? bettor.name : 'A trader'}</span> {bought}{' '}
      {money}
      {!hideOutcome && (
        <>
          {' '}
          of{' '}
          <OutcomeLabel
            outcome={outcome}
            value={(bet as any).value}
            contract={contract}
            truncate="short"
          />
        </>
      )}
      <RelativeTimestamp time={createdTime} />
    </div>
  )
}

function BetGroupSpan(props: {
  contract: Contract
  bets: Bet[]
  outcome?: string
}) {
  const { contract, bets, outcome } = props

  const numberTraders = uniqBy(bets, (b) => b.userId).length

  const [buys, sells] = partition(bets, (bet) => bet.amount >= 0)
  const buyTotal = sumBy(buys, (b) => b.amount)
  const sellTotal = sumBy(sells, (b) => -b.amount)

  return (
    <span>
      {numberTraders} {numberTraders > 1 ? 'traders' : 'trader'}{' '}
      <JoinSpans>
        {buyTotal > 0 && <>bought {formatMoney(buyTotal)} </>}
        {sellTotal > 0 && <>sold {formatMoney(sellTotal)} </>}
      </JoinSpans>
      {outcome && (
        <>
          {' '}
          of{' '}
          <OutcomeLabel
            outcome={outcome}
            contract={contract}
            truncate="short"
          />
        </>
      )}{' '}
    </span>
  )
}

export function FeedBetGroup(props: {
  contract: Contract
  bets: Bet[]
  hideOutcome: boolean
}) {
  const { contract, bets, hideOutcome } = props

  const betGroups = groupBy(bets, (bet) => bet.outcome)
  const outcomes = Object.keys(betGroups)

  // Use the time of the last bet for the entire group
  const createdTime = bets[bets.length - 1].createdTime

  return (
    <>
      <div>
        <div className="relative px-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
            <UsersIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />
          </div>
        </div>
      </div>
      <div className={clsx('min-w-0 flex-1', outcomes.length === 1 && 'mt-1')}>
        <div className="text-sm text-gray-500">
          {outcomes.map((outcome, index) => (
            <Fragment key={outcome}>
              <BetGroupSpan
                contract={contract}
                outcome={hideOutcome ? undefined : outcome}
                bets={betGroups[outcome]}
              />
              {index !== outcomes.length - 1 && <br />}
            </Fragment>
          ))}
          <RelativeTimestamp time={createdTime} />
        </div>
      </div>
    </>
  )
}
