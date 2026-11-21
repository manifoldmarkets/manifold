import { useEffect, useState } from 'react'
import type { SportsAttentionPage } from 'common/bdl/attention'
import type { SportsMarket } from 'common/sports'
import { api, APIError } from 'web/lib/api/api'
import { useAdmin } from 'web/hooks/use-admin'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'

type LegacyMarket = Pick<SportsMarket, 'id' | 'question' | 'url' | 'closeTime'>
const action =
  'text-primary-700 min-h-[40px] rounded px-2 text-sm underline disabled:opacity-50'

export function AdminSportsAttention({ overdue }: { overdue: LegacyMarket[] }) {
  const user = useUser()
  const isAdmin = useAdmin()
  const authorized = useIsAuthorized()
  return authorized && isAdmin && user ? (
    <AttentionQueue key={user.id} overdue={overdue} />
  ) : (
    <SelectedLeagueOverdue markets={overdue} />
  )
}

type PageState =
  | { kind: 'ready'; page: SportsAttentionPage }
  | { kind: 'unavailable' | 'denied' | 'error' }

const providerLabels = {
  odds: 'The Odds API',
  unknown: 'Unknown provider',
  bdl: 'BALLDONTLIE',
  'football-data': 'football-data.org',
}

function queueStatus(state: PageState | undefined, page: number) {
  switch (state?.kind) {
    case undefined:
      return 'Loading attention queue…'
    case 'unavailable':
      return 'The cross-provider queue is unavailable on this API version.'
    case 'denied':
      return 'Admin access is required to view this queue.'
    case 'error':
      return 'Could not load the attention queue.'
    case 'ready':
      if (state.page.items.length > 0) return `Page ${page}`
      return page === 1
        ? 'No markets need attention.'
        : 'No further markets need attention.'
  }
}

function AttentionQueue({ overdue }: { overdue: LegacyMarket[] }) {
  // A cursor belongs to the previous page. Refresh starts again at the oldest item.
  const [cursors, setCursors] = useState<string[]>([])
  const [response, setResponse] = useState<{
    cursors: string[]
    state: PageState
  }>()
  const state = response?.cursors === cursors ? response.state : undefined

  useEffect(() => {
    const controller = new AbortController()
    const receive = (state: PageState) => {
      if (!controller.signal.aborted) setResponse({ cursors, state })
    }
    void api(
      'admin-sports-bdl-attention',
      { cursor: cursors[cursors.length - 1] },
      { cache: 'no-store', signal: controller.signal }
    ).then(
      (page) => receive({ kind: 'ready', page }),
      (error: unknown) => {
        const code = error instanceof APIError ? error.code : undefined
        receive({
          kind:
            code === 404
              ? 'unavailable'
              : code === 401 || code === 403
              ? 'denied'
              : 'error',
        })
      }
    )
    return () => controller.abort()
  }, [cursors])

  const retry = state?.kind === 'error' || state?.kind === 'unavailable'
  const next = state?.kind === 'ready' ? state.page.nextCursor : null
  return (
    <section
      aria-label="Cross-provider attention queue"
      className="min-w-0 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <h3 className="text-ink-900 font-semibold">All providers</h3>
        <button
          type="button"
          className={action}
          onClick={() => setCursors(retry ? [...cursors] : [])}
        >
          {retry ? 'Retry page' : 'Refresh queue'}
        </button>
      </div>
      <div role="status" className="text-ink-600 text-sm">
        {queueStatus(state, cursors.length + 1)}
      </div>
      {(state?.kind === 'unavailable' || state?.kind === 'error') && (
        <SelectedLeagueOverdue markets={overdue} />
      )}
      {state?.kind === 'ready' && state.page.items.length > 0 && (
        <ul className="divide-ink-200 divide-y">
          {state.page.items.map((item) => (
            <li
              key={item.id}
              className="min-w-0 space-y-1 py-3 text-sm [overflow-wrap:anywhere]"
            >
              <p className="text-ink-900 font-semibold">{item.question}</p>
              <p className="text-ink-600">
                {providerLabels[item.provider]}
                {item.league && ` · ${item.league}`}
              </p>
              <p className="text-ink-800">{item.reason}</p>
              <p className="text-ink-600">
                Since <Timestamp value={item.since} />
              </p>
              {item.href && (
                <a
                  href={item.href}
                  className="text-primary-700 inline-block py-1 underline"
                >
                  Review market for resolution or N/A
                  <span className="sr-only"> — {item.question}</span>
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      {(cursors.length > 0 || next) && (
        <nav
          aria-label="Attention queue pages"
          className="flex flex-wrap gap-2"
        >
          <button
            type="button"
            className={action}
            disabled={!cursors.length}
            onClick={() => setCursors(cursors.slice(0, -1))}
          >
            Previous page
          </button>
          <button
            type="button"
            className={action}
            disabled={!next}
            onClick={() => next && setCursors([...cursors, next])}
          >
            Next page
          </button>
        </nav>
      )}
    </section>
  )
}

function Timestamp({ value }: { value: number | null }) {
  if (value === null) return <>unknown</>
  const date = new Date(value)
  return (
    <time dateTime={date.toISOString()}>
      {date.toLocaleString(undefined, {
        timeZone: 'UTC',
        timeZoneName: 'short',
      })}
    </time>
  )
}

function SelectedLeagueOverdue({ markets }: { markets: LegacyMarket[] }) {
  const [handled, setHandled] = useState<string[]>([])
  const visible = markets.filter((market) => !handled.includes(market.id))
  return (
    <section
      aria-label="Selected league overdue markets"
      className="min-w-0 space-y-2 text-sm"
    >
      <h4 className="text-ink-800 font-medium">
        Selected league overdue markets
      </h4>
      {visible.length === 0 ? (
        <p className="text-ink-600">
          No unhandled overdue markets in the loaded list. Refresh the selected
          league in Market Status.
        </p>
      ) : (
        <ul className="divide-ink-200 divide-y">
          {visible.map((market) => (
            <li
              key={market.id}
              className="flex flex-wrap items-center justify-between gap-x-3 py-2"
            >
              <div className="min-w-0 [overflow-wrap:anywhere]">
                <a className="text-primary-700 underline" href={market.url}>
                  {market.question}
                </a>
                <p className="text-ink-600">
                  Closed <Timestamp value={market.closeTime} />
                </p>
              </div>
              <button
                className={action}
                type="button"
                onClick={() => setHandled([...handled, market.id])}
              >
                Mark handled
              </button>
            </li>
          ))}
        </ul>
      )}
      {handled.length > 0 && (
        <button type="button" className={action} onClick={() => setHandled([])}>
          Show handled markets
        </button>
      )}
    </section>
  )
}
