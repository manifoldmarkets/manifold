import clsx from 'clsx'
import Router from 'next/router'
import {
  BinaryContract,
  CPMMContract,
  CPMMMultiContract,
  Contract,
  MultiNumericContract,
  contractPath,
} from 'common/contract'
import { PollOption } from 'common/poll-option'
import { shortFormatNumber } from 'common/util/format'
import { TbDroplet } from 'react-icons/tb'
import { SimpleAnswerBars } from 'web/components/answers/answers-panel'
import {
  FeedBinaryChart,
  FeedNumericChart,
} from 'web/components/feed/feed-chart'
import { BetButton } from 'web/components/bet/feed-bet-button'
import { RepostButton } from 'web/components/comments/repost-modal'
import { TradesButton } from 'web/components/contract/trades-button'
import { ReactButton } from 'web/components/contract/react-button'
import { ContractStatusLabel } from 'web/components/contract/contracts-table'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { useUser } from 'web/hooks/use-user'
import { useLiveContract } from 'web/hooks/use-contract'
import { useDisplayUserById } from 'web/hooks/use-user-supabase'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'
import { UserHovercard } from 'web/components/user/user-hovercard'
import { Tooltip } from 'web/components/widgets/tooltip'
import {
  PositionsHovercard,
  PositionsData,
} from 'web/components/contract/positions-hovercard'
import { useAllSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { useUnfilledBets } from 'client-common/hooks/use-bets'
import { api } from 'web/lib/api/api'
import { useIsPageVisible } from 'web/hooks/use-page-visible'

type MarketMeta = {
  label: string
  badgeClass: string
}

function marketMeta(outcomeType: string): MarketMeta {
  switch (outcomeType) {
    case 'BINARY':
      return {
        label: 'Yes/No',
        badgeClass:
          'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300',
      }
    case 'MULTIPLE_CHOICE':
      return {
        label: 'Multiple choice',
        badgeClass:
          'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300',
      }
    case 'PSEUDO_NUMERIC':
    case 'NUMBER':
    case 'MULTI_NUMERIC':
    case 'DATE':
      return {
        label: 'Numeric',
        badgeClass:
          'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300',
      }
    case 'POLL':
      return {
        label: 'Poll',
        badgeClass:
          'bg-teal-100 text-teal-700 dark:bg-teal-700 dark:text-teal-100',
      }
    case 'BOUNTIED_QUESTION':
      return {
        label: 'Bounty',
        badgeClass:
          'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300',
      }
    case 'STONK':
      return {
        label: 'Stock',
        badgeClass:
          'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300',
      }
    default:
      return { label: 'Market', badgeClass: 'bg-ink-100 text-ink-500' }
  }
}

function statusLabel(contract: Contract): string | null {
  if (contract.resolution) return 'Resolved'
  if (contract.closeTime && contract.closeTime < Date.now()) return 'Closed'
  return null
}

export function DashboardMarketCard({
  contract: initialContract,
  trackingLocation = 'dashboard',
}: {
  contract: Contract
  trackingLocation?: string
}) {
  const contract = useLiveContract(initialContract)
  const user = useUser()
  const allMetrics = useAllSavedContractMetrics(contract)
  const allLimitBets = useUnfilledBets(
    contract.id,
    (params) => api('bets', params),
    useIsPageVisible,
    { enabled: !contract.resolution && !!user }
  )
  const creator = useDisplayUserById(contract.creatorId)
  const meta = marketMeta(contract.outcomeType)
  const isBinary = contract.outcomeType === 'BINARY'
  const isMulti = contract.outcomeType === 'MULTIPLE_CHOICE'
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'
  const isNumericBuckets =
    contract.outcomeType === 'NUMBER' ||
    contract.outcomeType === 'MULTI_NUMERIC' ||
    contract.outcomeType === 'DATE'
  const isMultiNumericChart =
    contract.outcomeType === 'MULTI_NUMERIC' || contract.outcomeType === 'DATE'
  const isPoll = contract.outcomeType === 'POLL'

  const cpmmContract = isBinary ? (contract as CPMMContract) : null
  const binaryContract = isBinary ? (contract as BinaryContract) : null
  const multiContract = isMulti ? (contract as CPMMMultiContract) : null
  const pollOptions = isPoll
    ? (contract as { options?: PollOption[] }).options
    : undefined

  const binaryProb = cpmmContract ? Math.round(cpmmContract.prob * 100) : null
  const resolved = !!contract.resolution
  const liquidity =
    'totalLiquidity' in contract
      ? (contract as CPMMContract).totalLiquidity ?? 0
      : 0
  const status = statusLabel(contract)
  const contractUrl = contractPath(contract)

  const myLimitBets = (allLimitBets ?? []).filter((b) => b.userId === user?.id)
  let positions: PositionsData['positions'] = []
  let limitOrders: PositionsData['limitOrders'] = []
  let numericSummary: PositionsData['numericSummary']
  if (!resolved && user && allMetrics) {
    if (isBinary || isPseudoNumeric) {
      const m = allMetrics.find((m) => m.answerId === null)
      if (m?.hasShares) {
        positions = [
          {
            name: m.maxSharesOutcome === 'NO' ? 'No' : 'Yes',
            amount: m.invested,
            profit: m.profit,
          },
        ]
      }
      limitOrders = myLimitBets
        .filter((b) => b.answerId == null)
        .map((b) => ({
          name: b.outcome === 'NO' ? 'No' : 'Yes',
          prob: Math.round(b.limitProb * 100),
          amount: b.orderAmount - b.amount,
        }))
    } else if (isMulti) {
      positions = allMetrics
        .filter((m) => m.answerId !== null && m.hasShares)
        .map((m) => ({
          name:
            multiContract?.answers.find((a) => a.id === m.answerId)?.text ??
            'Answer',
          amount: m.invested,
          profit: m.profit,
        }))
      limitOrders = myLimitBets
        .filter((b) => b.answerId != null)
        .map((b) => ({
          name:
            multiContract?.answers.find((a) => a.id === b.answerId)?.text ??
            'Answer',
          prob: Math.round(b.limitProb * 100),
          amount: b.orderAmount - b.amount,
        }))
    } else if (isNumericBuckets) {
      const bucketMetrics = allMetrics.filter(
        (m) => m.answerId !== null && m.hasShares
      )
      const numericOrders = myLimitBets.filter((b) => b.answerId != null)
      if (bucketMetrics.length > 0 || numericOrders.length > 0) {
        numericSummary = {
          total: bucketMetrics.reduce((sum, m) => sum + m.invested, 0),
          buckets: bucketMetrics.length,
          profit: bucketMetrics.reduce((sum, m) => sum + m.profit, 0),
          ...(numericOrders.length > 0 && {
            orders: {
              total: numericOrders.reduce(
                (sum, b) => sum + b.orderAmount - b.amount,
                0
              ),
              count: numericOrders.length,
            },
          }),
        }
      }
    }
  }
  const userData: PositionsData = { positions, limitOrders, numericSummary }
  const hasPositions =
    userData.positions.length > 0 || !!userData.numericSummary
  const hasOrders =
    userData.limitOrders.length > 0 || !!userData.numericSummary?.orders
  const hasAny = hasPositions || hasOrders

  return (
    <div
      className="bg-canvas-50 border-ink-200 hover:border-primary-300 flex h-[340px] cursor-pointer flex-col rounded-xl border transition-colors"
      onClick={() => Router.push(contractUrl)}
    >
      {/* Creator row + type badge */}
      <Row className="items-center gap-2 px-5 pt-5">
        <UserHovercard userId={contract.creatorId} className="min-w-0 flex-1">
          <Row
            className="text-ink-500 items-center gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <Avatar
              size="xs"
              avatarUrl={creator?.avatarUrl ?? contract.creatorAvatarUrl}
              username={creator?.username ?? contract.creatorUsername}
              entitlements={creator?.entitlements}
              displayContext="feed"
            />
            <span className="min-w-0 truncate text-xs">
              <UserLink
                user={{
                  id: contract.creatorId,
                  name: creator?.name ?? contract.creatorName,
                  username: creator?.username ?? contract.creatorUsername,
                  entitlements: creator?.entitlements,
                }}
                displayContext="feed"
                className="text-xs"
              />
            </span>
          </Row>
        </UserHovercard>
        {status && (
          <span className="text-ink-900 shrink-0 text-[11px] font-medium">
            {status}
          </span>
        )}
        <span
          className={clsx(
            'shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium',
            meta.badgeClass
          )}
        >
          {meta.label}
        </span>
      </Row>

      {/* Question title */}
      <div className="px-5 pt-3">
        <p className="text-ink-900 line-clamp-2 text-lg font-semibold leading-snug">
          {contract.question}
        </p>
      </div>

      {/* Market-type content */}
      <div className="min-h-0 flex-1 overflow-hidden px-5 pb-2 pt-4">
        {isBinary && cpmmContract && binaryContract && (
          <Col className="h-full gap-0">
            {contract.uniqueBettorCount === 0 && <div className="flex-1" />}
            <Row className="items-center justify-between pb-2">
              {resolved ? (
                <ContractStatusLabel
                  contract={contract}
                  className="text-2xl font-bold"
                />
              ) : (
                <>
                  <Row className="items-baseline gap-1.5">
                    <span className="text-ink-900 text-2xl font-bold leading-[2rem]">
                      {binaryProb}%
                    </span>
                    <span className="text-ink-400 text-[11px]">chance</span>
                  </Row>
                  <div className="-mt-3" onClick={(e) => e.stopPropagation()}>
                    <BetButton
                      contract={binaryContract}
                      user={user}
                      labels={{ yes: 'Yes', no: 'No' }}
                    />
                  </div>
                </>
              )}
            </Row>
            {contract.uniqueBettorCount > 0 ? (
              <div className="mt-auto">
                <FeedBinaryChart
                  contract={binaryContract}
                  className="h-[120px] w-full"
                  startDate={contract.createdTime}
                />
              </div>
            ) : (
              <div className="flex-[3]" />
            )}
          </Col>
        )}

        {multiContract && (
          <div onClick={(e) => e.stopPropagation()}>
            <SimpleAnswerBars contract={multiContract} maxAnswers={3} />
          </div>
        )}

        {isNumericBuckets && (
          <Col className="h-full gap-0">
            {!(isMultiNumericChart && contract.uniqueBettorCount > 0) && (
              <div className="flex-1" />
            )}
            <Row className="items-baseline gap-1.5 pb-2">
              <ContractStatusLabel
                contract={contract}
                className="text-ink-900 text-2xl font-bold"
              />
              <span className="text-ink-400 text-xs">
                {resolved ? 'resolved value' : 'expected value'}
              </span>
            </Row>
            {isMultiNumericChart && contract.uniqueBettorCount > 0 ? (
              <FeedNumericChart
                contract={contract as MultiNumericContract}
                className="min-h-0 flex-1"
              />
            ) : (
              <div className="flex-[3]" />
            )}
          </Col>
        )}

        {isPseudoNumeric && (
          <ContractStatusLabel
            contract={contract}
            className="text-ink-900 text-2xl font-bold"
          />
        )}

        {isPoll && pollOptions && pollOptions.length > 0 && (
          <Col className="gap-1.5">
            {pollOptions.slice(0, 5).map((o) => (
              <Row key={o.id} className="items-center gap-2">
                <div className="bg-ink-300 h-1.5 w-1.5 shrink-0 rounded-full" />
                <span className="text-ink-600 truncate text-sm leading-tight">
                  {o.text}
                </span>
              </Row>
            ))}
            {pollOptions.length > 5 && (
              <span className="text-ink-400 text-[11px]">
                +{pollOptions.length - 5} more
              </span>
            )}
          </Col>
        )}
      </div>

      {/* Footer */}
      <Row
        className="border-ink-200 items-center justify-between border-t px-5 py-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <Row className="items-center gap-3">
          <TradesButton contract={contract} size="sm" />
          {liquidity > 0 && (
            <Row className="text-ink-500 items-center gap-1">
              <TbDroplet className="h-4 w-4 stroke-2" />
              <span className="text-ink-600 text-[13px]">
                {shortFormatNumber(liquidity)}
              </span>
            </Row>
          )}
          <RepostButton
            playContract={contract}
            size="2xs"
            iconClassName="text-ink-500"
          />
          <ReactButton
            contentId={contract.id}
            contentCreatorId={contract.creatorId}
            user={user}
            contentType="contract"
            contentText={contract.question}
            size="2xs"
            trackingLocation={trackingLocation}
            placement="top"
            contractId={contract.id}
            heartClassName="stroke-ink-500"
          />
        </Row>
        {hasAny && (
          <Tooltip
            text={<PositionsHovercard {...userData} />}
            placement="top-end"
            hasSafePolygon
            tooltipClassName="!bg-canvas-20 border-ink-200 border shadow-lg !text-left !max-w-none !px-3 !py-2.5 !rounded-lg"
          >
            <div className="border-ink-400 text-ink-500 hover:border-ink-600 hover:text-ink-700 flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition-colors">
              {hasPositions && (
                <span className="bg-ink-400 h-1.5 w-1.5 rounded-full" />
              )}
              {hasOrders && (
                <span className="border-ink-500 h-1.5 w-1.5 rounded-full border" />
              )}
              <span>Positions</span>
            </div>
          </Tooltip>
        )}
      </Row>
    </div>
  )
}
