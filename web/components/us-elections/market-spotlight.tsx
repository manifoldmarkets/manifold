import clsx from 'clsx'
import Link from 'next/link'

import { Contract, contractPath } from 'common/contract'
import { formatPercent } from 'common/util/format'
import { BetButton } from 'web/components/contract/contract-table-action'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { useLiveContract } from 'web/hooks/use-contract'
import { getHeadlineOdds } from 'web/lib/politics/election-curation'
import { track } from 'web/lib/service/analytics'

// Compact market cards for the elections page's spotlight sections (the
// Manifold Midterm Contest and Unprecedented politics). One card shape for
// both: the question, its headline odds, trader count and a Bet button.
// Multiple-choice markets show their leading answer *with* its percent; the old
// Redistricting table drew a bare bar with no number for those.

/** Swipeable row on phones, grid from small tablets up. */
export function MarketSpotlightGrid(props: {
  contracts: Contract[]
  trackingPostfix: string
  className?: string
}) {
  const { contracts, trackingPostfix, className } = props
  if (contracts.length === 0) return null
  return (
    <div
      className={clsx(
        'flex snap-x gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4',
        className
      )}
    >
      {contracts.map((contract) => (
        <SpotlightMarketCard
          key={contract.id}
          contract={contract}
          trackingPostfix={trackingPostfix}
          className="w-[250px] shrink-0 snap-start sm:w-auto"
        />
      ))}
    </div>
  )
}

export function SpotlightMarketCard(props: {
  contract: Contract
  trackingPostfix: string
  className?: string
}) {
  const { trackingPostfix, className } = props
  const contract = useLiveContract(props.contract)
  const odds = getHeadlineOdds(contract)
  const traders = contract.uniqueBettorCount ?? 0

  return (
    <article
      aria-label={contract.question}
      className={clsx(
        'bg-canvas-0 border-ink-200 flex min-w-0 flex-col gap-2 rounded-xl border p-3',
        className
      )}
    >
      <Link
        href={contractPath(contract)}
        onClick={() =>
          track(`click market card ${trackingPostfix}`, {
            contractId: contract.id,
            slug: contract.slug,
          })
        }
        className="text-ink-900 hover:text-primary-700 line-clamp-3 text-sm font-medium leading-snug hover:underline"
      >
        {contract.question}
      </Link>
      <Row className="mt-auto items-end justify-between gap-2 pt-1">
        <Col className="min-w-0">
          {odds?.kind === 'multi' && (
            <span className="text-ink-600 truncate text-xs">
              Leading:{' '}
              <span className="text-ink-900 font-medium">{odds.answer}</span>
            </span>
          )}
          {odds && (
            <span className="text-ink-1000 text-2xl font-semibold tabular-nums leading-tight">
              {formatPercent(odds.prob)}
              {odds.kind === 'binary' && (
                <span className="text-ink-600 ml-1 text-xs font-normal">
                  chance
                </span>
              )}
            </span>
          )}
          <span className="text-ink-600 text-xs">
            {traders} {traders === 1 ? 'trader' : 'traders'}
          </span>
        </Col>
        <BetButton contract={contract} />
      </Row>
    </article>
  )
}
