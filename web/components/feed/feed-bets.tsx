import clsx from 'clsx'
import { DisplayUser } from 'common/api/user-types'
import { Bet, fill } from 'common/bet'
import {
  Contract,
  getBinaryMCProb,
  isBinaryMulti,
  MarketContract,
} from 'common/contract'
import { TRADE_TERM } from 'common/envs/constants'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { BETTOR } from 'common/user'
import {
  formatMoney,
  formatOutcomeLabel,
  formatPercent,
  formatSweepies,
} from 'common/util/format'
import { floatingEqual, floatingLesserEqual } from 'common/util/math'
import dayjs from 'dayjs'
import { sumBy, uniq } from 'lodash'
import { memo, useEffect, useState } from 'react'
import { LuLineChart, LuReply, LuShare2 } from 'react-icons/lu'
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
import { api } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'
import { MoneyDisplay } from '../bet/money-display'
import { ShareBetModal } from '../bet/share-bet'
import { getPseudonym } from '../charts/contract/choice'
import { UserHovercard } from '../user/user-hovercard'
import { InfoTooltip } from '../widgets/info-tooltip'
import { DisplayContext } from 'common/shop/display-config'

const MAX_FILLS_TO_SHOW = 10

const isNormalLimitOrder = (bet: Bet) =>
  bet.limitProb !== undefined && bet.orderAmount !== undefined && !bet.silent

