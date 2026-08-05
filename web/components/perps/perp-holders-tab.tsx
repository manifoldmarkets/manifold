import clsx from 'clsx'
import { orderBy } from 'lodash'
import { useEffect } from 'react'
import { PerpContract } from 'common/contract'
import { getUserFacingPnl } from 'common/perps/pnl'
import { PerpPosition } from 'common/perps/position'
import { formatPrice, inferPriceDecimals } from 'common/perps/format'
import { formatMoney } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { UserAvatarAndBadge } from 'web/components/widgets/user-link'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useUser } from 'web/hooks/use-user'
import { useLivePerpContract } from './use-live-perp-contract'
import { PerpPositionRow, usePerpPositions } from './use-perp-positions'

type Holder = PerpPositionRow

export const PerpHoldersTab = (props: {
  contract: PerpContract
  setTotalHolders?: (n: number) => void
}) => {
  const { setTotalHolders } = props
  // Tabs mount with the SSR contract, outside PerpOverview's live overlay —
  // poll here too so mark price / PnL / positions track the market instead
  // of freezing at page-load values (they used to fetch exactly once).
  const { contract } = useLivePerpContract(props.contract)
  const holders = usePerpPositions(contract.id)

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

  // Order each side by unrealized PnL so winners float to the top. Using
  // user-facing PnL (includes funding, excludes ADL haircut from the
  // original-margin baseline) — this matches what shows on profile pages.
  const orderByPnl = (hs: Holder[]) =>
    orderBy(hs, (h) => getUserFacingPnlForHolder(h, price, contract.id), 'desc')

  return (
    <Row className="flex-col gap-3 sm:flex-row sm:gap-1">
      <Col className="w-full sm:w-1/2">
        <Row className="justify-between p-2">
          <span className="font-semibold text-teal-600">
            Longs ({longs.length})
          </span>
          <span className="text-ink-600">Profit</span>
        </Row>
        {orderByPnl(longs).map((h) => (
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
        {orderByPnl(shorts).map((h) => (
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
            {formatMoney(holder.originalCostBasis)} margin ·{' '}
            {holder.leverage.toFixed(2)}× · liq{' '}
            {formatPrice(holder.liquidationPrice, priceDecimals)}
          </span>
        </Col>
      </Row>
    </Col>
  )
}
