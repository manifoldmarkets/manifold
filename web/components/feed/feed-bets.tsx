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
import { Col } from 'web/components/layout/col'
import { ReplyIcon } from '@heroicons/react/solid'

export const FeedBet = memo(function FeedBet(props: {
  contract: Contract
  bet: Bet
  avatarSize?: number | '2xs' | 'xs' | 'sm'
  className?: string
  onReply?: (bet: Bet) => void
}) {
  const { contract, bet, avatarSize, className, onReply } = props
  const { userAvatarUrl, userUsername, createdTime } = bet
  const showUser = dayjs(createdTime).isAfter('2022-06-01')

  return (
    <Col className={'w-full'}>
      <Row className={'justify-between'}>
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
        <BetActions
          onReply={onReply}
          bet={bet}
          betLikes={0}
          contract={contract}
        />
      </Row>
    </Col>
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

function BetActions(props: {
  onReply?: (bet: Bet) => void
  bet: Bet
  betLikes: number
  showLike?: boolean
  contract: Contract
}) {
  const { onReply, bet } = props
  const user = useUser()
  if (!user || bet.amount === 0) return null
  return (
    <Col className="sm:justify-center">
      {user && onReply && (
        <span>
          <button onClick={() => onReply(bet)}>
            <ReplyIcon className="text-ink-500 h-4 w-4" />
          </button>
        </span>
      )}
    </Col>
  )
}
