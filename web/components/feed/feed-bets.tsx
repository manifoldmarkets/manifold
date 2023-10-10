import { memo } from 'react'
import dayjs from 'dayjs'
import { Contract } from 'common/contract'
import { Bet } from 'common/bet'
import { useUser } from 'web/hooks/use-user'
import { Row } from 'web/components/layout/row'
import {
  Avatar,
  AvatarSizeType,
  EmptyAvatar,
} from 'web/components/widgets/avatar'
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
import { Tooltip } from 'web/components/widgets/tooltip'
import { InfoTooltip } from '../widgets/info-tooltip'
import Link from 'next/link'

export const FeedBet = memo(function FeedBet(props: {
  contract: Contract
  bet: Bet
  avatarSize?: AvatarSizeType
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
        <BetActions onReply={onReply} bet={bet} contract={contract} />
      </Row>
    </Col>
  )
})

export function BetStatusText(props: {
  contract: Contract
  bet: Bet
  hideUser?: boolean
  className?: string
  inTimeline?: boolean
}) {
  const { bet, contract, hideUser, className, inTimeline } = props
  const self = useUser()
  const { amount, outcome, createdTime, answerId, isChallenge, isApi } = bet

  const bought = amount >= 0 ? 'bought' : 'sold'
  const absAmount = Math.abs(amount)
  const money = formatMoney(absAmount)
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

  const fromProb = hadPoolMatch
    ? getFormattedMappedValue(contract, bet.probBefore)
    : getFormattedMappedValue(contract, bet.limitProb ?? bet.probBefore)

  const toProb = hadPoolMatch
    ? getFormattedMappedValue(contract, bet.probAfter)
    : getFormattedMappedValue(contract, bet.limitProb ?? bet.probAfter)

  return (
    <div className={clsx('text-ink-1000 text-sm', className)}>
      {!inTimeline ? (
        !hideUser ? (
          <UserLink
            name={bet.userName}
            username={bet.userUsername}
            className={'font-semibold'}
          />
        ) : (
          <span>{self?.id === bet.userId ? 'You' : `A ${BETTOR}`}</span>
        )
      ) : (
        <></>
      )}{' '}
      {orderAmount ? (
        <span>
          {anyFilled ? (
            <>
              filled limit order {money}/{orderAmount}
            </>
          ) : (
            <>created limit order for {orderAmount}</>
          )}{' '}
          <OutcomeLabel
            outcome={outcome}
            answerId={answerId}
            contract={contract}
            truncate="short"
          />{' '}
          at {toProb} {bet.isCancelled && !allFilled ? '(cancelled)' : ''}
        </span>
      ) : (
        <>
          {bought} {money}{' '}
          <OutcomeLabel
            outcome={outcome}
            answerId={answerId}
            contract={contract}
            truncate="short"
          />{' '}
          {fromProb === toProb
            ? `at ${fromProb}`
            : `from ${fromProb} to ${toProb}`}
        </>
      )}{' '}
      {isChallenge && (
        <InfoTooltip text="Loot box purchase">
          <Link href="/lootbox">🎁</Link>
        </InfoTooltip>
      )}
      {isApi && <InfoTooltip text="Placed via the API">🤖</InfoTooltip>}
      {!inTimeline && <RelativeTimestamp time={createdTime} shortened={true} />}
    </div>
  )
}

function BetActions(props: {
  onReply?: (bet: Bet) => void
  bet: Bet
  contract: Contract
}) {
  const { onReply, bet, contract } = props
  const user = useUser()
  if (!user || bet.amount === 0) return null
  return (
    <Col className="ml-1 sm:justify-center">
      {user && onReply && (
        <span>
          <Tooltip
            text={` Reply to ${bet.userName}'s bet`}
            placement="top"
            className="mr-2"
          >
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
          </Tooltip>
        </span>
      )}
    </Col>
  )
}
