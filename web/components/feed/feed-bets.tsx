import { ReplyIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { DisplayUser } from 'common/api/user-types'
import { Bet } from 'common/bet'
import { Contract, getBinaryMCProb, isBinaryMulti } from 'common/contract'
import { TRADE_TERM } from 'common/envs/constants'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { BETTOR } from 'common/user'
import { floatingEqual, floatingLesserEqual } from 'common/util/math'
import dayjs from 'dayjs'
import { sumBy, uniq } from 'lodash'
import { memo, useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { RepostButton } from 'web/components/comments/repost-modal'
import { Col } from 'web/components/layout/col'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { MultipleOrSingleAvatars } from 'web/components/multiple-or-single-avatars'
import { OutcomeLabel } from 'web/components/outcome-label'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import {
  Avatar,
  AvatarSizeType,
  EmptyAvatar,
} from 'web/components/widgets/avatar'
import { Tooltip } from 'web/components/widgets/tooltip'
import { UserLink } from 'web/components/widgets/user-link'
import { useUser } from 'web/hooks/use-user'
import { useDisplayUserById, useUsers } from 'web/hooks/use-user-supabase'
import { track } from 'web/lib/service/analytics'
import { MoneyDisplay } from '../bet/money-display'
import { UserHovercard } from '../user/user-hovercard'
import { InfoTooltip } from '../widgets/info-tooltip'

export const FeedBet = memo(function FeedBet(props: {
  contract: Contract
  bet: Bet
  avatarSize?: AvatarSizeType
  className?: string
  onReply?: (bet: Bet) => void
}) {
  const { contract, bet, avatarSize, className, onReply } = props
  const { createdTime, userId } = bet
  const user = useDisplayUserById(userId)
  const showUser = dayjs(createdTime).isAfter('2022-06-01')

  return (
    <Col className={'w-full'}>
      <Row className={'justify-between'}>
        <Row className={clsx(className, 'items-center gap-2')}>
          {showUser ? (
            <UserHovercard userId={userId}>
              <Avatar
                size={avatarSize}
                avatarUrl={user?.avatarUrl}
                username={user?.username}
              />
            </UserHovercard>
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
export const FeedReplyBet = memo(function FeedReplyBet(props: {
  contract: Contract
  bets: Bet[]
  avatarSize?: AvatarSizeType
  className?: string
  onReply?: (bet: Bet) => void
}) {
  const { contract, bets, avatarSize, className } = props
  const showUser = bets.every((b) => dayjs(b.createdTime).isAfter('2022-06-01'))

  const users = useUsers(bets.map((b) => b.userId))

  const [showBets, setShowBets] = useState(false)
  return (
    <Col className={'w-full'}>
      <Row className={'w-full gap-2'}>
        {!showUser || !users || users.length === 0 ? (
          <EmptyAvatar className="mx-1" />
        ) : users.length === 1 ? (
          <UserHovercard userId={bets[0].userId}>
            <Avatar
              size={avatarSize}
              avatarUrl={users[0]?.avatarUrl}
              username={users[0]?.username}
            />
          </UserHovercard>
        ) : (
          users.length > 1 && (
            <MultipleOrSingleAvatars
              size={'2xs'}
              spacing={-0.2}
              startLeft={0.2}
              onClick={() => setShowBets(true)}
              avatars={users.filter((u): u is DisplayUser => u != null)}
            />
          )
        )}
        {showBets && (
          <Modal open={showBets} setOpen={setShowBets}>
            <Col className={MODAL_CLASS}>
              {bets.map((bet) => (
                <FeedBet
                  key={bet.id + 'modal-bet'}
                  contract={contract}
                  bet={bet}
                />
              ))}
            </Col>
          </Modal>
        )}
        <Row
          className={clsx(
            className,
            'w-full items-start gap-2 rounded-r-lg rounded-bl-lg  p-1'
          )}
        >
          {bets.length === 1 ? (
            <BetStatusText
              bet={bets[0]}
              contract={contract}
              hideUser={!showUser}
              className="flex-1"
            />
          ) : (
            <BetStatusesText bets={bets} contract={contract} />
          )}
        </Row>
      </Row>
    </Col>
  )
})

export function BetStatusesText(props: {
  contract: Contract
  bets: Bet[]
  className?: string
  inTimeline?: boolean
}) {
  const { bets, contract, className, inTimeline } = props
  const { amount, outcome, createdTime, answerId, userId } = bets[0]
  const user = useDisplayUserById(userId)
  const isCashContract = contract.token === 'CASH'

  const bought = amount >= 0 ? 'bought' : 'sold'
  const absAmount = Math.abs(sumBy(bets, (b) => b.amount))
  const money = (
    <MoneyDisplay amount={absAmount} isCashContract={isCashContract} />
  )
  const uniqueUsers = uniq(bets.map((b) => b.userId))

  return (
    <div className={clsx('text-ink-1000 text-sm', className)}>
      {!inTimeline &&
        (uniqueUsers.length === 1 ? (
          <UserHovercard userId={userId}>
            <UserLink user={user} className={'font-semibold'} />
          </UserHovercard>
        ) : (
          <span>{`${uniq(bets.map((b) => b.userId)).length} traders`}</span>
        ))}{' '}
      <>
        {bought} {money}{' '}
        <OutcomeLabel
          outcome={outcome}
          answer={
            contract.mechanism === 'cpmm-multi-1'
              ? contract.answers?.find((a) => a.id === answerId)
              : undefined
          }
          contract={contract}
          truncate="short"
        />{' '}
      </>
      {!inTimeline && <RelativeTimestamp time={createdTime} shortened={true} />}
    </div>
  )
}

export function BetStatusText(props: {
  contract: Contract
  bet: Bet
  hideUser?: boolean
  className?: string
  inTimeline?: boolean
}) {
  const { bet, contract, hideUser, className, inTimeline } = props
  const isCashContract = contract.token === 'CASH'
  const betUser = useDisplayUserById(bet.userId)
  const self = useUser()
  const { amount, outcome, createdTime, answerId, isApi, silent } = bet
  const getProb = (prob: number) =>
    !isBinaryMulti(contract) ? prob : getBinaryMCProb(prob, outcome)
  const cancelledOrExpired =
    bet.isCancelled ||
    (bet.expiresAt && bet.expiresAt < Date.now() && !bet.silent)

  const probBefore = getProb(bet.probBefore)
  const probAfter = getProb(bet.probAfter)
  const limitProb =
    bet.limitProb === undefined || !isBinaryMulti(contract)
      ? bet.limitProb
      : getBinaryMCProb(bet.limitProb, outcome)
  const bought = amount >= 0 ? 'bought' : 'sold'
  const absAmount = Math.abs(amount)
  const money = (
    <MoneyDisplay amount={absAmount} isCashContract={isCashContract} />
  )
  const isNormalLimitOrder =
    bet.limitProb !== undefined && bet.orderAmount !== undefined && !silent
  const orderAmount =
    bet.limitProb !== undefined && bet.orderAmount !== undefined ? (
      <MoneyDisplay amount={bet.orderAmount} isCashContract={isCashContract} />
    ) : null
  const anyFilled = !floatingLesserEqual(amount, 0)
  const allFilled = floatingEqual(amount, bet.orderAmount ?? amount)

  const hadPoolMatch = bet.fills?.length ?? false

  const fromProb = hadPoolMatch
    ? getFormattedMappedValue(contract, probBefore)
    : getFormattedMappedValue(contract, limitProb ?? probBefore)

  const toProb = hadPoolMatch
    ? getFormattedMappedValue(contract, probAfter)
    : getFormattedMappedValue(contract, limitProb ?? probAfter)

  const answer =
    contract.mechanism === 'cpmm-multi-1'
      ? contract.answers?.find((a) => a.id === answerId)
      : undefined

  return (
    <div className={clsx('text-ink-1000 text-sm', className)}>
      {!inTimeline ? (
        !hideUser ? (
          <UserHovercard userId={bet.userId}>
            <UserLink user={betUser} className={'font-semibold'} />
          </UserHovercard>
        ) : (
          <span>{self?.id === bet.userId ? 'You' : `A ${BETTOR}`}</span>
        )
      ) : (
        <></>
      )}{' '}
      {isNormalLimitOrder ? (
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
            answer={answer}
            contract={contract}
            truncate="short"
          />{' '}
          at {toProb} {cancelledOrExpired && !allFilled ? '(cancelled)' : ''}
        </span>
      ) : (
        <>
          {bought} {money}
          {orderAmount ? '/' : ''}
          {orderAmount}{' '}
          <OutcomeLabel
            outcome={outcome}
            answer={answer}
            contract={contract}
            truncate="short"
          />{' '}
          {fromProb === toProb
            ? `at ${fromProb}`
            : `from ${fromProb} to ${toProb}`}
        </>
      )}{' '}
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
  if (!user) return null
  return (
    <Row className="items-center gap-1">
      <RepostButton
        bet={bet}
        size={'2xs'}
        className={'!p-1'}
        playContract={contract}
      />
      {onReply && (
        <Tooltip
          text={`Reply to this ${TRADE_TERM}`}
          placement="top"
          className="mr-2"
        >
          <Button
            className={'!p-1'}
            color={'gray-white'}
            size={'2xs'}
            onClick={() => {
              onReply(bet)
              track(`reply to ${TRADE_TERM}`, {
                slug: contract.slug,
                amount: bet.amount,
              })
            }}
          >
            <ReplyIcon className=" h-5 w-5" />
          </Button>
        </Tooltip>
      )}
    </Row>
  )
}