function BetTooltipContent(props: {
  bet: Bet
  isCashContract: boolean
  contract: MarketContract
}) {
  const { bet, isCashContract, contract } = props
  const formatAmount = isCashContract ? formatSweepies : formatMoney
  const answer =
    contract.mechanism === 'cpmm-multi-1'
      ? contract.answers?.find((a) => a.id === bet.answerId)
      : undefined
  const isLimitOrder = isNormalLimitOrder(bet)
  const isOrderSale = (bet.orderAmount ?? 0) < 0
  const isAmountSale = bet.amount < 0
  const amountLabelBase = isLimitOrder ? 'Amount filled' : 'Amount'
  const amountLabel = isAmountSale ? `${amountLabelBase} sold` : amountLabelBase

  // Get bet IDs from fills that matched against user bets, sorted most recent first
  const sortedFills = [...(bet.fills ?? [])].sort(
    (a, b) => b.timestamp - a.timestamp
  )
  const fillsToShow = sortedFills.slice(0, MAX_FILLS_TO_SHOW)
  const matchedBetIds = fillsToShow
    .map((f) => f.matchedBetId)
    .filter((id): id is string => id !== null)

  // Fetch bettor info for matched bets
  const [bettorsByBetId, setBettorsByBetId] = useState<
    Record<string, { id: string; username: string; name: string }>
  >({})
  const [loading, setLoading] = useState(matchedBetIds.length > 0)

  useEffect(() => {
    if (matchedBetIds.length === 0) {
      setLoading(false)
      return
    }

    api('get-bettors-from-bet-ids', { betIds: matchedBetIds })
      .then((result) => {
        setBettorsByBetId(result)
      })
      .catch((err) => {
        console.error('Failed to fetch bettors:', err)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [bet.id])

  const totalFills = bet.fills?.length ?? 0

  const renderFillLine = (f: fill, displayIndex: number) => {
    // Number fills from most recent (total) down to oldest
    const fillNumber = totalFills - displayIndex
    const fillDate = dayjs(f.timestamp)
    const isToday = fillDate.isSame(dayjs(), 'day')
    const fillTime = isToday
      ? fillDate.format('h:mm:ss A')
      : fillDate.format('MMM D, h:mm:ss A')
    const bettor = f.matchedBetId ? bettorsByBetId[f.matchedBetId] : null
    const matchInfo = bettor
      ? `@${bettor.username}`
      : f.matchedBetId
      ? loading
        ? '...'
        : 'user'
      : 'pool'

    return (
      <div key={displayIndex} className="ml-2">
        {fillNumber}. {formatAmount(Math.abs(f.amount))} @ {fillTime} (
        {matchInfo})
      </div>
    )
  }

  return (
    <div className="text-left">
      {bet.orderAmount !== undefined && (
        <div>
          Order: {isOrderSale ? 'Sell ' : ''}
          {formatAmount(Math.abs(bet.orderAmount))}{' '}
          <OutcomeLabel
            pseudonym={getPseudonym(contract)}
            outcome={bet.outcome}
            answer={answer}
            contract={contract}
            truncate="short"
          />
        </div>
      )}
      <div>
        {amountLabel}: {formatAmount(Math.abs(bet.amount))}
      </div>
      {bet.limitProb !== undefined && (
        <div>Limit: {formatPercent(bet.limitProb)}</div>
      )}
      <div>
        {isLimitOrder ? 'Shares filled' : 'Shares'}:{' '}
        {Math.abs(bet.shares).toFixed(2)}
      </div>
      <div>Time: {dayjs(bet.createdTime).format('MMM D, YYYY h:mm:ss A')}</div>

      {bet.fills && bet.fills.length > 0 && (
        <>
          <div>Fills: {bet.fills.length}</div>
          {fillsToShow.map((fill, i) => renderFillLine(fill, i))}
          {bet.fills.length > MAX_FILLS_TO_SHOW && (
            <div className="ml-2">
              ... and {bet.fills.length - MAX_FILLS_TO_SHOW} more
            </div>
          )}
        </>
      )}

      {bet.isCancelled && <div>Status: Cancelled</div>}
      {bet.isFilled && <div>Status: Filled</div>}
      {bet.expiresAt && (
        <div>
          Expires: {dayjs(bet.expiresAt).format('MMM D, h:mm A')}
          {bet.expiresAt < Date.now() ? ' (expired)' : ''}
        </div>
      )}
    </div>
  )
}

function BetUserLink(props: {
  userId: string
  user: DisplayUser | null | undefined
  className?: string
}) {
  const { userId, user, className } = props

  return (
    <UserHovercard userId={userId}>
      <UserLink
        user={user}
        className={clsx('text-ink-900 text-sm font-semibold', className)}
      />
    </UserHovercard>
  )
}

// Compact action text (e.g., "bought M$100 YES")
function BetActionText(props: { bet: Bet; contract: Contract }) {
  const { bet, contract } = props
  const { amount, outcome, answerId } = bet
  const isCashContract = contract.token === 'CASH'
  const isLimitOrder = isNormalLimitOrder(bet)
  const anyFilled = !floatingLesserEqual(amount, 0)

  const bought = amount >= 0 ? 'bought' : 'sold'
  const absAmount = Math.abs(amount)
  const money = (
    <span className="font-semibold">
      <MoneyDisplay amount={absAmount} isCashContract={isCashContract} />
    </span>
  )
  const orderAmount =
    bet.limitProb !== undefined && bet.orderAmount !== undefined ? (
      <span className="font-semibold">
        <MoneyDisplay
          amount={bet.orderAmount}
          isCashContract={isCashContract}
        />
      </span>
    ) : null

  const answer =
    contract.mechanism === 'cpmm-multi-1'
      ? contract.answers?.find((a) => a.id === answerId)
      : undefined

  return (
    <span className="text-ink-700 text-sm">
      {isLimitOrder ? (
        anyFilled ? (
          <>
            <span className="text-ink-500">filled</span> {money}/{orderAmount}{' '}
          </>
        ) : (
          <>
            <span className="text-ink-500">limit</span> {orderAmount}{' '}
          </>
        )
      ) : (
        <>
          <span className="text-ink-500">{bought}</span> {money}{' '}
        </>
      )}
      <OutcomeLabel
        pseudonym={getPseudonym(contract)}
        outcome={outcome}
        answer={answer}
        contract={contract}
        truncate="short"
      />
    </span>
  )
}

// Details line (price info)
function BetDetailsText(props: { bet: Bet; contract: Contract }) {
  const { bet, contract } = props
  const { outcome, isApi } = bet
  const isLimitOrder = isNormalLimitOrder(bet)
  const cancelledOrExpired =
    bet.isCancelled ||
    (bet.expiresAt && bet.expiresAt < Date.now() && !bet.silent)
  const allFilled = floatingEqual(bet.amount, bet.orderAmount ?? bet.amount)

  const getProb = (prob: number) =>
    !isBinaryMulti(contract) ? prob : getBinaryMCProb(prob, outcome)

  const probBefore = getProb(bet.probBefore)
  const probAfter = getProb(bet.probAfter)
  const limitProb =
    bet.limitProb === undefined || !isBinaryMulti(contract)
      ? bet.limitProb
      : getBinaryMCProb(bet.limitProb, outcome)
  const hadPoolMatch = bet.fills?.length ?? false

  const fromProb = hadPoolMatch
    ? getFormattedMappedValue(contract, probBefore)
    : getFormattedMappedValue(contract, limitProb ?? probBefore)
  const toProb = hadPoolMatch
    ? getFormattedMappedValue(contract, probAfter)
    : getFormattedMappedValue(contract, limitProb ?? probAfter)

  return (
    <span className="text-ink-500">
      {isLimitOrder ? (
        <>
          <span className="text-ink-700 font-medium">{toProb}</span>
          {cancelledOrExpired && !allFilled && (
            <span className="text-ink-400 ml-1">(cancelled)</span>
          )}
        </>
      ) : fromProb === toProb ? (
        <span className="text-ink-700 font-medium">{fromProb}</span>
      ) : (
        <>
          <span className="text-ink-600">{fromProb}</span>
          <span className="text-ink-400 mx-0.5">→</span>
          <span className="text-ink-900 font-semibold">{toProb}</span>
        </>
      )}
      {isApi && (
        <InfoTooltip text="Placed via the API" className="ml-1">
          🤖
        </InfoTooltip>
      )}
    </span>
  )
}

export const FeedBet = memo(function FeedBet(props: {
  contract: MarketContract
  bet: Bet
  avatarSize?: AvatarSizeType
  className?: string
  onReply?: (bet: Bet) => void
  hideActions?: boolean
  displayContext?: DisplayContext
}) {
  const {
    contract,
    bet,
    avatarSize,
    className,
    onReply,
    hideActions,
    displayContext = 'activity',
  } = props
  const { createdTime, userId } = bet
  const user = useDisplayUserById(userId)
  const showUser = dayjs(createdTime).isAfter('2022-06-01')
  const isCashContract = contract.token === 'CASH'

  return (
    <div
      className={clsx(
        'group/trade bg-canvas-0 hover:bg-canvas-50 border-ink-200 w-full rounded-lg border px-3 py-2.5 transition-colors sm:px-4 sm:py-3',
        className
      )}
    >
      <Row className="items-start justify-between gap-2">
        <Row className="min-w-0 flex-1 items-start gap-2.5 sm:gap-3">
          {showUser ? (
            <UserHovercard userId={userId}>
              <Avatar
                size={avatarSize ?? 'sm'}
                avatarUrl={user?.avatarUrl}
                username={user?.username}
                entitlements={user?.entitlements}
                displayContext={displayContext}
                className="mt-0.5 shrink-0"
              />
            </UserHovercard>
          ) : (
            <EmptyAvatar className="mt-0.5 shrink-0" size={8} />
          )}
          <Col className="min-w-0 flex-1 gap-0.5">
            <Row className="flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              {showUser && (
                <BetUserLink userId={userId} user={user} className="shrink-0" />
              )}
              <Tooltip
                text={
                  <BetTooltipContent
                    bet={bet}
                    isCashContract={isCashContract}
                    contract={contract}
                  />
                }
                placement="top"
              >
                <BetActionText bet={bet} contract={contract} />
              </Tooltip>
            </Row>
            <Row className="text-ink-500 flex-wrap items-center gap-x-2 text-xs">
              <BetDetailsText bet={bet} contract={contract} />
              <RelativeTimestamp
                time={createdTime}
                shortened={true}
                className="text-ink-400"
              />
            </Row>
          </Col>
        </Row>
        {!hideActions && (
          <BetActions onReply={onReply} bet={bet} contract={contract} />
        )}
      </Row>
    </div>
  )
})

export const FeedBetWithGraphAction = memo(
  function FeedBetWithGraphAction(props: {
    contract: MarketContract
    bet: Bet
    avatarSize?: AvatarSizeType
    className?: string
    onReply?: (bet: Bet) => void
    setGraphUser: (user: DisplayUser | undefined) => void
    setHideGraph?: (hide: boolean) => void
  }) {
    const {
      contract,
      bet,
      avatarSize,
      className,
      onReply,
      setGraphUser,
      setHideGraph,
    } = props
    const { createdTime, userId } = bet
    const user = useDisplayUserById(userId)
    const showUser = dayjs(createdTime).isAfter('2022-06-01')
    const isCashContract = contract.token === 'CASH'

    return (
      <div
        className={clsx(
          'group/trade bg-canvas-0 hover:bg-canvas-50 border-ink-200 w-full rounded-lg border px-3 py-2.5 transition-colors sm:px-4 sm:py-3',
          className
        )}
      >
        <Row className="items-start justify-between gap-2">
          <Row className="min-w-0 flex-1 items-start gap-2.5 sm:gap-3">
            {showUser ? (
              <UserHovercard userId={userId}>
                <Avatar
                  size={avatarSize ?? 'sm'}
                  avatarUrl={user?.avatarUrl}
                  username={user?.username}
                  entitlements={user?.entitlements}
                  displayContext="feed"
                  className="mt-0.5 shrink-0"
                />
              </UserHovercard>
            ) : (
              <EmptyAvatar className="mt-0.5 shrink-0" size={8} />
            )}
            <Col className="min-w-0 flex-1 gap-0.5">
              <Row className="flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                {showUser && (
                  <BetUserLink
                    userId={userId}
                    user={user}
                    className="shrink-0"
                  />
                )}
                <Tooltip
                  text={
                    <BetTooltipContent
                      bet={bet}
                      isCashContract={isCashContract}
                      contract={contract}
                    />
                  }
                  placement="top"
                >
                  <BetActionText bet={bet} contract={contract} />
                </Tooltip>
              </Row>
              <Row className="text-ink-500 flex-wrap items-center gap-x-2 text-xs">
                <BetDetailsText bet={bet} contract={contract} />
                <RelativeTimestamp
                  time={createdTime}
                  shortened={true}
                  className="text-ink-400"
                />
              </Row>
            </Col>
          </Row>
          <BetActionsWithGraph
            onReply={onReply}
            bet={bet}
            contract={contract}
            user={user}
            setGraphUser={setGraphUser}
            setHideGraph={setHideGraph}
          />
        </Row>
      </div>
    )
  }
)

