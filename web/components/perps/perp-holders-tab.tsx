import { ChevronDownIcon } from '@heroicons/react/solid'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import clsx from 'clsx'
import { orderBy, sumBy } from 'lodash'
import { useEffect } from 'react'
import { PerpContract } from 'common/contract'
import { getUserFacingPnl } from 'common/perps/pnl'
import { PerpPosition } from 'common/perps/position'
import { formatPrice, inferPriceDecimals } from 'common/perps/format'
import {
  fundingPeriodUnit,
  getFundingPeriodMs,
  getPerpFundingRate,
} from 'common/perps/funding'
import { formatMoney, formatMoneyShort } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import generateFilterDropdownItems from 'web/components/search/search-dropdown-helpers'
import DropdownMenu from 'web/components/widgets/dropdown-menu'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Tooltip } from 'web/components/widgets/tooltip'
import { UserAvatarAndBadge } from 'web/components/widgets/user-link'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useUser } from 'web/hooks/use-user'
import { useLivePerpContract } from './use-live-perp-contract'
import { PerpPositionRow, usePerpPositions } from './use-perp-positions'

type Holder = PerpPositionRow

type SortKey = 'profit' | 'exposure' | 'margin' | 'leverage' | 'liquidation'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'profit', label: 'Profit' },
  { key: 'exposure', label: 'Exposure' },
  { key: 'margin', label: 'Margin' },
  { key: 'leverage', label: 'Leverage' },
  { key: 'liquidation', label: 'Closest to liq' },
]

