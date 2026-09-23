import clsx from 'clsx'
import Link from 'next/link'

import { Contract, PerpContract, contractPath } from 'common/contract'
import { formatOraclePriceTick } from 'common/perps/oracle-display'
import { Row } from 'web/components/layout/row'
import { Carousel } from 'web/components/widgets/carousel'
import { FeedPerpPriceSparkline } from 'web/components/perps/feed-perp-price-sparkline'
import { track } from 'web/lib/service/analytics'

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
    <>
      {/* Mobile: swipeable, same affordance as the Trending row. */}
      <Carousel className="w-full sm:hidden">
        {perps.map((perp) => (
          <PollingPerpCard
            key={perp.id}
            perp={perp}
            className="mb-4 min-w-[280px]"
          />
        ))}
      </Carousel>

      {/* Desktop: all three visible at once, no interaction needed. */}
      <div className="hidden gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3">
        {perps.map((perp) => (
          <PollingPerpCard key={perp.id} perp={perp} />
        ))}
      </div>
    </>
  )
}

function PollingPerpCard(props: { perp: PerpContract; className?: string }) {
  const { perp, className } = props

  const price = Number(perp.oraclePrice)
  // Reuse the canonical per-feed decoration table so these render with the
  // same unit as everywhere else, rather than a second hardcoded list.
  const priceLabel = Number.isFinite(price)
    ? formatOraclePriceTick(perp.oracleFeedId, price, 0.1)
    : '—'

  return (
    <Link
      href={contractPath(perp)}
      onClick={() =>
        track('click market card election polling', {
          slug: perp.slug,
          contractId: perp.id,
        })
      }
      className={clsx(
        className,
        'bg-canvas-0 hover:bg-primary-50 border-ink-200 flex flex-col gap-1 rounded-xl border p-3 transition-colors'
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
    </Link>
  )
}