export const FeedReplyBet = memo(function FeedReplyBet(props: {
  contract: MarketContract
  bets: Bet[]
  avatarSize?: AvatarSizeType
  className?: string
  onReply?: (bet: Bet) => void
}) {
  const { contract, bets, avatarSize, className } = props
  const showUser = bets.every((b) => dayjs(b.createdTime).isAfter('2022-06-01'))
  const isCashContract = contract.token === 'CASH'

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
              entitlements={users[0]?.entitlements}
              displayContext="feed"
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
            <>
              {showUser && (
                <BetUserLink userId={bets[0].userId} user={users?.[0]} />
              )}
              <Tooltip
                text={
                  <BetTooltipContent
                    bet={bets[0]}
                    isCashContract={isCashContract}
                    contract={contract}
                  />
                }
                placement="top"
                className="flex-1"
              >
                <BetStatusText
                  bet={bets[0]}
                  contract={contract}
                  hideUser={!showUser}
                  omitUser={showUser}
                />
              </Tooltip>
            </>
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
            <UserLink
              user={user}
              className={'font-semibold'}
              displayContext="feed"
            />
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
  omitUser?: boolean
  className?: string
  inTimeline?: boolean
}) {
  const { bet, contract, hideUser, omitUser, className, inTimeline } = props
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
        omitUser ? (
          <></>
        ) : !hideUser ? (
          <UserHovercard userId={bet.userId}>
            <UserLink
              user={betUser}
              className={'font-semibold'}
              displayContext="feed"
            />
          </UserHovercard>
        ) : (
          <span>{self?.id === bet.userId ? 'You' : `A ${BETTOR}`}</span>
        )
      ) : (
        <></>
      )}{' '}
      {isNormalLimitOrder(bet) ? (
        <span>
          {anyFilled ? (
            <>
              filled limit order {money}/{orderAmount}
            </>
          ) : (
            <>created limit order for {orderAmount}</>
          )}{' '}
          <OutcomeLabel
            pseudonym={getPseudonym(contract)}
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
            pseudonym={getPseudonym(contract)}
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
  contract: MarketContract
}) {
  const { onReply, bet, contract } = props
  const user = useUser()
  const [isSharing, setIsSharing] = useState(false)
  const bettor = useDisplayUserById(bet.userId)

  return (
    <Row className="shrink-0 items-center gap-0.5 sm:gap-1">
      {user && (
        <RepostButton
          bet={bet}
          size={'2xs'}
          className="text-ink-400 hover:text-ink-600 hover:bg-ink-100 !p-1.5 transition-colors"
          playContract={contract}
        />
      )}
      <Tooltip text="Share" placement="top">
        <button
          className="text-ink-400 hover:text-ink-600 hover:bg-ink-100 rounded-md p-1.5 transition-colors"
          onClick={() => setIsSharing(true)}
        >
          <LuShare2 className="h-4 w-4" />
        </button>
      </Tooltip>
      {onReply && (
        <Tooltip text={`Reply to this ${TRADE_TERM}`} placement="top">
          <button
            className="text-ink-400 hover:text-ink-600 hover:bg-ink-100 rounded-md p-1.5 transition-colors"
            onClick={() => {
              onReply(bet)
              track(`reply to ${TRADE_TERM}`, {
                slug: contract.slug,
                amount: bet.amount,
              })
            }}
          >
            <LuReply className="h-4 w-4" />
          </button>
        </Tooltip>
      )}

      {isSharing && bettor && (
        <ShareBetModal
          open={isSharing}
          setOpen={setIsSharing}
          questionText={contract.question}
          outcome={formatOutcomeLabel(contract, bet.outcome as 'YES' | 'NO')}
          answer={
            contract.mechanism === 'cpmm-multi-1'
              ? contract.answers?.find((a) => a.id === bet.answerId)?.text
              : undefined
          }
          avgPrice={
            bet.limitProb !== undefined
              ? formatPercent(bet.limitProb)
              : formatPercent(
                  bet.outcome === 'YES'
                    ? bet.amount / bet.shares
                    : 1 - bet.amount / bet.shares
                )
          }
          betAmount={bet.amount}
          winAmount={
            bet.limitProb !== undefined && bet.orderAmount !== undefined
              ? bet.outcome === 'YES'
                ? bet.orderAmount / bet.limitProb
                : bet.orderAmount / (1 - bet.limitProb)
              : bet.shares
          }
          bettor={{
            id: bettor.id,
            name: bettor.name,
            username: bettor.username,
            avatarUrl: bettor.avatarUrl,
          }}
          isLimitBet={bet.limitProb !== undefined}
          orderAmount={bet.orderAmount}
        />
      )}
    </Row>
  )
}

