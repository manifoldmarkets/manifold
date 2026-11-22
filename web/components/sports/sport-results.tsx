import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  BDL_LEAGUES,
  isBdlLeagueKey,
  type BdlLeagueKey,
} from 'common/bdl/leagues'
import type { SportsResult, SportsResultsPage } from 'common/sports-results'
import { api, APIError } from 'web/lib/api/api'
import type { HidesBlocked } from './blocked-topics-state'

export function SportResults(props: {
  sport: string
  league?: string | string[]
  hides: HidesBlocked
}) {
  const { sport, league, hides } = props
  const selected =
    typeof league === 'string' &&
    isBdlLeagueKey(league) &&
    BDL_LEAGUES[league].sportKey === sport
      ? league
      : undefined
  return (
    <ResultsPage
      key={sport + '/' + (selected ?? '')}
      sport={sport}
      league={selected}
      hides={hides}
    />
  )
}
function ResultsPage({
  sport,
  league,
  hides,
}: {
  sport: string
  league?: BdlLeagueKey
  hides: HidesBlocked
}) {
  const [page, setPage] = useState<SportsResultsPage>()
  const [request, setRequest] = useState<{ cursor?: string; attempt: number }>({
    attempt: 0,
  })
  const [error, setError] = useState<'unavailable' | 'failed'>()
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(undefined)
    api(
      'sports-results',
      { sport, league, cursor: request.cursor },
      { signal: controller.signal }
    )
      .then((next) => {
        if (controller.signal.aborted) return
        setPage((prior) => ({
          items:
            request.cursor && prior
              ? [
                  ...new Map(
                    [...prior.items, ...next.items].map((item) => [
                      item.id,
                      item,
                    ])
                  ).values(),
                ]
              : next.items,
          nextCursor: next.nextCursor,
        }))
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof APIError && e.code === 404 ? 'unavailable' : 'failed'
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [sport, league, request])
  const items = page?.items.filter((item) => !hides(item.groupSlugs))
  const retry = () => setRequest((r) => ({ ...r, attempt: r.attempt + 1 }))
  return (
    <section aria-label="Results" aria-busy={loading} className="py-3">
      {!!items?.length && (
        <ul className="bg-canvas-0 border-ink-200 divide-ink-200 divide-y overflow-hidden rounded-lg border">
          {items.map((item) => (
            <ResultRow key={item.id} item={item} />
          ))}
        </ul>
      )}
      {loading && (
        <p role="status" className="text-ink-600 py-4 text-sm">
          Loading results…
        </p>
      )}
      {error && (
        <div role="status" className="text-ink-600 py-4 text-sm">
          {error === 'unavailable'
            ? 'Results are unavailable on this server.'
            : 'Results could not be loaded.'}{' '}
          <button
            className="text-primary-700 min-h-[44px] px-2 font-medium"
            onClick={retry}
          >
            Retry
          </button>
        </div>
      )}
      {!loading && !error && items?.length === 0 && (
        <p className="text-ink-600 py-4 text-sm">
          {page?.nextCursor
            ? 'No visible results on this page.'
            : 'No settled markets to show.'}
        </p>
      )}
      {page?.nextCursor && !loading && !error && (
        <button
          onClick={() =>
            setRequest({ cursor: page.nextCursor ?? undefined, attempt: 0 })
          }
          className="border-ink-300 text-ink-800 mt-3 min-h-[44px] rounded-md border px-4 text-sm font-medium"
        >
          Older results
        </button>
      )}
    </section>
  )
}
function ResultRow({ item }: { item: SportsResult }) {
  const time = new Date(item.settledAt),
    score = item.finalScore
  return (
    <li>
      <Link
        href={item.href}
        className="hover:bg-canvas-50 focus-visible:ring-primary-600 block min-w-0 px-3 py-3 focus-visible:ring-2 focus-visible:ring-inset"
      >
        <div className="text-ink-500 flex flex-wrap items-center gap-x-2 text-xs">
          {item.league && <span>{item.league}</span>}
          <time dateTime={time.toISOString()}>
            {time.toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </time>
        </div>
        <div className="text-ink-900 mt-1 break-words text-base font-semibold">
          {item.question}
        </div>
        <div className="text-ink-800 mt-1 break-words text-sm">
          <span className="text-ink-500">Market outcome</span> · {item.payout}
        </div>
        {score && (
          <div className="text-ink-600 mt-0.5 break-words text-sm">
            Final score · {score.home} {score.homeScore} – {score.away}{' '}
            {score.awayScore}
          </div>
        )}
      </Link>
    </li>
  )
}
