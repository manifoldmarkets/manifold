import React, { memo } from 'react'
import dayjs from 'dayjs'
import { Contract } from 'common/contract'
import { Bet } from 'common/bet'
import { useUser } from 'web/hooks/use-user'
import { Row } from 'web/components/layout/row'
import { Avatar, EmptyAvatar } from 'web/components/widgets/avatar'
import clsx from 'clsx'
import { formatMoney } from 'common/util/format'
import { OutcomeLabel } from 'web/components/outcome-label'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { UserLink } from 'web/components/widgets/user-link'
import { BETTOR } from 'common/user'
import { floatingEqual, floatingLesserEqual } from 'common/util/math'

export const FeedBet = memo(function FeedBet(props: {
  contract: Contract
  bet: Bet
  avatarSize?: number | '2xs' | 'xs' | 'sm'
  className?: string
}) {
  const { contract, bet, avatarSize, className } = props
  const { userAvatarUrl, userUsername, createdTime } = bet
  const showUser = dayjs(createdTime).isAfter('2022-06-01')

  return (
    <Row className={clsx(className, 'items-center gap-2')}>
      {showUser ? (
        <Avatar
          size={avatarSize}
          avatarUrl={userAvatarUrl}
          username={userUsername}
        />
      ) : (
        <EmptyAvatar className="mx-1" />
      )}
      <BetStatusText
        bet={bet}
        contract={contract}
        hideUser={!showUser}
        className="flex-1"
      />
    </Row>
  )
})

export function BetStatusText(props: {
  contract: Contract
  bet: Bet
  hideUser?: boolean
  className?: string
}) {
  const { bet, contract, hideUser, className } = props
  const { outcomeType, mechanism } = contract
  const self = useUser()
  const isFreeResponse = outcomeType === 'FREE_RESPONSE'
  const isCPMM2 = mechanism === 'cpmm-2'
  const { amount, outcome, createdTime, shares } = bet

  const bought = amount >= 0 ? 'bought' : 'sold'
  const isShortSell = isCPMM2 && amount > 0 && shares === 0
  const money = formatMoney(Math.abs(amount))
  const orderAmount =
    bet.limitProb !== undefined && bet.orderAmount !== undefined
      ? formatMoney(bet.orderAmount)
      : ''
  const anyFilled = !floatingLesserEqual(amount, 0)
  const allFilled = floatingEqual(amount, bet.orderAmount ?? amount)

  const hadPoolMatch =
    (bet.limitProb === undefined ||
      bet.fills?.some((fill) => fill.matchedBetId === null)) ??
    false

  const fromProb =
    hadPoolMatch || isFreeResponse
      ? getFormattedMappedValue(contract, bet.probBefore)
      : getFormattedMappedValue(contract, bet.limitProb ?? bet.probBefore)

  const toProb =
    hadPoolMatch || isFreeResponse
      ? getFormattedMappedValue(contract, bet.probAfter)
      : getFormattedMappedValue(contract, bet.limitProb ?? bet.probAfter)

  return (
    <div className={clsx('text-ink-500 text-sm', className)}>
      {!hideUser ? (
        <UserLink name={bet.userName} username={bet.userUsername} />
      ) : (
        <span>{self?.id === bet.userId ? 'You' : `A ${BETTOR}`}</span>
      )}{' '}
      {orderAmount ? (
        <>
          {anyFilled ? (
            <>
              filled limit order {money}/{orderAmount}
            </>
          ) : (
            <>created limit order for {orderAmount}</>
          )}{' '}
          <OutcomeLabel
            outcome={outcome}
            value={(bet as any).value}
            contract={contract}
            truncate="short"
          />{' '}
          at {toProb} {bet.isCancelled && !allFilled ? '(cancelled)' : ''}
        </>
      ) : (
        <>
          {bought} {money} {isCPMM2 && (isShortSell ? 'NO of ' : 'YES of')}{' '}
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
      )}{' '}
      <RelativeTimestamp time={createdTime} />
    </div>
  )
}
