import { memo, useMemo } from 'react'
import { LimitBet } from 'common/bet'
import {
  BinaryContract,
  CPMMMultiContract,
  Contract,
  PseudoNumericContract,
  StonkContract,
  isBinaryMulti,
} from 'common/contract'
import { getDisplayProbability } from 'common/calculate'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { sortBy } from 'lodash'
import { DepthChart } from 'web/components/charts/contract/depth-chart'
import { OrderBookPanel, YourOrders } from 'web/components/bet/order-book'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { SizedContainer } from 'web/components/sized-container'
import { MoneyDisplay } from 'web/components/bet/money-display'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'
import { useUser } from 'web/hooks/use-user'
import { useDisplayUserById } from 'web/hooks/use-user-supabase'
import { formatPercent } from 'common/util/format'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'

export const OpenOrdersTabContent = memo(function OpenOrdersTabContent(props: {
  contract: Contract
  unfilledBets: LimitBet[]
}) {
  const { contract, unfilledBets } = props
  const user = useUser()

  const activeBets = useMemo(
    () =>
      unfilledBets.filter(
        (b) => (!b.expiresAt || b.expiresAt > Date.now()) && !b.silent
      ),
    [unfilledBets]
  )

  const yourBets = useMemo(
    () =>
      sortBy(
        activeBets.filter((b) => b.userId === user?.id),
        (b) => -b.limitProb,
        (b) => -b.createdTime
      ),
    [activeBets, user?.id]
  )

  const yesBets = useMemo(
    () =>
      sortBy(
        activeBets.filter((b) => b.outcome === 'YES'),
        (b) => -1 * b.limitProb,
        (b) => b.createdTime
      ),
    [activeBets]
  )

  const noBets = useMemo(
    () =>
      sortBy(
        activeBets.filter((b) => b.outcome === 'NO'),
        (b) => b.limitProb,
        (b) => b.createdTime
      ),
    [activeBets]
  )

  const currentProb =
    contract.outcomeType === 'BINARY' ||
    contract.outcomeType === 'PSEUDO_NUMERIC' ||
    contract.outcomeType === 'STONK'
      ? getDisplayProbability(
          contract as BinaryContract | PseudoNumericContract | StonkContract
        )
      : 0.5

  const topOrders = useMemo(() => {
    const withRemaining = activeBets.map((b) => ({
      bet: b,
      remaining: b.orderAmount - b.amount,
      distance: Math.abs(b.limitProb - currentProb),
    }))
    // Sort by proximity to current price, then by size descending
    const sorted = sortBy(withRemaining, ['distance', (o) => -o.remaining])
    // Take top 5 orders
    return sorted.slice(0, 5)
  }, [activeBets, currentProb])

  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'
  const isBinaryMC = isBinaryMulti(contract)

  if (activeBets.length === 0) {
    return (
      <Col className="text-ink-500 items-center justify-center py-12">
        <p className="text-lg font-medium">No open orders</p>
        <p className="text-sm">Place a limit order to appear here.</p>
      </Col>
    )
  }

  return (
    <Col className="gap-4">
      {/* Top Orders Near Current Price */}
      {topOrders.length > 0 && (
        <Col className="bg-canvas-0 border-ink-200 overflow-hidden rounded-md border">
          <div className="border-ink-200 border-b px-5 py-3">
            <Row className="items-center gap-2">
              <h3 className="text-ink-900 text-base font-semibold">
                Top Orders
              </h3>
              <InfoTooltip
                text="Largest limit orders closest to the current price"
                className="text-ink-400"
              />
            </Row>
          </div>
          <div className="divide-ink-100 divide-y">
            {topOrders.map(({ bet, remaining }) => (
              <TopOrderRow
                key={bet.id}
                bet={bet}
                remaining={remaining}
                isCashContract={contract.token === 'CASH'}
                isPseudoNumeric={isPseudoNumeric}
                isBinaryMC={isBinaryMC}
                contract={contract}
              />
            ))}
          </div>
        </Col>
      )}

      {/* Full Order Book */}
      <OrderBookPanel contract={contract as any} limitBets={activeBets} />
    </Col>
  )
})

function TopOrderRow(props: {
  bet: LimitBet
  remaining: number
  isCashContract: boolean
  isPseudoNumeric: boolean
  isBinaryMC: boolean
  contract: Contract
}) {
  const {
    bet,
    remaining,
    isCashContract,
    isPseudoNumeric,
    isBinaryMC,
    contract,
  } = props
  const displayUser = useDisplayUserById(bet.userId)

  const probLabel = isPseudoNumeric
    ? getFormattedMappedValue(contract, bet.limitProb)
    : formatPercent(bet.limitProb)

  return (
    <Row className="items-center justify-between px-5 py-2.5">
      <Row className="items-center gap-2">
        <Avatar
          avatarUrl={displayUser?.avatarUrl}
          username={displayUser?.username}
          size="xs"
        />
        <UserLink user={displayUser} className="text-ink-700 text-sm" />
      </Row>
      <Row className="items-center gap-3">
        <span
          className={
            bet.outcome === 'YES'
              ? 'text-primary-700 font-medium'
              : 'text-scarlet-600 font-medium'
          }
        >
          {bet.outcome}
        </span>
        <span className="text-ink-600 text-sm">{probLabel}</span>
        <span className="text-ink-900 text-sm font-semibold">
          <MoneyDisplay amount={remaining} isCashContract={isCashContract} />
        </span>
      </Row>
    </Row>
  )
}
