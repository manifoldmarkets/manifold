import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { PerpContract } from 'common/contract'
import { formatPrice, inferPriceDecimals } from 'common/perps/format'
import { formatMoney } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { LoadMoreUntilNotVisible } from 'web/components/widgets/visibility-observer'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { UserAvatarAndBadge } from 'web/components/widgets/user-link'
import { api } from 'web/lib/api/api'
import { POSITIONS_POLL_MS as POLL_MS } from './use-perp-positions'

type Event = {
  id: number
  ts: number
  userId: string | null
  direction: 'long' | 'short' | null
  eventType: 'open' | 'add' | 'close' | 'liquidation' | 'adl' | 'funding'
  oraclePrice: number
  sizeDelta: number
  costBasisDelta: number
  originalCostBasisDelta: number
  leverage: number | null
  payout: number | null
  pnl: number | null
  userName: string | null
  username: string | null
  avatarUrl: string | null
}

const PAGE_SIZE = 50

export const PerpTradesTab = (props: {
  contract: PerpContract
  setTotalTrades?: (n: number) => void
}) => {
  const { contract, setTotalTrades } = props
  const [events, setEvents] = useState<Event[] | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const initializedRef = useRef(false)

  // Poll the first page so new trades stream in while the tab is open (this
  // used to fetch exactly once — the tab froze until a full page reload).
  // New events have larger ids and come newest-first, so polling merges by
  // prepending unseen rows without disturbing pagination.
  useEffect(() => {
    let cancelled = false
    initializedRef.current = false
    const load = () =>
      api('get-perp-events', {
        contractId: contract.id,
        limit: PAGE_SIZE,
      })
        .then((rows) => {
          if (cancelled) return
          if (!initializedRef.current) {
            initializedRef.current = true
            setHasMore(rows.length === PAGE_SIZE)
          }
          setEvents((prev) => {
            if (!prev) return rows
            const known = new Set(prev.map((e) => e.id))
            const unseen = rows.filter((r) => !known.has(r.id))
            return unseen.length ? [...unseen, ...prev] : prev
          })
        })
        .catch(() => {})
    load()
    const id = setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [contract.id])

  // Count is a lower bound while pagination is in progress. Good enough for
  // the tab title in v1.
  useEffect(() => {
    if (events) setTotalTrades?.(events.length)
  }, [events?.length])

  const loadMore = async () => {
    if (!events || !hasMore || loadingMore) return false
    setLoadingMore(true)
    try {
      const oldest = events[events.length - 1]
      const more = await api('get-perp-events', {
        contractId: contract.id,
        beforeId: oldest.id,
        limit: PAGE_SIZE,
      })
      if (more.length === 0) {
        setHasMore(false)
        return false
      }
      setEvents((prev) => (prev ? [...prev, ...more] : more))
      setHasMore(more.length === PAGE_SIZE)
      return true
    } finally {
      setLoadingMore(false)
    }
  }

  if (!events) return <LoadingIndicator />
  if (events.length === 0)
    return <div className="text-ink-500 p-4 text-sm">No trades yet.</div>

  const priceDecimals = inferPriceDecimals([
    Number(contract.oraclePrice),
    ...events.map((e) => e.oraclePrice),
  ])

  return (
    <Col className="gap-2">
      {events.map((e) => (
        <EventRow key={e.id} event={e} priceDecimals={priceDecimals} />
      ))}
      {hasMore && <LoadMoreUntilNotVisible loadMore={loadMore} />}
    </Col>
  )
}

const EVENT_LABELS: Record<Event['eventType'], string> = {
  open: 'opened',
  add: 'added to',
  close: 'closed',
  liquidation: 'was liquidated on',
  adl: 'was auto-deleveraged on',
  funding: 'funding',
}

const EventRow = (props: { event: Event; priceDecimals: number }) => {
  const { event, priceDecimals } = props
  const dirColor =
    event.direction === 'long'
      ? 'text-teal-600'
      : event.direction === 'short'
      ? 'text-red-600'
      : 'text-ink-600'

  // For open/add we show deposited margin (originalCostBasisDelta).
  // For close/liquidation/adl we show payout + PnL from data.
  const isExit =
    event.eventType === 'close' ||
    event.eventType === 'liquidation' ||
    event.eventType === 'adl'

  const marginOrPayout = isExit
    ? event.payout
    : event.originalCostBasisDelta > 0
    ? event.originalCostBasisDelta
    : null

  return (
    <Row className="bg-canvas-0 border-ink-200 items-center gap-3 rounded-lg border px-3 py-2.5 sm:px-4 sm:py-3">
      <div className="shrink-0">
        <UserAvatarAndBadge
          user={{
            id: event.userId ?? '',
            name: event.userName ?? 'anon',
            username: event.username ?? 'anon',
            avatarUrl: event.avatarUrl ?? '',
          }}
          short
        />
      </div>
      <Col className="min-w-0 flex-1">
        <Row className="flex-wrap items-center gap-1 text-sm">
          <span className="text-ink-600">{EVENT_LABELS[event.eventType]}</span>
          {event.direction && (
            <span className={clsx('font-semibold uppercase', dirColor)}>
              {event.direction}
            </span>
          )}
          {event.leverage != null && event.leverage > 0 && (
            <span className="text-ink-500">{event.leverage.toFixed(2)}×</span>
          )}
          <span className="text-ink-500">
            @ {formatPrice(event.oraclePrice, priceDecimals)}
          </span>
          <RelativeTimestamp
            time={event.ts}
            shortened
            className="text-ink-400 !ml-1 text-xs"
          />
        </Row>
      </Col>
      <Col className="shrink-0 items-end text-sm">
        {marginOrPayout != null && (
          <span className="text-ink-900">{formatMoney(marginOrPayout)}</span>
        )}
        {isExit && event.pnl != null && (
          <span className={event.pnl >= 0 ? 'text-teal-600' : 'text-red-600'}>
            {event.pnl >= 0 ? '+' : ''}
            {formatMoney(event.pnl)}
          </span>
        )}
      </Col>
    </Row>
  )
}