export const PerpHoldersTab = (props: {
  contract: PerpContract
  setTotalHolders?: (n: number) => void
}) => {
  const { setTotalHolders } = props
  // Tabs mount with the SSR contract, outside PerpOverview's live overlay —
  // poll here too so mark price / PnL / positions track the market instead
  // of freezing at page-load values (they used to fetch exactly once).
  const { contract } = useLivePerpContract(props.contract)
  const { positions: holders, unsound } = usePerpPositions(contract.id)
  const [sortKey, setSortKey] = usePersistentInMemoryState<SortKey>(
    'profit',
    `perp-holders-sort-${contract.id}`
  )

  useEffect(() => {
    if (holders) setTotalHolders?.(holders.length)
  }, [holders, setTotalHolders])

  // Hoisted out of HolderRow: one resize listener for the tab, not one per row.
  const isMobile = useIsMobile(800)

  if (!holders) return <LoadingIndicator />
  if (holders.length === 0)
    return (
      <div className="text-ink-500 p-4 text-sm">
        No open positions yet. Be the first!
      </div>
    )

  const price = Number(contract.oraclePrice)
  const priceDecimals = inferPriceDecimals([
    price,
    ...holders.map((h) => h.entryPrice),
    ...holders.map((h) => h.liquidationPrice),
  ])

  const longs = holders.filter((h) => h.direction === 'long')
  const shorts = holders.filter((h) => h.direction === 'short')

  // `size` is the position's notional (q = margin × leverage), so summing it
  // per side is the market's open interest — the same quantity funding is
  // now derived from. Computed from the rows on screen rather than the
  // contract's denormalized copy so the header always agrees with the list.
  //
  // Rows that failed row-level sanity are excluded from the LIST (nothing can
  // safely render them) but must still count toward these SUMS:
  // getPerpOpenInterest sums every row with size > 0 regardless of soundness,
  // so dropping them here would silently understate open interest and could
  // flip the summary to "longs only, so no funding is flowing" on a market
  // that does have shorts.
  const exposure = [...holders, ...unsound.filter((h) => h.size > 0)]
  const longNotional = sumBy(
    exposure.filter((h) => h.direction === 'long'),
    (h) => h.size
  )
  const shortNotional = sumBy(
    exposure.filter((h) => h.direction === 'short'),
    (h) => h.size
  )

  // Sorters are descending "most interesting first" except liquidation
  // distance, where the nearest position is the interesting one.
  const sortValue = (h: Holder) => {
    switch (sortKey) {
      case 'exposure':
        return h.size
      case 'margin':
        return h.originalCostBasis
      case 'leverage':
        return h.leverage
      case 'liquidation':
        // Ratio, not absolute gap, so the ordering is price-scale free.
        // Non-finite liq prices (a position that cannot be liquidated at any
        // reachable price) sort last rather than poisoning the comparison.
        return Number.isFinite(h.liquidationPrice) && price > 0
          ? -Math.abs(price - h.liquidationPrice) / price
          : -Infinity
      case 'profit':
      default:
        return getUserFacingPnlForHolder(h, price, contract.id)
    }
  }
  const sortHolders = (hs: Holder[]) => orderBy(hs, sortValue, 'desc')

  return (
    <Col className="gap-3">
      <PerpHoldersSummary
        contract={contract}
        longNotional={longNotional}
        shortNotional={shortNotional}
        longMargin={sumBy(longs, (h) => h.originalCostBasis)}
        shortMargin={sumBy(shorts, (h) => h.originalCostBasis)}
        longCount={longs.length}
        shortCount={shorts.length}
      />

      <Row className="items-center gap-1.5">
        <span className="text-ink-500 text-xs font-medium uppercase tracking-wide">
          Sort by
        </span>
        <DropdownMenu
          items={generateFilterDropdownItems(
            SORT_OPTIONS.map((o) => ({ label: o.label, value: o.key })),
            (value: string) => setSortKey(value as SortKey)
          )}
          buttonContent={
            <Row className="text-ink-900 items-center gap-1 text-sm font-medium">
              <span className="whitespace-nowrap">
                {SORT_OPTIONS.find((o) => o.key === sortKey)?.label ?? 'Profit'}
              </span>
              <ChevronDownIcon className="text-ink-400 h-4 w-4" />
            </Row>
          }
          menuWidth={'w-36'}
          selectedItemName={SORT_OPTIONS.find((o) => o.key === sortKey)?.label}
          closeOnClick
        />
      </Row>

      <Row className="flex-col gap-3 sm:flex-row sm:gap-1">
        <Col className="w-full sm:w-1/2">
          <Row className="justify-between p-2">
            <span className="font-semibold text-teal-600">
              Longs ({longs.length})
            </span>
            <span className="text-ink-600">Profit</span>
          </Row>
          {sortHolders(longs).map((h) => (
            <HolderRow
              key={h.userId + h.direction}
              holder={h}
              oraclePrice={price}
              contractId={contract.id}
              priceDecimals={priceDecimals}
              short={isMobile}
            />
          ))}
        </Col>
        <Col className="w-full sm:w-1/2">
          <Row className="justify-between p-2">
            <span className="text-scarlet-600 font-semibold">
              Shorts ({shorts.length})
            </span>
            <span className="text-ink-600">Profit</span>
          </Row>
          {sortHolders(shorts).map((h) => (
            <HolderRow
              key={h.userId + h.direction}
              holder={h}
              oraclePrice={price}
              contractId={contract.id}
              priceDecimals={priceDecimals}
              short={isMobile}
            />
          ))}
        </Col>
      </Row>
    </Col>
  )
}

/**
 * Aggregate exposure per side. Leads with notional rather than margin
 * because notional is what the market is actually long or short — the two
 * can disagree in sign when the sides run different leverage, which is the
 * same trap that mispriced funding off the pools.
 */
