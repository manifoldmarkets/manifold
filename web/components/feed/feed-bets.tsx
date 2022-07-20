import dayjs from 'dayjs'
import { Contract } from 'common/contract'
import { Bet } from 'common/bet'
import { User } from 'common/user'
import { useUser, useUserById } from 'web/hooks/use-user'
import { Row } from 'web/components/layout/row'
import { Avatar, EmptyAvatar } from 'web/components/avatar'
import clsx from 'clsx'
import { UsersIcon } from '@heroicons/react/solid'
import { formatMoney, formatPercent } from 'common/util/format'
import { OutcomeLabel } from 'web/components/outcome-label'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import React, { Fragment } from 'react'
import { uniqBy, partition, sumBy, groupBy } from 'lodash'
import { JoinSpans } from 'web/components/join-spans'
import { UserLink } from '../user-page'
import { formatNumericProbability } from 'common/pseudo-numeric'

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
            <EmptyAvatar />
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
  const { outcomeType } = contract
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'
  const isFreeResponse = outcomeType === 'FREE_RESPONSE'
  const { amount, outcome, createdTime } = bet

  const bought = amount >= 0 ? 'bought' : 'sold'
  const outOfTotalAmount =
    bet.limitProb !== undefined && bet.orderAmount !== undefined
      ? ` / ${formatMoney(bet.orderAmount)}`
      : ''
  const money = formatMoney(Math.abs(amount))

  const hadPoolMatch =
    (bet.limitProb === undefined ||
      bet.fills?.some((fill) => fill.matchedBetId === null)) ??
    false

  const fromProb =
    hadPoolMatch || isFreeResponse
      ? isPseudoNumeric
        ? formatNumericProbability(bet.probBefore, contract)
        : formatPercent(bet.probBefore)
      : isPseudoNumeric
      ? formatNumericProbability(bet.limitProb ?? bet.probBefore, contract)
      : formatPercent(bet.limitProb ?? bet.probBefore)

  const toProb =
    hadPoolMatch || isFreeResponse
      ? isPseudoNumeric
        ? formatNumericProbability(bet.probAfter, contract)
        : formatPercent(bet.probAfter)
      : isPseudoNumeric
      ? formatNumericProbability(bet.limitProb ?? bet.probAfter, contract)
      : formatPercent(bet.limitProb ?? bet.probAfter)

  return (
    <div className="text-sm text-gray-500">
      {bettor ? (
        <UserLink name={bettor.name} username={bettor.username} />
      ) : (
        <span>{isSelf ? 'You' : 'A trader'}</span>
      )}{' '}
      {bought} {money}
      {outOfTotalAmount}
      {!hideOutcome && (
        <>
          {' '}
          of{' '}
          <OutcomeLabel
            outcome={outcome}
            value={(bet as any).value}
            contract={contract}
            truncate="short"
          />{' '}
          {fromProb === toProb
            ? `at ${fromProb}`
            : `from ${fromProb} to ${toProb}`}
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
