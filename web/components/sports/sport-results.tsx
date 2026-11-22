import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { isBdlLeagueKey, type BdlLeagueKey } from 'common/bdl/leagues'
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
    typeof league === 'string' && isBdlLeagueKey(league) ? league : undefined
  if (league !== undefined && !selected)
    return (
      <section aria-label="Results" className="text-ink-600 py-4 text-sm">
        Choose a supported league to see settled markets.
      </section>
    )
  return (
    <ResultsPage
      key={sport + '/' + (selected ?? '')}
      sport={sport}
      league={selected}
      hides={hides}
    />
  )
}
type Position = {
  pages: number
  anchor: string
  top: number
  settledAt: number
}
// Keep only the navigation position. Public results and visibility are read again before painting them.
let lastVisit: { scope: string; entry: unknown; position: Position } | undefined
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
  const section = useRef<HTMLElement>(null)
  const older = useRef<HTMLButtonElement>(null)
  const pageCount = useRef(0)
  const focus = useRef<
    { anchor: string; top: number } | { prior: Set<string> }
  >()
  const scope = sport + '/' + (league ?? '')
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(undefined)
    const fetchPage = (cursor?: string) =>
      api(
        'sports-results',
        { sport, league, cursor },
        { cache: 'no-store', signal: controller.signal }
      )
    const restore =
      !request.cursor &&
      lastVisit?.scope === scope &&
      lastVisit.entry === window.history.state?.key
        ? lastVisit.position
        : undefined
    async function load() {
      let next = await fetchPage(request.cursor)
      const rows = new Map(next.items.map((item) => [item.id, item]))
      const seen = new Set<string>()
      let count = 1
      // New settlements may have pushed the selected market beyond its old page.
      // Walk fresh, contiguous pages until reaching the former position or an older settlement.
      while (
        restore &&
        next.nextCursor &&
        !seen.has(next.nextCursor) &&
        (count < restore.pages ||
          (!rows.has(restore.anchor) &&
            !next.items.some((item) => item.settledAt < restore.settledAt)))
      ) {
        seen.add(next.nextCursor)
        next = await fetchPage(next.nextCursor)
        for (const item of next.items) rows.set(item.id, item)
        count++
      }
      return { items: [...rows.values()], nextCursor: next.nextCursor, count }
    }
    load()
      .then((next) => {
        if (controller.signal.aborted) return
        pageCount.current = request.cursor ? pageCount.current + 1 : next.count
        if (restore) {
          focus.current = { anchor: restore.anchor, top: restore.top }
          if (lastVisit?.position === restore) lastVisit = undefined
        }
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
  }, [sport, league, scope, request])
  useEffect(() => {
    const hide = () => {
      if (section.current) section.current.hidden = true
    }
    const show = (e: PageTransitionEvent) => {
      if (!e.persisted) return
      setPage(undefined)
      setLoading(true)
      setRequest((r) => ({ attempt: r.attempt + 1 }))
    }
    window.addEventListener('pagehide', hide)
    window.addEventListener('pageshow', show)
    return () => {
      window.removeEventListener('pagehide', hide)
      window.removeEventListener('pageshow', show)
    }
  }, [])
  useEffect(() => {
    if (!loading && section.current) section.current.hidden = false
    const target = focus.current
    if (!target || loading || error || !section.current) return
    focus.current = undefined
    const links = Array.from(
      section.current.querySelectorAll<HTMLAnchorElement>('a[data-result-id]')
    )
    const link =
      'anchor' in target
        ? links.find((a) => a.dataset.resultId === target.anchor)
        : links.find((a) => !target.prior.has(a.dataset.resultId ?? ''))
    if (link && 'top' in target) {
      link.focus({ preventScroll: true })
      window.scrollBy(0, link.getBoundingClientRect().top - target.top)
    } else (link ?? older.current ?? section.current).focus()
  }, [page, loading, error])
  const remember = (item: SportsResult, top: number) => {
    lastVisit = {
      scope,
      entry: window.history.state?.key,
      position: {
        pages: pageCount.current,
        anchor: item.id,
        top,
        settledAt: item.settledAt,
      },
    }
  }
  const items = page?.items.filter((item) => !hides(item.groupSlugs))
  const retry = () => setRequest((r) => ({ ...r, attempt: r.attempt + 1 }))
  return (
    <section
      ref={section}
      tabIndex={-1}
      aria-label="Results"
      aria-busy={loading}
      className="py-3"
    >
      {!!items?.length && (
        <ul className="bg-canvas-0 border-ink-200 divide-ink-200 divide-y overflow-hidden rounded-lg border">
          {items.map((item) => (
            <ResultRow key={item.id} item={item} remember={remember} />
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
          {!page?.nextCursor && (
            <button
              className="text-primary-700 min-h-[44px] px-2 font-medium"
              onClick={retry}
            >
              Retry
            </button>
          )}
        </div>
      )}
      {!loading && !error && items?.length === 0 && (
        <p className="text-ink-600 py-4 text-sm">
          {page?.nextCursor
            ? 'No visible results on this page.'
            : league
            ? 'No settled markets for this sport and league.'
            : 'No settled markets to show.'}
        </p>
      )}
      {page?.nextCursor && (
        <button
          ref={older}
          aria-disabled={loading}
          onClick={() => {
            if (loading) return
            focus.current = {
              prior: new Set(page.items.map((item) => item.id)),
            }
            setRequest({ cursor: page.nextCursor ?? undefined, attempt: 0 })
          }}
          className="border-ink-300 text-ink-800 mt-3 min-h-[44px] rounded-md border px-4 text-sm font-medium"
        >
          {error ? 'Retry older results' : 'Older results'}
        </button>
      )}
    </section>
  )
}
function ResultRow({
  item,
  remember,
}: {
  item: SportsResult
  remember: (item: SportsResult, top: number) => void
}) {
  const time = new Date(item.settledAt),
    score = item.finalScore
  return (
    <li>
      <Link
        href={item.href}
        data-result-id={item.id}
        onClick={(e) => {
          if (
            e.button === 0 &&
            !e.metaKey &&
            !e.ctrlKey &&
            !e.shiftKey &&
            !e.altKey
          )
            remember(item, e.currentTarget.getBoundingClientRect().top)
        }}
        className="hover:bg-canvas-50 focus-visible:ring-primary-600 block min-w-0 px-3 py-3 focus-visible:ring-2 focus-visible:ring-inset"
      >
        <div className="text-ink-500 flex flex-wrap items-center gap-x-2 text-xs">
          {item.league && <span>{item.league}</span>}
          <time dateTime={time.toISOString()}>
            Settled{' '}
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
            {score.qualifier === 'extra-time' && ' (after extra time)'}
            {score.qualifier === 'penalties' &&
              (score.penalties
                ? ' · Penalties: ' +
                  score.home +
                  ' ' +
                  score.penalties.home +
                  ' – ' +
                  score.away +
                  ' ' +
                  score.penalties.away
                : ' (decided on penalties)')}
          </div>
        )}
      </Link>
    </li>
  )
}
