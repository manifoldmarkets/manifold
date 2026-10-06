import clsx from 'clsx'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import { TrendingDownIcon, TrendingUpIcon } from '@heroicons/react/outline'

import { Contract, PerpContract } from 'common/contract'
import { formatOraclePriceTick } from 'common/perps/oracle-display'
import { Row } from 'web/components/layout/row'
import { FeedPerpPriceSparkline } from 'web/components/perps/feed-perp-price-sparkline'
import { track } from 'web/lib/service/analytics'
import {
  Modal,
  MODAL_CLASS,
  SCROLLABLE_MODAL_CLASS,
} from 'web/components/layout/modal'
import { useLivePerpContract } from 'web/components/perps/use-live-perp-contract'

const PerpOverview = dynamic(
  () =>
    import('web/components/perps/perp-overview').then((m) => m.PerpOverview),
  { ssr: false }
)

// Short, parallel card titles for the VoteHub feeds. The market questions are
// long and inconsistent ("Trump approval rating" next to "Democratic share of
// 2026 generic ballot (VoteHub avg, %)"), which wrapped unevenly and pushed the
// buttons out of line. Keyed by oracle feed id; any other perp falls back to its
// question.
const POLLING_FEED_LABELS: Record<string, { title: string; unit: string }> = {
  'trump-approval-rating': { title: 'Trump approval', unit: 'approve' },
  'votehub-generic-ballot-2026': {
    title: 'Generic ballot (D share)',
    unit: 'Democratic',
  },
  'vance-favorability': { title: 'Vance favorability', unit: 'favorable' },
}

/**
 * The VoteHub polling-average perps (Trump approval, generic ballot, Vance
 * favorability), shown as one row.
 *
 * These are the numbers people actually argue about between now and election
 * day, and unlike a binary market they keep updating rather than sitting at a
 * fixed probability — so they give the page a reason to be checked daily.
 *
 * Layout follows the page's other rows: a swipeable carousel on phones, then
 * one row from small tablets up (two columns left the third card orphaned on
 * its own row at 768px).
 */
export function PollingPerpsRow(props: { contracts: Contract[] }) {
  const { contracts } = props

  const perps = contracts.filter(
    (c): c is PerpContract => c.mechanism === 'perp'
  )
  if (perps.length === 0) return null

  return (
    <div
      className={clsx(
        'flex snap-x gap-3 overflow-x-auto pb-2 sm:grid',
        perps.length >= 3
          ? 'sm:grid-cols-3'
          : perps.length === 2
          ? 'sm:grid-cols-2'
          : 'sm:grid-cols-1'
      )}
    >
      {perps.map((perp) => (
        <PollingPerpCard
          key={perp.id}
          perp={perp}
          className="w-[260px] shrink-0 snap-start sm:w-auto sm:min-w-0"
        />
      ))}
    </div>
  )
}

function PollingPerpCard(props: { perp: PerpContract; className?: string }) {
  const { className } = props
  // displayOnly: the card shows the price and nothing else, so on these slow
  // (daily) feeds the config/volume poll backs off along with the price poll.
  // The trade modal mounts its own PerpOverview, which keeps the trading
  // cadence while it is open.
  const { contract: perp } = useLivePerpContract(props.perp, {
    displayOnly: true,
  })
  const [direction, setDirection] = useState<'long' | 'short'>()
  const openBet = (value: 'long' | 'short') => {
    track('bet intent', {
      location: 'election polling',
      contractId: perp.id,
      direction: value,
    })
    setDirection(value)
  }

  const label = POLLING_FEED_LABELS[perp.oracleFeedId]
  const title = label?.title ?? perp.question
  const price = Number(perp.oraclePrice)
  // Reuse the canonical per-feed decoration table so these render with the
  // same unit as everywhere else, rather than a second hardcoded list.
  const priceLabel = Number.isFinite(price)
    ? formatOraclePriceTick(perp.oracleFeedId, price, 0.1)
    : '—'

  return (
    <>
      <article
        aria-label={title}
        className={clsx(
          className,
          'bg-canvas-0 border-ink-200 flex flex-col gap-1 rounded-xl border p-3'
        )}
      >
        <Row className="items-start justify-between gap-2">
          <div className="min-w-0">
            <h3
              className="text-ink-900 truncate text-sm font-semibold"
              title={perp.question}
            >
              {title}
            </h3>
            <div className="text-ink-600 truncate text-xs">
              VoteHub average{label ? ` · % ${label.unit}` : ''}
            </div>
          </div>
          <div className="text-primary-700 shrink-0 text-lg font-semibold tabular-nums">
            {priceLabel}
          </div>
        </Row>
        <FeedPerpPriceSparkline
          contract={perp}
          height={56}
          className="!my-1"
          emptyState={
            <div className="text-ink-500 flex h-[56px] items-center text-xs">
              No recent prices
            </div>
          }
        />
        <div className="text-ink-600 text-right text-[11px] leading-none">
          Past 7 days
        </div>
        <Row className="mt-auto gap-2 pt-2">
          <button
            aria-label={`Bet ${title} goes higher`}
            aria-haspopup="dialog"
            onClick={() => openBet('long')}
            className="border-ink-200 hover:bg-canvas-50 flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs font-semibold text-teal-700"
          >
            <TrendingUpIcon className="h-3.5 w-3.5" aria-hidden />
            Higher
          </button>
          <button
            aria-label={`Bet ${title} goes lower`}
            aria-haspopup="dialog"
            onClick={() => openBet('short')}
            className="border-ink-200 hover:bg-canvas-50 text-scarlet-700 flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs font-semibold"
          >
            <TrendingDownIcon className="h-3.5 w-3.5" aria-hidden />
            Lower
          </button>
        </Row>
      </article>
      {direction && (
        <Modal
          open
          setOpen={(open) => !open && setDirection(undefined)}
          ariaLabel={`Bet on ${perp.question}`}
          className={clsx(MODAL_CLASS, SCROLLABLE_MODAL_CLASS)}
        >
          <Row className="mb-4 items-start justify-between gap-3">
            <h2 className="text-lg font-semibold">{perp.question}</h2>
            <strong className="text-primary-700 shrink-0 text-xl">
              {priceLabel}
            </strong>
          </Row>
          <PerpOverview
            contract={perp}
            tradeOnly
            initialDirection={direction}
          />
        </Modal>
      )}
    </>
  )
}
