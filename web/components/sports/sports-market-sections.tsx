import { ArrowRightIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import Link from 'next/link'
import { Contract, isSportsContract } from 'common/contract'
import { SPORT_BY_KEY, SportKey, sportGroupIds } from 'common/sports-schedule'
import { DAY_MS } from 'common/util/time'
import { ContractRow } from 'web/components/contract/contracts-table'
import {
  probColumn,
  traderColumn,
} from 'web/components/contract/contract-table-col-formats'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { useAPIGetter } from 'web/hooks/use-api-getter'

/**
 * Markets that aren't tied to a specific game: what's hot in this sport right
 * now, and the season-long futures (MVP, champion, playoff spots…).
 */
export function SportsMarketSections(props: {
  sport: SportKey | 'all'
  className?: string
}) {
  const { sport, className } = props
  const gids = sportGroupIds(sport).join(',')
  const label = sport === 'all' ? 'sports' : SPORT_BY_KEY[sport]?.label ?? ''
  const slug = sport === 'all' ? 'sports-default' : SPORT_BY_KEY[sport]?.slug
  // /browse reads the topic filter from `tf` and the open/resolved filter from `f`.
  const seeAllHref = slug
    ? `/browse?tf=${slug}`
    : `/browse?q=${encodeURIComponent(label)}`

  // Distinct cache slots: useAPIGetter keys its data by path, so two calls to
  // the same endpoint would otherwise overwrite each other.
  const trending = useAPIGetter(
    'search-markets-full',
    { term: '', filter: 'open', sort: 'score', gids, limit: 30 },
    undefined,
    `sports-trending-${sport}`
  )
  const futures = useAPIGetter(
    'search-markets-full',
    { term: '', filter: 'open', sort: 'liquidity', gids, limit: 40 },
    undefined,
    `sports-futures-${sport}`
  )
  const resolved = useAPIGetter(
    'search-markets-full',
    { term: '', filter: 'resolved', sort: 'resolve-date', gids, limit: 20 },
    undefined,
    `sports-resolved-${sport}`
  )

  const now = Date.now()
  const trendingMarkets = (trending.data ?? [])
    .filter((c) => !isSportsContract(c))
    .slice(0, 8)
  const trendingIds = new Set(trendingMarkets.map((c) => c.id))
  const futuresMarkets = (futures.data ?? [])
    .filter(
      (c) =>
        !isSportsContract(c) &&
        !trendingIds.has(c.id) &&
        (c.closeTime ?? 0) - now > 21 * DAY_MS
    )
    .slice(0, 8)

  const resolvedMarkets = (resolved.data ?? [])
    .filter(
      (c) => !isSportsContract(c) && (c.resolutionTime ?? 0) > now - 2 * DAY_MS
    )
    .slice(0, 6)

  return (
    <Col className={clsx('gap-5', className)}>
      <MarketSection
        title={`Trending in ${label}`}
        contracts={trendingMarkets}
        loading={trending.loading && !trending.data}
        seeAllHref={seeAllHref}
      />
      <MarketSection
        title="Futures & season-long"
        contracts={futuresMarkets}
        loading={futures.loading && !futures.data}
        seeAllHref={seeAllHref}
      />
      <MarketSection
        title="Recently resolved"
        contracts={resolvedMarkets}
        loading={resolved.loading && !resolved.data}
        seeAllHref={`${seeAllHref}&f=resolved`}
      />
    </Col>
  )
}

function MarketSection(props: {
  title: string
  contracts: Contract[]
  loading: boolean
  seeAllHref: string
}) {
  const { title, contracts, loading, seeAllHref } = props
  if (!loading && contracts.length === 0) return null
  return (
    <Col className="border-ink-200 bg-canvas-0 gap-1 rounded-lg border">
      <Row className="items-center justify-between px-3 pb-1 pt-3">
        <h3 className="text-ink-900 text-sm font-semibold">{title}</h3>
        <Link
          href={seeAllHref}
          className="text-ink-500 hover:text-primary-700 flex items-center gap-1 text-xs"
        >
          See all <ArrowRightIcon className="h-3 w-3" />
        </Link>
      </Row>
      {loading ? (
        <Col className="gap-2 px-3 pb-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-ink-100 h-8 animate-pulse rounded" />
          ))}
        </Col>
      ) : (
        <Col className="pb-1">
          {contracts.map((c) => (
            <ContractRow
              key={c.id}
              contract={c}
              columns={[traderColumn, probColumn]}
              hideAvatar
            />
          ))}
        </Col>
      )}
    </Col>
  )
}