function BetActionsWithGraph(props: {
  onReply?: (bet: Bet) => void
  bet: Bet
  contract: MarketContract
  user: DisplayUser | null | undefined
  setGraphUser: (user: DisplayUser | undefined) => void
  setHideGraph?: (hide: boolean) => void
}) {
  const {
    onReply,
    bet,
    contract,
    user: bettor,
    setGraphUser,
    setHideGraph,
  } = props
  const currentUser = useUser()
  const [isSharing, setIsSharing] = useState(false)

  const handleGraphTrades = () => {
    if (!bettor) return
    // Show the graph if it's hidden
    setHideGraph?.(false)
    setGraphUser({
      id: bettor.id,
      name: bettor.name,
      username: bettor.username,
      avatarUrl: bettor.avatarUrl ?? '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
    track('graph user trades from bets tab', { userId: bettor.id })
  }

  return (
    <Row className="shrink-0 items-center gap-0.5 sm:gap-1">
      <Tooltip text="Graph trades" placement="top">
        <button
          className="text-ink-400 hover:text-primary-600 hover:bg-primary-100 disabled:text-ink-300 rounded-md p-1.5 transition-colors disabled:cursor-not-allowed"
          onClick={handleGraphTrades}
          disabled={!bettor}
        >
          <LuLineChart className="h-4 w-4" />
        </button>
      </Tooltip>
      <Tooltip text="Share" placement="top">
        <button
          className="text-ink-400 hover:text-ink-600 hover:bg-ink-100 rounded-md p-1.5 transition-colors"
          onClick={() => setIsSharing(true)}
        >
          <LuShare2 className="h-4 w-4" />
        </button>
      </Tooltip>
      {onReply && (
        <Tooltip text={`Reply to this ${TRADE_TERM}`} placement="top">
          <button
            className="text-ink-400 hover:text-ink-600 hover:bg-ink-100 rounded-md p-1.5 transition-colors"
            onClick={() => {
              onReply(bet)
              track(`reply to ${TRADE_TERM}`, {
                slug: contract.slug,
                amount: bet.amount,
              })
            }}
          >
            <LuReply className="h-4 w-4" />
          </button>
        </Tooltip>
      )}

      {isSharing && bettor && (
        <ShareBetModal
          open={isSharing}
          setOpen={setIsSharing}
          questionText={contract.question}
          outcome={formatOutcomeLabel(contract, bet.outcome as 'YES' | 'NO')}
          answer={
            contract.mechanism === 'cpmm-multi-1'
              ? contract.answers?.find((a) => a.id === bet.answerId)?.text
              : undefined
          }
          avgPrice={
            bet.limitProb !== undefined
              ? formatPercent(bet.limitProb)
              : formatPercent(
                  bet.outcome === 'YES'
                    ? bet.amount / bet.shares
                    : 1 - bet.amount / bet.shares
                )
          }
          betAmount={bet.amount}
          winAmount={
            bet.limitProb !== undefined && bet.orderAmount !== undefined
              ? bet.outcome === 'YES'
                ? bet.orderAmount / bet.limitProb
                : bet.orderAmount / (1 - bet.limitProb)
              : bet.shares
          }
          bettor={{
            id: bettor.id,
            name: bettor.name,
            username: bettor.username,
            avatarUrl: bettor.avatarUrl,
          }}
          isLimitBet={bet.limitProb !== undefined}
          orderAmount={bet.orderAmount}
        />
      )}
    </Row>
  )
}
