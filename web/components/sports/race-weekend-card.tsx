import clsx from 'clsx'
import dayjs from 'dayjs'
import Link from 'next/link'
import { RaceMarketRef, RaceSession, RaceWeekend } from 'common/race-weekends'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'

/**
 * F1 weekends, a card each: above the game feed on /sports while one is on
 * or coming up, and the F1 page's main content.
 */
export function RaceWeekends(props: {
  weekends: RaceWeekend[]
  className?: string
}) {
  const { weekends, className } = props
  if (weekends.length === 0) return null
  return (
    <Col className={clsx('gap-3', className)}>
      {weekends.map((w) => (
        <RaceWeekendCard key={w.id} weekend={w} />
      ))}
    </Col>
  )
}

export function RaceWeekendCard(props: { weekend: RaceWeekend }) {
  const { weekend } = props
  const last = weekend.sessions[weekend.sessions.length - 1]
  return (
    <Col className="border-ink-200 bg-canvas-0 overflow-hidden rounded-lg border">
      <Row className="items-center justify-between gap-3 px-4 pb-2 pt-3">
        <Row className="min-w-0 items-center gap-2">
          <span aria-hidden className="text-lg">
            🏎️
          </span>
          <Col className="min-w-0">
            <span className="text-ink-900 truncate text-base font-semibold">
              {weekend.name}
            </span>
            <span className="text-ink-500 text-xs">
              Formula 1 ·{' '}
              {dateRange(
                weekend.startTime,
                last?.startTime ?? weekend.startTime
              )}
            </span>
          </Col>
        </Row>
        {weekend.status === 'live' && <LiveTag />}
      </Row>
      <Col className="divide-ink-100 border-ink-100 divide-y border-t">
        {weekend.sessions.map((s) => (
          <SessionRow key={s.sessionId} session={s} />
        ))}
      </Col>
    </Col>
  )
}

function SessionRow(props: { session: RaceSession }) {
  const { session } = props
  return (
    <Col className="gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
      <Row className="items-baseline justify-between gap-2 sm:w-36 sm:shrink-0 sm:flex-col sm:items-start sm:gap-0.5">
        <span className="text-ink-900 text-sm font-semibold">
          {session.label}
        </span>
        <SessionWhen session={session} />
      </Row>
      <Col className="min-w-0 flex-1 gap-2">
        {session.markets.map((m) => (
          <MarketLine key={m.id} market={m} />
        ))}
      </Col>
    </Col>
  )
}

function SessionWhen(props: { session: RaceSession }) {
  const { session } = props
  if (session.status === 'live')
    return (
      <span className="text-scarlet-600 text-xs font-semibold">
        In progress
      </span>
    )
  if (session.status === 'finished')
    return (
      <span className="text-ink-500 text-xs">
        {session.markets.every((m) => m.isResolved)
          ? 'Final'
          : 'Awaiting result'}
      </span>
    )
  const soon = startsSoon(session.startTime)
  return (
    <span className="text-ink-500 text-xs tabular-nums">
      {dayjs(session.startTime).format('ddd h:mm A')}
      {soon && <span className="text-ink-700 ml-1 font-medium">{soon}</span>}
    </span>
  )
}

function MarketLine(props: { market: RaceMarketRef }) {
  const { market } = props
  const more = market.answerCount - market.leaders.length
  return (
    <Link
      href={`/${market.creatorUsername}/${market.slug}`}
      aria-label={`${market.question}: ${market.leaders
        .map((l) => `${l.name} ${Math.round(l.prob * 100)}%`)
        .join(', ')}`}
      className="hover:bg-canvas-50 border-ink-100 -mx-2 flex min-w-0 flex-col gap-1.5 rounded-md border px-2 py-1.5 sm:flex-row sm:items-center sm:gap-3"
    >
      <span className="text-ink-500 w-24 shrink-0 text-[11px] font-semibold uppercase tracking-wide">
        {market.label}
      </span>
      <Row className="min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {market.leaders.map((l) => (
          <span
            key={l.answerId}
            className={clsx(
              'bg-canvas-50 text-ink-800 inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-xs',
              l.won && 'ring-1 ring-teal-500'
            )}
          >
            <span
              aria-hidden
              className="bg-ink-300 h-2 w-2 shrink-0 rounded-full"
              style={l.color ? { backgroundColor: l.color } : undefined}
            />
            <span className="truncate">{l.shortName ?? l.name}</span>
            <span
              className={clsx(
                'font-semibold tabular-nums',
                l.won ? 'text-teal-700' : 'text-ink-900'
              )}
            >
              {l.won ? '✓' : `${Math.round(l.prob * 100)}%`}
            </span>
          </span>
        ))}
        {more > 0 && !market.isResolved && (
          <span className="text-ink-500 text-xs">+{more} more</span>
        )}
      </Row>
    </Link>
  )
}

function LiveTag() {
  return (
    <span className="bg-scarlet-500/10 text-scarlet-600 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
      Live
    </span>
  )
}

/** "Oct 30 – Nov 1", or one day. */
function dateRange(from: number, to: number) {
  const a = dayjs(from)
  const b = dayjs(to)
  if (a.isSame(b, 'day')) return a.format('MMM D')
  return a.isSame(b, 'month')
    ? `${a.format('MMM D')} – ${b.format('D')}`
    : `${a.format('MMM D')} – ${b.format('MMM D')}`
}

/** "in 45m" / "in 3h" within the next 12 hours, like a game's kickoff. */
function startsSoon(startTime: number, now = Date.now()) {
  const diff = startTime - now
  if (diff <= 0 || diff > 12 * 60 * 60 * 1000) return null
  const mins = Math.round(diff / 60_000)
  if (mins < 60) return `in ${mins}m`
  const hours = Math.floor(mins / 60)
  const rem = mins % 60
  return rem >= 15 && hours < 4 ? `in ${hours}h ${rem}m` : `in ${hours}h`
}
