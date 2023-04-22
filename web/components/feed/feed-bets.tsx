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
import { track } from 'web/lib/service/analytics'
import { groupBy, maxBy, partition, sumBy } from 'lodash'
import { MINUTE_MS } from 'common/util/time'
import { sort } from 'd3-array'

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
export function groupBetsByCreatedTimeAndUserId(bets: Bet[]) {
  const DISTANCE_IN_MINUTES = 60
  const betsByUserId = groupBy(
    bets,
    // Don't combine limit order creations and bets that actually fill
    (bet) => `${bet.userId}-${bet.amount === 0 ? 'limit' : 'market'}`
  )
  const betsByTime: {
    [key: number]: Bet[]
  } = {}
  Object.keys(betsByUserId).forEach((userIdAndBetType) => {
    const userBets = betsByUserId[userIdAndBetType]
    userBets.forEach((bet) => {
      const { createdTime } = bet
      const timestamps = Object.keys(betsByTime)
      let foundTimestamp = 0
      timestamps.forEach((key) => {
        const timestamp = key ? parseInt(key) : createdTime
        const differenceInMinutes = Math.abs(
          (createdTime - timestamp) / MINUTE_MS
        )
        if (
          differenceInMinutes <= DISTANCE_IN_MINUTES &&
          betsByTime[timestamp][0].userId === userIdAndBetType.split('-')[0]
        ) {
          foundTimestamp = timestamp
        }
      })
      if (foundTimestamp) {
        betsByTime[foundTimestamp].push(bet)
      } else {
        betsByTime[createdTime] = [bet]
      }
    })
  })
  const sortedBetsByTime: Bet[][] = []
  sort(Object.keys(betsByTime), (a, b) => parseInt(b) - parseInt(a)).forEach(
    (key) => {
      sortedBetsByTime.push(betsByTime[parseInt(key)])
    }
  )
  return sortedBetsByTime
}
export const SummarizeBets = memo(function SummarizeBets(props: {
  contract: Contract
  betsBySameUser: Bet[]
  avatarSize?: number | '2xs' | 'xs' | 'sm'
  className?: string
  onReply?: (bet: Bet) => void
}) {
  const { contract, betsBySameUser, avatarSize, className, onReply } = props
  let bet = betsBySameUser[0]
  // for simplicity, we should just show buys of yes or buys of no
  if (betsBySameUser.length > 1) {
    // get the bet with the highest amount
    const maxBet = maxBy(betsBySameUser, (bet) => Math.abs(bet.amount))
    bet = maxBet ?? bet
    const [yesBets, noBets] = partition(
      betsBySameUser,
      (bet) => bet.outcome === 'YES' || (bet.outcome === 'NO' && bet.amount < 0)
    )
    const totalYesAmount = sumBy(yesBets, (bet) => Math.abs(bet.amount))
    const totalNoAmount = sumBy(noBets, (bet) => Math.abs(bet.amount))
    const showYes = totalYesAmount > totalNoAmount
    bet = {
      ...bet,
      outcome: showYes ? 'YES' : 'NO',
      amount: Math.abs(totalYesAmount - totalNoAmount),
    }
  }
  const { userAvatarUrl, userUsername, createdTime } = bet
  const showUser = dayjs(createdTime).isAfter('2022-06-01')

  // group bets by userid made within 30 minutes of each other
  return (
    <Col className={'w-full'}>
      <Row className={'justify-between'}>
        <Row className={clsx(className, 'items-center gap-2')}>
          {showUser ? (
            <Avatar
              size={avatarSize}
              avatarUrl={userAvatarUrl}
              username={userUsername}
              className='z-10'
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
  const { onReply, bet, contract } = props
  const user = useUser()
  if (!user || bet.amount === 0) return null
  return (
    <Col className="sm:justify-center">
      {user && onReply && (
        <span>
          <button
            onClick={() => {
              onReply(bet)
              track('reply to bet', {
                slug: contract.slug,
                amount: bet.amount,
              })
            }}
          >
            <ReplyIcon className="text-ink-500 h-4 w-4" />
          </button>
        </span>
      )}
    </Col>
  )
}
