import clsx from 'clsx'

import { Contract, PerpContract } from 'common/contract'
import { formatOraclePriceTick } from 'common/perps/oracle-display'
import { Row } from 'web/components/layout/row'
import { FeedPerpPriceSparkline } from 'web/components/perps/feed-perp-price-sparkline'
import { PerpBetButtons } from 'web/components/perps/perp-bet-buttons'
import { useLivePerpContract } from 'web/components/perps/use-live-perp-contract'

// Short, parallel card titles for the VoteHub feeds. The market questions are
// long and inconsistent ("Trump approval rating" next to "Democratic share of
// 2026 generic ballot (VoteHub avg, %)"), which wrapped unevenly and pushed the
// buttons out of line. Keyed by oracle feed id; any other perp falls back to its
// question.
const POLLING_FEED_TITLES: Record<string, string> = {
  'trump-approval-rating': 'Trump approval',
  'votehub-generic-ballot-2026': 'Generic ballot (D share)',
  'vance-favorability': 'Vance favorability',
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
  // (daily) feeds it takes the price from the websocket push and the
  // edge-cached market poll (once a minute) instead of polling the uncached
  // quote endpoint. The trade modal mounts its own live contract, which keeps
  // the trading cadence while it is open.
  const { contract: perp } = useLivePerpContract(props.perp, {
    displayOnly: true,
  })

  const shortTitle = POLLING_FEED_TITLES[perp.oracleFeedId]
  const title = shortTitle ?? perp.question
  const price = Number(perp.oraclePrice)
  // Reuse the canonical per-feed decoration table so these render with the
  // same unit as everywhere else, rather than a second hardcoded list.
  const priceLabel = Number.isFinite(price)
    ? formatOraclePriceTick(perp.oracleFeedId, price, 0.1)
    : '—'

  return (
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
            className="text-ink-900 text-sm font-semibold leading-snug"
            title={perp.question}
          >
            {title}
          </h3>
          <div className="text-ink-600 truncate text-xs">VoteHub average</div>
        </div>
        <div className="text-primary-700 shrink-0 text-lg font-semibold tabular-nums">
          {priceLabel}
        </div>
      </Row>
      <FeedPerpPriceSparkline
        contract={perp}
        height={56}
        className="!my-1"
        // "VoteHub average" above already names the source.
        hideCredit
        emptyState={
          <div className="text-ink-500 flex h-[56px] items-center text-xs">
            No recent prices
          </div>
        }
      />
      <div className="text-ink-600 text-right text-[11px] leading-none">
        Past 7 days
      </div>
      <PerpBetButtons
        contract={perp}
        labels={{ long: 'Higher', short: 'Lower' }}
        location="election polling"
        className="mt-auto pt-2"
        buttonClassName="flex-1"
      />
    </article>
  )
}
