import clsx from 'clsx'
import { getDisplayProbability } from 'common/calculate'
import {
  BinaryContract,
  Contract,
  contractPath,
  dayProbChange,
} from 'common/contract'
import { formatPercentShort } from 'common/util/format'
import Link from 'next/link'

import { ContractStatusLabel } from 'web/components/contract/contracts-table'
import { track } from 'web/lib/service/analytics'
import { shortenedFromNow } from 'web/lib/util/shortenedFromNow'
import { BoostedTag, ChangeBadge } from './market-card'
import { useBrowseTopics } from './browse-topics'
import { isHubMarket } from './hub-fold'
import { BrowseMarketsQuery, useBrowseMarkets } from './use-browse-markets'

type Scope = Pick<BrowseMarketsQuery, 'gids' | 'topicSlug'>

// Shelf queries skip the main list's blocked-topic handling on the server,
// so excluded markets are filtered here and topic changes refetch.
function useShelf(query: BrowseMarketsQuery, size: number, fold: boolean) {
  const topics = useBrowseTopics()
  const { contracts } = useBrowseMarkets(query, size, topics.version)
  return contracts?.filter(
    (c) => !topics.isExcluded(c) && !(fold && isHubMarket(c))
  )
}

// Horizontal strip of binary markets that moved most in the last day.
export function MoversStrip(props: { scope: Scope; fold: boolean }) {
  const { scope, fold } = props
  const contracts = useShelf(
    {
      sort: 'daily-score',
      filter: 'open',
      contractType: 'BINARY',
      token: 'MANA',
      ...scope,
    },
    16,
    fold
  )
  const movers = (contracts ?? [])
    .filter((c) => c.outcomeType === 'BINARY')
    .filter((c) => dayProbChange(c as BinaryContract) >= 5)
    .slice(0, 8) as BinaryContract[]

  if (contracts && movers.length === 0) return null

  return (
    <section aria-labelledby="browse-movers" className="flex flex-col gap-2">
      <h2
        id="browse-movers"
        className="text-ink-900 text-sm font-semibold uppercase tracking-wide"
      >
        Moving today
      </h2>
      <div className="-mx-2 flex gap-2 overflow-x-auto px-2 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
        {contracts
          ? movers.map((c, i) => (
              <MoverTile
                key={c.id}
                contract={c}
                className={i >= 4 ? 'md:hidden' : undefined}
              />
            ))
          : Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="bg-ink-100 h-[88px] w-56 shrink-0 animate-pulse rounded-xl md:w-auto"
              />
            ))}
      </div>
    </section>
  )
}

function MoverTile(props: { contract: BinaryContract; className?: string }) {
  const { contract, className } = props
  const change = dayProbChange(contract)
  const up = contract.probChanges.day > 0
  return (
    <Link
      href={contractPath(contract)}
      onClick={() =>
        track('click browse contract', {
          slug: contract.slug,
          contractId: contract.id,
          section: 'browse-v2 movers',
        })
      }
      className={clsx(
        'bg-canvas-0 border-ink-200 dark:border-ink-300 flex w-56 shrink-0 flex-col justify-between gap-2 rounded-xl border p-3 transition-colors md:w-auto',
        'hover:border-primary-300 focus-visible:ring-primary-500 outline-none focus-visible:ring-2',
        className
      )}
    >
      <span className="text-ink-900 line-clamp-2 text-sm font-medium leading-snug">
        {contract.question}
      </span>
      <span className="flex items-center gap-2 text-xs">
        <span className="text-ink-1000 text-lg font-semibold tabular-nums leading-none">
          {formatPercentShort(getDisplayProbability(contract))}
        </span>
        <ChangeBadge up={up} points={change} />
        {contract.boosted && <BoostedTag iconOnly />}
      </span>
    </Link>
  )
}

// Compact list for the right rail: soonest-closing open markets that people
// actually trade. Unfiltered, it was mostly two-trader bot markets.
const MIN_CLOSING_TRADERS = 5

export function ClosingSoonList(props: { scope: Scope; fold: boolean }) {
  const { scope, fold } = props
  const contracts = useShelf(
    { sort: 'close-date', filter: 'open', token: 'MANA', ...scope },
    30,
    fold
  )
    ?.filter((c) => (c.uniqueBettorCount ?? 0) >= MIN_CLOSING_TRADERS)
    .slice(0, 6)
  return (
    <RailList
      id="browse-closing"
      title="Closing soon"
      contracts={contracts}
      section="browse-v2 closing rail"
      detail={(c) =>
        c.closeTime ? `${shortenedFromNow(c.closeTime)} left` : undefined
      }
    />
  )
}

// Compact list for the right rail: newest markets.
export function NewMarketsList(props: { scope: Scope; fold: boolean }) {
  const { scope, fold } = props
  const contracts = useShelf(
    { sort: 'newest', filter: 'open', token: 'MANA', ...scope },
    5,
    fold
  )
  return (
    <RailList
      id="browse-new"
      title="Just created"
      contracts={contracts}
      section="browse-v2 new rail"
      detail={(c) => `${shortenedFromNow(c.createdTime)} ago`}
    />
  )
}

function RailList(props: {
  id: string
  title: string
  contracts: Contract[] | undefined
  section: string
  detail: (c: Contract) => string | undefined
}) {
  const { id, title, contracts, section, detail } = props
  if (contracts && contracts.length === 0) return null
  return (
    <section aria-labelledby={id} className="flex flex-col gap-1">
      <h2
        id={id}
        className="text-ink-900 px-2 text-sm font-semibold uppercase tracking-wide"
      >
        {title}
      </h2>
      <ul className="m-0 flex list-none flex-col p-0">
        {contracts
          ? contracts.map((c) => (
              <li key={c.id}>
                <Link
                  href={contractPath(c)}
                  onClick={() =>
                    track('click browse contract', {
                      slug: c.slug,
                      contractId: c.id,
                      section,
                    })
                  }
                  className="hover:bg-ink-100 focus-visible:bg-ink-100 flex items-start justify-between gap-3 rounded-lg px-2 py-2 outline-none"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="text-ink-900 line-clamp-2 text-sm leading-snug">
                      {c.question}
                    </span>
                    <span className="text-ink-500 flex items-center gap-1.5 text-xs">
                      {c.boosted && <BoostedTag iconOnly />}
                      {detail(c)}
                    </span>
                  </span>
                  {c.outcomeType === 'BINARY' && (
                    <ContractStatusLabel
                      contract={c}
                      className="shrink-0 text-sm font-semibold"
                    />
                  )}
                </Link>
              </li>
            ))
          : Array.from({ length: 4 }).map((_, i) => (
              <li
                key={i}
                className="bg-ink-100 mx-2 my-1.5 h-10 animate-pulse rounded"
              />
            ))}
      </ul>
    </section>
  )
}
