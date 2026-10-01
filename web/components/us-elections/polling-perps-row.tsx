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

/**
 * The VoteHub polling-average perps (Trump approval, generic ballot, Vance
 * favorability), shown as one row.
 *
 * These are the numbers people actually argue about between now and election
 * day, and unlike a binary market they keep updating rather than sitting at a
 * fixed probability — so they give the page a reason to be checked daily.
 *
 * Layout follows the page's other rows: a swipeable carousel on mobile, a
 * plain grid once there's room to show all three at once.
 */
export function PollingPerpsRow(props: { contracts: Contract[] }) {
  const { contracts } = props

  const perps = contracts.filter(
    (c): c is PerpContract => c.mechanism === 'perp'
  )
  if (perps.length === 0) return null

  return (
    <div className="flex snap-x gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 lg:grid-cols-3">
      {perps.map((perp) => (
        <PollingPerpCard
          key={perp.id}
          perp={perp}
          className="w-[280px] shrink-0 snap-start sm:w-auto sm:min-w-0"
        />
      ))}
    </div>
  )
}

function PollingPerpCard(props: { perp: PerpContract; className?: string }) {
  const { className } = props
  const { contract: perp } = useLivePerpContract(props.perp)
  const [direction, setDirection] = useState<'long' | 'short'>()
  const openBet = (value: 'long' | 'short') => {
    track('bet intent', {
      location: 'election polling',
      contractId: perp.id,
      direction: value,
    })
    setDirection(value)
  }

  const price = Number(perp.oraclePrice)
  // Reuse the canonical per-feed decoration table so these render with the
  // same unit as everywhere else, rather than a second hardcoded list.
  const priceLabel = Number.isFinite(price)
    ? formatOraclePriceTick(perp.oracleFeedId, price, 0.1)
    : '—'

  return (
    <>
      <article
        aria-label={perp.question}
        className={clsx(
          className,
          'bg-canvas-0 border-ink-200 flex flex-col gap-1 rounded-xl border p-3'
        )}
      >
        <Row className="items-start justify-between gap-2">
          <div className="text-ink-700 line-clamp-2 text-sm font-medium">
            {perp.question}
          </div>
          <div className="text-primary-700 shrink-0 text-lg font-semibold tabular-nums">
            {priceLabel}
          </div>
        </Row>
        <FeedPerpPriceSparkline
          contract={perp}
          height={56}
          emptyState={
            <div className="text-ink-400 flex h-[56px] items-center text-xs">
              No recent prices
            </div>
          }
        />
        <Row className="mt-1 gap-2">
          <button
            aria-label={`Bet higher on ${perp.question}`}
            aria-haspopup="dialog"
            onClick={() => openBet('long')}
            className="border-ink-200 hover:bg-canvas-50 flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs font-semibold text-teal-600 dark:text-teal-400"
          >
            <TrendingUpIcon className="h-3.5 w-3.5" aria-hidden />
            Higher
          </button>
          <button
            aria-label={`Bet lower on ${perp.question}`}
            aria-haspopup="dialog"
            onClick={() => openBet('short')}
            className="border-ink-200 hover:bg-canvas-50 text-scarlet-600 dark:text-scarlet-400 flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs font-semibold"
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