const PerpHoldersSummary = (props: {
  contract: PerpContract
  longNotional: number
  shortNotional: number
  longMargin: number
  shortMargin: number
  longCount: number
  shortCount: number
}) => {
  const {
    contract,
    longNotional,
    shortNotional,
    longMargin,
    shortMargin,
    longCount,
    shortCount,
  } = props
  const total = longNotional + shortNotional
  const longShare = total > 0 ? longNotional / total : 0.5

  // Live rate off the same open interest shown here, so the bar and the
  // funding direction can't tell different stories.
  const fundingRate = getPerpFundingRate({
    ...contract,
    openInterestLong: longNotional,
    openInterestShort: shortNotional,
  })
  const fundingUnit = fundingPeriodUnit(getFundingPeriodMs(contract))

  return (
    <Col className="bg-canvas-50 gap-2 rounded-lg px-3 py-2.5 sm:px-4">
      <Row className="items-start justify-between gap-2">
        <Col>
          <span className="text-xs font-medium uppercase tracking-wide text-teal-600">
            Long
          </span>
          <span className="text-ink-900 text-lg font-semibold tabular-nums">
            {formatMoney(longNotional)}
          </span>
          <span className="text-ink-500 text-xs">
            {longCount} {longCount === 1 ? 'trader' : 'traders'} ·{' '}
            {formatMoneyShort(longMargin)} margin
          </span>
        </Col>
        <Col className="items-end">
          <span className="text-scarlet-600 text-xs font-medium uppercase tracking-wide">
            Short
          </span>
          <span className="text-ink-900 text-lg font-semibold tabular-nums">
            {formatMoney(shortNotional)}
          </span>
          <span className="text-ink-500 text-xs">
            {shortCount} {shortCount === 1 ? 'trader' : 'traders'} ·{' '}
            {formatMoneyShort(shortMargin)} margin
          </span>
        </Col>
      </Row>

      {total > 0 && (
        <Row className="bg-ink-200 h-2 w-full overflow-hidden rounded-full">
          <div
            className="bg-teal-500"
            style={{ width: `${longShare * 100}%` }}
          />
          <div
            className="bg-scarlet-500"
            style={{ width: `${(1 - longShare) * 100}%` }}
          />
        </Row>
      )}

      <Row className="text-ink-500 flex-wrap gap-x-1.5 text-xs">
        <Tooltip
          text="Open interest: the notional each side is carrying (margin × leverage) — what the market is actually long or short, which is what funding is priced off."
          className="underline decoration-dotted underline-offset-2"
        >
          {formatMoney(total)} open interest
        </Tooltip>
        <span>·</span>
        <span>
          {total <= 0
            ? 'no open exposure'
            : longNotional <= 0 || shortNotional <= 0
            ? // A one-sided book is maximally imbalanced, but funding has no
              // counterparty to pay, so it stays at zero. Saying "balanced"
              // here would be exactly backwards.
              `${
                longNotional > 0 ? 'longs' : 'shorts'
              } only, so no funding is flowing`
            : fundingRate === 0
            ? 'sides balanced, no funding flowing'
            : `${(longShare * 100).toFixed(0)}% long · ${
                fundingRate > 0 ? 'longs pay shorts' : 'shorts pay longs'
              } ${Math.abs(fundingRate * 100).toFixed(3)}%/${fundingUnit}`}
        </span>
      </Row>
    </Col>
  )
}

const getUserFacingPnlForHolder = (
  h: Holder,
  oraclePrice: number,
  contractId: string
) =>
  getUserFacingPnl(
    {
      ...h,
      contractId,
    } as PerpPosition,
    oraclePrice
  )

const HolderRow = (props: {
  holder: Holder
  oraclePrice: number
  contractId: string
  priceDecimals: number
  short: boolean
}) => {
  const { holder, oraclePrice, contractId, priceDecimals, short } = props
  const currentUser = useUser()
  const pnl = getUserFacingPnlForHolder(holder, oraclePrice, contractId)

  return (
    <Col
      className={clsx(
        'border-ink-300 border-b',
        currentUser?.id === holder.userId && 'bg-amber-500/20'
      )}
    >
      <Row className="items-center justify-between gap-2 px-2 py-3">
        <div className="max-w-[7rem] shrink items-center gap-2 overflow-hidden sm:max-w-none">
          <UserAvatarAndBadge
            user={{
              id: holder.userId,
              name: holder.userName ?? 'anon',
              username: holder.username ?? 'anon',
              avatarUrl: holder.avatarUrl ?? '',
            }}
            short={short}
          />
        </div>
        <Col className="items-end">
          <span className={pnl >= 0 ? 'text-teal-600' : 'text-scarlet-600'}>
            {formatMoney(pnl)}
          </span>
          <span className="text-ink-500 text-xs">
            {formatMoney(holder.size)} notional · {holder.leverage.toFixed(2)}×
          </span>
          <span className="text-ink-500 text-xs">
            {formatMoney(holder.originalCostBasis)} margin · liq{' '}
            {formatPrice(holder.liquidationPrice, priceDecimals)}
          </span>
        </Col>
      </Row>
    </Col>
  )
}
