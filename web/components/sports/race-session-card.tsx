import { ChevronRightIcon, HeartIcon, UsersIcon } from '@heroicons/react/solid'
import { HeartIcon as OutlineHeartIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import Link from 'next/link'
import { ReactNode, useState } from 'react'
import { formatJustTime } from 'client-common/lib/time'
import {
  driverCode,
  RACE_CARD_LEADERS,
  raceDisplayName,
  RaceMarketRef,
  RaceSessionEvent,
  topRaceMarket,
} from 'common/race-weekends'
import { SPORT_LEAGUE_LABEL } from 'common/sports-calendar'
import { readableTextColor } from 'common/sports-team-colors'
import { shortFormatNumber } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import {
  GameLinkedMarkets,
  RelatedHost,
} from 'web/components/sports/game-related-markets'
import { PriceChip } from 'web/components/sports/game-row'
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

/** A heart on F1 markets, as on a game card. */
export type MarketLike = {
  liked: boolean
  disabled: boolean
  toggle: () => void
}
/** The heart for some of a weekend's markets, as `raceHeart` decides it. */
export type LikeFor = (ids: string[], target: string) => MarketLike

/**
 * An F1 session in the game feed, like a game: when it starts, its first
 * market's favourites to bet on as a game card's teams, the session's other
 * market on a line, and the markets people made about it.
 */
export function RaceSessionCard(props: {
  event: RaceSessionEvent
  variant?: 'card' | 'compact'
  /** Say it's Formula 1, as a game card says its league. */
  showLeague?: boolean
  likeFor?: LikeFor
}) {
  const { event, variant = 'card', showLeague, likeFor } = props
  const { session, weekend } = event
  const [main, ...others] = session.markets
  // What it's traded and ranked by, and where its link goes.
  const top = topRaceMarket(session)
  const host = relatedHost(event)
  const bet = useDriverBet(`sports f1 ${variant}`)
  const title = sessionTitle(event)
  const like =
    likeFor && top
      ? likeFor(
          session.markets.map((m) => m.id),
          top.id
        )
      : undefined
  const name = raceDisplayName(weekend.name)
  // "F1", its titles' label: "Formula 1" wraps a half-width card's header.
  const league = showLeague && (
    <span
      title={SPORT_LEAGUE_LABEL.f1}
      className="text-ink-400 truncate text-[10px] font-semibold uppercase tracking-wide"
    >
      F1
    </span>
  )
  // Two drivers, as a game has two teams, so it's about a game's size. Every
  // other market gets a line: in the compact view, with no featured card, the
  // podium is nowhere else (F4213-12). The heading opens the first market,
  // which the chevron doesn't when another is more traded (F4222-08).
  const body = main && (
    <>
      <h3 className="text-ink-900 truncate text-sm font-semibold leading-snug">
        <Link href={marketPath(main)} className="hover:text-primary-700">
          {name}
          <span className="text-ink-500 font-normal"> · {main.label}</span>
        </Link>
      </h3>
      <div
        className={clsx(
          'min-w-0',
          variant === 'compact'
            ? 'grid gap-x-5 gap-y-2 sm:grid-cols-2'
            : 'flex flex-col gap-1.5 sm:gap-1'
        )}
      >
        {main.leaders.slice(0, 2).map((l) => (
          <DriverLine
            key={l.answerId}
            market={main}
            leader={l}
            onBet={bet.open}
          />
        ))}
      </div>
      {others.map((m) => (
        <MarketLine
          key={m.id}
          market={m}
          leaders={m.leaders.slice(0, RACE_CARD_LEADERS)}
          onBet={bet.open}
        />
      ))}
    </>
  )

  if (variant === 'compact') {
    return (
      <section
        id={raceSessionAnchor(event.id)}
        className="bg-canvas-0 border-ink-200 scroll-mt-32 overflow-hidden rounded-xl border"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 p-3 sm:grid-cols-[7rem_minmax(0,1fr)_auto]">
          <div className="col-span-2 mb-2 flex flex-wrap items-center gap-2 sm:col-span-1 sm:mb-0 sm:flex-col sm:items-start">
            <div className="flex flex-wrap items-center gap-1.5 sm:items-start">
              {main && <SportsMarketBadge market={main} />}
              <SessionWhen event={event} stackOnWide />
            </div>
            {league}
          </div>
          <Col className="min-w-0 gap-1.5">{body}</Col>
          <div className="flex flex-col items-end gap-2 self-start">
            {like && <LikeButton like={like} title={title} />}
            {top && (
              <Link
                href={marketPath(top)}
                aria-label={`Open ${title}`}
                className={clsx(CONTROL_CLASS, ACTION_CLASS)}
              >
                Ṁ{shortFormatNumber(event.volume)}
                <ChevronRightIcon className="h-4 w-4" aria-hidden />
              </Link>
            )}
          </div>
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
          {league}
        </div>
        <SessionControls
          volume={event.volume}
          traders={event.uniqueBettorCount}
          market={top}
          title={title}
          like={like}
        />
      </Row>
      {body && <Col className="gap-1.5 px-4 pb-3 sm:gap-1">{body}</Col>}
      {host && <GameLinkedMarkets game={host} label={title} />}
      {bet.dialog}
    </div>
  )
}

export const CONTROL_CLASS =
  'text-ink-500 inline-flex h-8 min-w-[2rem] shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-2 text-xs font-medium tabular-nums'
export const ACTION_CLASS =
  'border-transparent hover:bg-primary-100 hover:text-primary-700 focus-visible:ring-primary-500 transition-colors focus-visible:ring-2'

/** Traded, traders, the heart and the way to the market, as on a game card. */
export function SessionControls(props: {
  volume: number
  traders: number
  market: RaceMarketRef | undefined
  title: string
  like?: MarketLike
}) {
  const { volume, traders, market, title, like } = props
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
      {like && <LikeButton like={like} title={title} />}
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

/** A game card's heart, for a session's markets. */
function LikeButton(props: { like: MarketLike; title: string }) {
  const { like, title } = props
  const Icon = like.liked ? HeartIcon : OutlineHeartIcon
  return (
    <button
      type="button"
      onClick={like.toggle}
      disabled={like.disabled}
      aria-pressed={like.liked}
      aria-label={`${like.liked ? 'Unlike' : 'Like'} ${title}`}
      title={like.liked ? 'Unlike' : 'Like'}
      className={clsx(
        CONTROL_CLASS,
        ACTION_CLASS,
        'w-8 !px-0 disabled:opacity-50',
        like.liked && '!text-primary-600'
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
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

/**
 * One of a market's favourites as a game card's team: the driver's code in
 * the team colour, the name, and the price to bet on.
 */
function DriverLine(props: {
  market: RaceMarketRef
  leader: RaceMarketRef['leaders'][number]
  onBet: OnBet
}) {
  const { market, leader, onBet } = props
  const pct = Math.round(leader.prob * 100)
  // "Other" is nobody in particular: no team colour, no code.
  const color = leader.other ? null : leader.color
  return (
    <Row className="min-w-0 items-center gap-2">
      <span
        aria-hidden
        className={clsx(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold',
          !color && 'bg-ink-100 text-ink-600'
        )}
        style={
          color
            ? { backgroundColor: color, color: readableTextColor(color) }
            : undefined
        }
      >
        {!leader.other && driverCode(leader.name)}
      </span>
      <span
        className={clsx(
          'min-w-0 flex-1 truncate text-sm',
          leader.won
            ? 'text-ink-1000 font-semibold'
            : 'text-ink-900 font-medium'
        )}
      >
        <span className="sm:hidden">{leader.shortName ?? leader.name}</span>
        <span className="hidden sm:inline">{leader.name}</span>
      </span>
      {market.isResolved ? (
        <span className="text-ink-500 w-16 text-right text-xs tabular-nums sm:w-20">
          {leader.won ? (
            <span className="font-semibold text-teal-700">✓ Won</span>
          ) : (
            `${pct}%`
          )}
        </span>
      ) : (
        <PriceChip
          prob={leader.prob}
          onClick={() => onBet(market.id, leader.answerId)}
          label={`Bet on ${leader.name}, ${market.label.toLowerCase()}`}
        />
      )}
    </Row>
  )
}

/**
 * A market's label and its leading drivers, on a line under a card's drivers:
 * codes rather than names, so three fit. A chip opens a bet.
 */
function MarketLine(props: {
  market: RaceMarketRef
  leaders: RaceMarketRef['leaders']
  onBet: OnBet
}) {
  const { market, leaders, onBet } = props
  return (
    // The chips go under the label together when they don't fit beside it.
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pt-1">
      <Link
        href={marketPath(market)}
        className="text-ink-500 hover:text-primary-700 shrink-0 text-[11px] font-semibold uppercase tracking-wide"
      >
        {market.label}
      </Link>
      <Row className="min-w-0 flex-auto flex-wrap items-center gap-1.5">
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
              'bg-canvas-50 text-ink-800 hover:bg-primary-100 focus-visible:ring-primary-500 disabled:hover:bg-canvas-50 inline-flex min-h-[28px] max-w-full items-center gap-1 rounded-full px-1.5 py-0.5 text-xs transition-colors focus-visible:ring-2 disabled:cursor-default',
              l.won && 'ring-1 ring-teal-500'
            )}
          >
            <TeamDot color={l.color} />
            <span className="truncate">
              {l.other ? 'Other' : driverCode(l.name)}
            </span>
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
