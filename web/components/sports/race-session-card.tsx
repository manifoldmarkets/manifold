import { ChevronRightIcon, UsersIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import Link from 'next/link'
import { ReactNode, useState } from 'react'
import { formatJustTime } from 'client-common/lib/time'
import {
  RACE_CARD_LEADERS,
  raceDisplayName,
  RaceMarketRef,
  RaceSessionEvent,
  topRaceMarket,
} from 'common/race-weekends'
import { shortFormatNumber } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import {
  GameLinkedMarkets,
  RelatedHost,
} from 'web/components/sports/game-related-markets'
import { SportsAnswerBetDialog } from './sports-bet-panel'
import { SportsMarketBadge } from './sports-market-badge'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'

export const marketPath = (
  m: Pick<RaceMarketRef, 'creatorUsername' | 'slug'>
) => `/${m.creatorUsername}/${m.slug}`

/** Where a session's card is, so the featured session can point at it. */
export const raceSessionAnchor = (id: string) =>
  `f1-${id.replace(/[^a-z0-9]+/gi, '-')}`

/** "Mexico City Grand Prix qualifying": the session, for screen readers. */
export const sessionTitle = (e: RaceSessionEvent) =>
  `${raceDisplayName(e.weekend.name)} ${e.session.label.toLowerCase()}`

/**
 * What a session's props and side markets hang under: its winner market, which
 * a market made from "Add a market" links to.
 */
export function relatedHost(e: RaceSessionEvent): RelatedHost | undefined {
  const main = e.session.markets[0]
  if (!main) return undefined
  return {
    id: main.id,
    sport: 'f1',
    question: `${e.weekend.name} ${e.session.label.toLowerCase()}`,
    closeTime: e.closeTime,
    related: e.session.related ?? [],
  }
}

/**
 * A bet on one driver of one market, from any chip or tile on the card.
 * `onClose` runs when the dialog closes, so the caller can re-read prices.
 */
export function useDriverBet(location: string, onClose?: () => void) {
  const user = useUser()
  const [bet, setBet] = useState<{ contractId: string; answerId: string }>()
  const open = (contractId: string, answerId: string) => {
    if (!user) {
      firebaseLogin()
      return
    }
    track('bet intent', { location, outcome: 'driver' })
    setBet({ contractId, answerId })
  }
  // Kept outside the clickable rows: clicks in a portal still bubble up the
  // React tree.
  const dialog = bet && (
    <SportsAnswerBetDialog
      contractId={bet.contractId}
      answerId={bet.answerId}
      onClose={() => {
        setBet(undefined)
        onClose?.()
      }}
    />
  )
  return { open, dialog }
}

export type OnBet = (contractId: string, answerId: string) => void

/**
 * An F1 session in the game feed, like a game: when it starts, its markets'
 * leading drivers to bet on, and the markets people made about it.
 */
export function RaceSessionCard(props: {
  event: RaceSessionEvent
  variant?: 'card' | 'compact'
}) {
  const { event, variant = 'card' } = props
  const { session, weekend } = event
  const main = session.markets[0]
  // What it's traded and ranked by, and where its link goes.
  const top = topRaceMarket(session)
  const host = relatedHost(event)
  const bet = useDriverBet(`sports f1 ${variant}`)
  const title = sessionTitle(event)
  const heading = (
    <h3 className="text-ink-900 min-w-0 text-sm font-semibold leading-snug">
      <span aria-hidden className="mr-1">
        🏎️
      </span>
      {raceDisplayName(weekend.name)}
      <span className="text-ink-500 font-normal"> · {session.label}</span>
    </h3>
  )

  if (variant === 'compact') {
    return (
      <section
        id={raceSessionAnchor(event.id)}
        className="bg-canvas-0 border-ink-200 scroll-mt-32 overflow-hidden rounded-xl border"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 p-3 sm:grid-cols-[7rem_minmax(0,1fr)_auto]">
          <div className="col-span-2 mb-2 flex flex-wrap items-center gap-2 sm:col-span-1 sm:mb-0 sm:flex-col sm:items-start">
            <SessionWhen event={event} stackOnWide />
          </div>
          <Col className="min-w-0 gap-1.5">
            {heading}
            {/* Every market: with no featured card in this view, the podium
                is nowhere else (F4213-12). */}
            {session.markets.map((m) => (
              <MarketLine
                key={m.id}
                market={m}
                leaders={m.leaders.slice(0, RACE_CARD_LEADERS)}
                onBet={bet.open}
              />
            ))}
          </Col>
          {top && (
            <Link
              href={marketPath(top)}
              aria-label={`Open ${title}`}
              className={clsx(CONTROL_CLASS, ACTION_CLASS, 'self-start')}
            >
              Ṁ{shortFormatNumber(event.volume)}
              <ChevronRightIcon className="h-4 w-4" aria-hidden />
            </Link>
          )}
        </div>
        {host && <GameLinkedMarkets game={host} label={title} />}
        {bet.dialog}
      </section>
    )
  }

  return (
    <div
      id={raceSessionAnchor(event.id)}
      className="bg-canvas-0 border-ink-200 hover:border-primary-300 scroll-mt-32 overflow-hidden rounded-xl border transition-colors"
    >
      <Row className="min-h-[3rem] flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <SessionWhen event={event} />
          {main && <SportsMarketBadge market={main} />}
        </div>
        <SessionControls
          volume={event.volume}
          traders={event.uniqueBettorCount}
          market={top}
          title={title}
        />
      </Row>
      <Col className="gap-2 px-4 pb-3">
        {heading}
        {session.markets.map((m) => (
          <MarketLine
            key={m.id}
            market={m}
            leaders={m.leaders.slice(0, RACE_CARD_LEADERS)}
            onBet={bet.open}
          />
        ))}
      </Col>
      {host && <GameLinkedMarkets game={host} label={title} />}
      {bet.dialog}
    </div>
  )
}

export const CONTROL_CLASS =
  'text-ink-500 inline-flex h-8 min-w-[2rem] shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-2 text-xs font-medium tabular-nums'
export const ACTION_CLASS =
  'border-transparent hover:bg-primary-100 hover:text-primary-700 focus-visible:ring-primary-500 transition-colors focus-visible:ring-2'

/** Traded, traders, and the way to the market, as on a game card. */
export function SessionControls(props: {
  volume: number
  traders: number
  market: RaceMarketRef | undefined
  title: string
}) {
  const { volume, traders, market, title } = props
  return (
    <div
      role="group"
      aria-label="Session activity and actions"
      className="flex shrink-0 items-center gap-1"
    >
      <span
        className={clsx(CONTROL_CLASS, 'border-transparent')}
        title={`Ṁ${shortFormatNumber(volume)} traded`}
      >
        Ṁ{shortFormatNumber(volume)}
        <span className="sr-only">traded</span>
      </span>
      <span
        className={clsx(CONTROL_CLASS, 'border-transparent')}
        title={`${traders} traders`}
      >
        <UsersIcon className="h-4 w-4" aria-hidden />
        {shortFormatNumber(traders)}
        <span className="sr-only">traders</span>
      </span>
      {market && (
        <Link
          href={marketPath(market)}
          aria-label={`Open ${title}`}
          title="Market page"
          className={clsx(CONTROL_CLASS, ACTION_CLASS, 'w-8 !px-0')}
        >
          <ChevronRightIcon className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </div>
  )
}

/** When a session is: its start (and how soon), in progress, or over. */
function SessionWhen(props: {
  event: RaceSessionEvent
  stackOnWide?: boolean
}) {
  const { event, stackOnWide } = props
  const time = formatJustTime(event.startTime).replace(':00', '')
  const primary: ReactNode =
    event.status === 'live' ? (
      <span className="whitespace-nowrap text-[11px] font-semibold text-red-600">
        In progress
      </span>
    ) : event.status === 'finished' ? (
      <span className="text-ink-600 text-xs font-semibold">
        {event.session.markets.every((m) => m.isResolved)
          ? 'Final'
          : 'Awaiting result'}
      </span>
    ) : (
      <span className="text-ink-900 text-sm font-medium tabular-nums">
        {time}
      </span>
    )
  // The day is in the feed's day heading.
  const secondary =
    event.status === 'live'
      ? `Started ${time}`
      : event.status === 'finished'
      ? null
      : startsSoon(event.startTime)
  return (
    <Row
      className={clsx(
        'min-w-0 items-baseline gap-2',
        stackOnWide && 'sm:flex-col sm:items-start sm:gap-0'
      )}
    >
      {primary}
      {secondary && (
        <div className="text-ink-500 text-xs tabular-nums">{secondary}</div>
      )}
    </Row>
  )
}

/** A market's label and its leading drivers as chips; a chip opens a bet. */
function MarketLine(props: {
  market: RaceMarketRef
  leaders: RaceMarketRef['leaders']
  onBet: OnBet
  className?: string
}) {
  const { market, leaders, onBet, className } = props
  const more = market.answerCount - leaders.length
  return (
    <div
      className={clsx(
        'flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3',
        className
      )}
    >
      <Link
        href={marketPath(market)}
        className="text-ink-500 hover:text-primary-700 w-24 shrink-0 text-[11px] font-semibold uppercase tracking-wide"
      >
        {market.label}
      </Link>
      <Row className="min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {leaders.map((l) => (
          <button
            key={l.answerId}
            type="button"
            disabled={market.isResolved}
            onClick={() => onBet(market.id, l.answerId)}
            aria-label={
              l.won
                ? `${l.name}: won`
                : `Bet on ${
                    l.name
                  }, ${market.label.toLowerCase()} (${Math.round(
                    l.prob * 100
                  )}%)`
            }
            className={clsx(
              'bg-canvas-50 text-ink-800 hover:bg-primary-100 focus-visible:ring-primary-500 disabled:hover:bg-canvas-50 inline-flex min-h-[28px] max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-xs transition-colors focus-visible:ring-2 disabled:cursor-default',
              l.won && 'ring-1 ring-teal-500'
            )}
          >
            <TeamDot color={l.color} />
            <span className="truncate">{l.shortName ?? l.name}</span>
            <span
              className={clsx(
                'font-semibold tabular-nums',
                l.won ? 'text-teal-700' : 'text-ink-900'
              )}
            >
              {l.won ? '✓' : `${Math.round(l.prob * 100)}%`}
            </span>
          </button>
        ))}
        {more > 0 && !market.isResolved && (
          <Link
            href={marketPath(market)}
            className="text-ink-500 hover:text-primary-700 text-xs"
          >
            +{more} more
          </Link>
        )}
      </Row>
    </div>
  )
}

export function TeamDot(props: { color: string | null }) {
  return (
    <span
      aria-hidden
      className="bg-ink-300 h-2 w-2 shrink-0 rounded-full"
      style={props.color ? { backgroundColor: props.color } : undefined}
    />
  )
}

/** "in 45m" / "in 3h" within the next 12 hours, like a game's kickoff. */
export function startsSoon(startTime: number, now = Date.now()) {
  const diff = startTime - now
  if (diff <= 0 || diff > 12 * 60 * 60 * 1000) return null
  const mins = Math.round(diff / 60_000)
  if (mins < 60) return `in ${mins}m`
  const hours = Math.floor(mins / 60)
  const rem = mins % 60
  return rem >= 15 && hours < 4 ? `in ${hours}h ${rem}m` : `in ${hours}h`
}
