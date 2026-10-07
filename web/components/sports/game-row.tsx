import { ChevronRightIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import dayjs from 'dayjs'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { ReactNode, useEffect, useRef, useState } from 'react'
import { formatJustTime } from 'client-common/lib/time'
import {
  ScheduleGame,
  ScheduleTeam,
  SPORT_BY_KEY,
  teamDisplayName,
} from 'common/sports-schedule'
import { readableTextColor } from 'common/sports-team-colors'
import { shortFormatNumber } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { GameLinkedMarkets } from 'web/components/sports/game-related-markets'
import { sportPath } from 'web/components/sports/sport-rail'
import {
  Flag,
  MatchOutcome,
  SportsMatch,
} from 'web/components/sports/sports-match-card'
import {
  SportsBetPanel,
  SportsBinaryBetDialog,
  SportsVersusBetDialog,
} from 'web/components/sports/sports-bet-panel'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'

export function gamePath(game: ScheduleGame) {
  return `/${game.creatorUsername}/${game.slug}`
}

/** "in 45m" / "in 3h" for games starting within the next 12 hours. */
export function startsSoonLabel(startTime: number, now = Date.now()) {
  const diff = startTime - now
  if (diff <= 0 || diff > 12 * 60 * 60 * 1000) return null
  const mins = Math.round(diff / 60_000)
  if (mins < 60) return `in ${mins}m`
  const hours = Math.floor(mins / 60)
  const rem = mins % 60
  return rem >= 15 && hours < 4 ? `in ${hours}h ${rem}m` : `in ${hours}h`
}

export function toSportsMatch(g: ScheduleGame): SportsMatch {
  return {
    id: g.id,
    question: g.question,
    teamA: {
      name: g.home.name,
      flag: g.home.flag,
      prob: Math.round(g.home.prob * 100),
    },
    teamB: {
      name: g.away.name,
      flag: g.away.flag,
      prob: Math.round(g.away.prob * 100),
    },
    draw: { prob: Math.round((g.draw?.prob ?? 0) * 100) },
    hasDraw: !!g.draw,
    closeTime: formatJustTime(g.startTime),
    closeDateLabel: dayjs(g.startTime).format('MMM D'),
    closeTimeMs: g.startTime,
    resolutionTime: g.resolutionTime,
    volume: shortFormatNumber(g.volume),
    status: g.isResolved ? 'resolved' : 'upcoming',
    marketUrl: gamePath(g),
    contractId: g.id,
    isBinary: g.binary,
    teamAAnswerId: g.home.answerId,
    teamBAnswerId: g.away.answerId,
    drawAnswerId: g.draw?.answerId,
    liveScore: g.liveScore
      ? {
          home: g.liveScore.home,
          away: g.liveScore.away,
          minute: g.liveScore.minute,
        }
      : undefined,
  }
}

/** Anchor for a game's card on its sport page. */
export const gameAnchor = (game: Pick<ScheduleGame, 'id'>) => `game-${game.id}`

/**
 * One game: when it starts (or the live score), the two teams with their
 * prices as the bet buttons, and the draw for soccer.
 *  - `list`: a compact row for the all-sports feed; the row opens the game.
 *  - `card`: a card for a sport's page, with the markets on the game below.
 */
export function GameRow(props: {
  game: ScheduleGame
  variant?: 'list' | 'card'
  showLeague?: boolean
  className?: string
}) {
  const { game, variant = 'list', showLeague, className } = props
  const router = useRouter()
  const [betOutcome, setBetOutcome] = useState<MatchOutcome | null>(null)
  const user = useUser()

  const live = game.status === 'live'
  const finished = game.status === 'finished'
  const canBet = !finished

  const score =
    game.finalScore ??
    (game.liveScore &&
    game.liveScore.home != null &&
    game.liveScore.away != null
      ? { home: game.liveScore.home, away: game.liveScore.away }
      : null)

  const homeWon = game.winnerAnswerId === game.home.answerId
  const awayWon = game.winnerAnswerId === game.away.answerId
  const drawWon = !!game.draw && game.winnerAnswerId === game.draw.answerId

  const onBet = (outcome: MatchOutcome) => {
    if (!user) {
      firebaseLogin()
      return
    }
    track('bet intent', { location: `sports ${variant}`, outcome })
    setBetOutcome(outcome)
  }

  const teams = (
    <Col className="min-w-0 gap-1.5 sm:gap-1">
      <TeamLine
        team={game.home}
        score={score?.home ?? null}
        won={homeWon}
        lost={finished && game.isResolved && !homeWon}
        live={live}
        finished={finished}
        canBet={canBet}
        onBet={() => onBet('teamA')}
      />
      <TeamLine
        team={game.away}
        score={score?.away ?? null}
        won={awayWon}
        lost={finished && game.isResolved && !awayWon}
        live={live}
        finished={finished}
        canBet={canBet}
        onBet={() => onBet('teamB')}
      />
      {game.draw && (
        <Row className="items-center gap-2 pl-8">
          <span
            className={clsx(
              'text-xs',
              drawWon ? 'text-ink-900 font-semibold' : 'text-ink-500'
            )}
          >
            Draw{drawWon && ' ✓'}
          </span>
          <PriceChip
            prob={game.draw.prob}
            muted
            disabled={!canBet}
            onClick={(e) => {
              e.stopPropagation()
              onBet('draw')
            }}
            label="Bet on a draw"
            className="ml-auto"
          />
        </Row>
      )}
    </Col>
  )

  // Kept outside the clickable row: clicks in a portal still bubble up the
  // React tree, and would open the game.
  const dialog =
    betOutcome &&
    (game.binary ? (
      <SportsBinaryBetDialog
        contractId={game.id}
        match={toSportsMatch(game)}
        initialOutcome={betOutcome}
        onClose={() => setBetOutcome(null)}
      />
    ) : game.draw ? (
      <SportsBetPanel
        match={toSportsMatch(game)}
        initialOutcome={betOutcome}
        onClose={() => setBetOutcome(null)}
      />
    ) : (
      <SportsVersusBetDialog
        contractId={game.id}
        initialAnswerId={
          betOutcome === 'teamB' ? game.away.answerId : game.home.answerId
        }
        onClose={() => setBetOutcome(null)}
      />
    ))

  if (variant === 'card') {
    return (
      <div
        id={gameAnchor(game)}
        className={clsx(
          'bg-canvas-0 border-ink-200 scroll-mt-32 rounded-lg border',
          className
        )}
      >
        <Row className="border-ink-100 min-h-[2.5rem] items-center gap-2 border-b px-3 py-1.5">
          <GameWhen game={game} layout="inline" />
          {showLeague && (
            <span className="text-ink-400 truncate text-[10px] font-semibold uppercase tracking-wide">
              {game.league}
            </span>
          )}
          <Link
            href={gamePath(game)}
            className="text-ink-500 hover:text-primary-700 ml-auto flex shrink-0 items-center gap-1 text-xs"
          >
            <span className="hidden tabular-nums sm:inline">
              Ṁ{shortFormatNumber(game.volume)} · {game.uniqueBettorCount}{' '}
              {game.uniqueBettorCount === 1 ? 'trader' : 'traders'} ·
            </span>
            Game page
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </Link>
        </Row>
        <div className="px-3 py-3">{teams}</div>
        <GameLinkedMarkets game={game} />
        {dialog}
      </div>
    )
  }

  return (
    <div className={className}>
      {/* The row opens the game (a mouse convenience); the link on the right
          is the keyboard and screen-reader way in. */}
      <div
        role="presentation"
        onClick={() => router.push(gamePath(game))}
        className="hover:bg-canvas-50 grid cursor-pointer grid-cols-[3.75rem_minmax(0,1fr)_auto] items-center gap-x-2 px-2 py-2.5 transition-colors sm:grid-cols-[4.5rem_minmax(0,1fr)_4.5rem] sm:gap-x-3 sm:px-3"
      >
        <GameWhen game={game} layout="column" showLeague={showLeague} />
        {teams}
        <Col className="items-end gap-1 self-center">
          <Link
            href={gamePath(game)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Open ${game.home.name} vs ${game.away.name}`}
            className="text-ink-400 hover:text-primary-700 flex items-center gap-0.5 text-[11px] tabular-nums"
          >
            <span className="hidden sm:inline">
              Ṁ{shortFormatNumber(game.volume)}
            </span>
            <ChevronRightIcon className="h-4 w-4" />
          </Link>
          {game.relatedCount > 0 && (
            <Link
              href={`${sportPath(game.sport)}#${gameAnchor(game)}`}
              onClick={(e) => e.stopPropagation()}
              className="text-primary-700 hover:bg-primary-50 rounded px-1 text-[11px] font-medium"
            >
              +{game.relatedCount}
              <span className="hidden sm:inline"> markets</span>
            </Link>
          )}
        </Col>
      </div>
      {dialog}
    </div>
  )
}

/**
 * When a game is: the kickoff time (and how soon), "LIVE" with the clock, or
 * the final. A column in a feed row, one line in a card header.
 */
function GameWhen(props: {
  game: ScheduleGame
  layout: 'column' | 'inline'
  showLeague?: boolean
}) {
  const { game, layout, showLeague } = props
  const live = game.status === 'live'
  // A live feed (score / clock) is only available for some leagues; without
  // it the game says "In progress" rather than pretending to have a clock.
  const hasFeed = live && !!game.liveScore
  const finished = game.status === 'finished'
  const sport = SPORT_BY_KEY[game.sport]
  const time = formatJustTime(game.startTime).replace(':00', '')

  let primary: ReactNode
  let secondary: ReactNode
  if (hasFeed) {
    primary = (
      <Row className="items-center gap-1 text-[11px] font-semibold text-red-600">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
        LIVE
      </Row>
    )
    secondary = game.liveScore?.minute
      ? formatMinute(game.liveScore.minute)
      : null
  } else if (live) {
    primary = (
      <span className="text-[11px] font-semibold text-red-600">
        In progress
      </span>
    )
    secondary = `Started ${time}`
  } else if (finished) {
    primary = (
      <span className="text-ink-600 text-xs font-semibold">
        {game.isResolved ? 'Final' : 'Awaiting result'}
      </span>
    )
    secondary = dayjs(game.startTime).format('ddd')
  } else {
    primary = (
      <span className="text-ink-900 text-sm font-medium tabular-nums">
        {!game.kickoffKnown && (
          <span className="text-ink-400 mr-1 text-[10px] font-normal uppercase tracking-wide">
            Closes
          </span>
        )}
        {time}
      </span>
    )
    // The day is in the feed's day heading.
    secondary = startsSoonLabel(game.startTime)
  }

  if (layout === 'inline') {
    return (
      <Row className="min-w-0 items-baseline gap-2">
        {primary}
        {secondary && (
          <span className="text-ink-500 text-xs tabular-nums">{secondary}</span>
        )}
      </Row>
    )
  }
  return (
    <Col className="items-start gap-0.5 self-start pt-1">
      {primary}
      {secondary && (
        <span className="text-ink-500 text-[11px] tabular-nums">
          {secondary}
        </span>
      )}
      {showLeague && sport && (
        <span className="text-ink-400 mt-0.5 text-[10px] font-semibold uppercase tracking-wide">
          {sport.label}
        </span>
      )}
    </Col>
  )
}

function TeamLine(props: {
  team: ScheduleTeam
  score: number | null
  won: boolean
  lost: boolean
  live: boolean
  finished: boolean
  canBet: boolean
  onBet: () => void
}) {
  const { team, score, won, lost, live, finished, canBet, onBet } = props
  return (
    <Row className="min-w-0 items-center gap-2">
      <TeamBadge team={team} />
      <span
        className={clsx(
          'min-w-0 flex-1 truncate text-sm',
          won ? 'text-ink-1000 font-semibold' : 'text-ink-900 font-medium',
          lost && 'text-ink-500 line-through decoration-transparent'
        )}
      >
        <span className="sm:hidden">{mobileTeamName(team)}</span>
        <span className="hidden sm:inline">{team.name}</span>
      </span>
      {won && (
        <span className="text-ink-600 shrink-0 text-xs" aria-label="winner">
          ✓
        </span>
      )}
      {score != null && (
        <span
          className={clsx(
            'w-6 text-right text-sm font-semibold tabular-nums',
            live ? 'text-red-600' : won ? 'text-ink-1000' : 'text-ink-500'
          )}
        >
          {score}
        </span>
      )}
      {finished ? (
        <span className="text-ink-500 w-14 text-right text-xs tabular-nums sm:w-16">
          {Math.round(team.prob * 100)}%
        </span>
      ) : (
        <PriceChip
          prob={team.prob}
          disabled={!canBet}
          onClick={(e) => {
            e.stopPropagation()
            onBet()
          }}
          label={`Bet on ${team.name}`}
        />
      )}
    </Row>
  )
}

function TeamBadge({ team }: { team: ScheduleTeam }) {
  const [failed, setFailed] = useState(false)
  if (team.imageUrl && !failed) {
    return (
      <img
        src={team.imageUrl}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-6 w-6 flex-shrink-0 rounded-full object-contain"
      />
    )
  }
  if (team.flag) {
    return (
      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center">
        <Flag emoji={team.flag} name={team.name} />
      </span>
    )
  }
  const { color } = team
  return (
    <span
      className={clsx(
        'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
        !color && 'bg-ink-100 text-ink-600'
      )}
      style={
        color
          ? { backgroundColor: color, color: readableTextColor(color) }
          : undefined
      }
    >
      {team.shortName.slice(0, 3).toUpperCase()}
    </span>
  )
}

/** The price is the bet button, as on every sportsbook. */
export function PriceChip(props: {
  prob: number
  onClick: (e: React.MouseEvent) => void
  label: string
  disabled?: boolean
  muted?: boolean
  className?: string
}) {
  const { prob, onClick, label, disabled, muted, className } = props
  const pct = Math.round(prob * 100)
  const flash = useProbFlash(pct)
  return (
    <button
      type="button"
      aria-label={`${label} (${pct}%)`}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'w-14 shrink-0 rounded-md py-1.5 text-center text-sm font-semibold tabular-nums transition-colors sm:w-16 sm:py-1',
        className,
        flash === 'up' && '!bg-teal-500/30 !text-teal-700',
        flash === 'down' && '!bg-scarlet-500/30 !text-scarlet-700',
        muted
          ? 'bg-canvas-50 text-ink-600 hover:bg-primary-100 hover:text-primary-800 border-ink-200 border text-xs'
          : 'bg-primary-50 text-primary-800 hover:bg-primary-600 hover:text-ink-0',
        disabled &&
          'hover:bg-primary-50 hover:text-primary-800 cursor-default opacity-60'
      )}
    >
      {pct}%
    </button>
  )
}

/**
 * Phones get the pipeline's short name when it is a real name ("Man City"),
 * otherwise a nickname derived from the full name ("Chiefs"). Three-letter
 * codes (BRA, KC) are left to the badge.
 */
function mobileTeamName(team: ScheduleTeam) {
  const short = team.shortName?.trim()
  if (short && short !== team.name && short.length > 3) return short
  return teamDisplayName(team.name)
}

/** "67" → "67'", "HT" → "HT", "Q3 4:21" → as is. */
function formatMinute(minute: string) {
  return /^\d+(\+\d+)?$/.test(minute.trim()) ? `${minute.trim()}'` : minute
}

/** Tint a chip briefly when its price moves (green up, red down), like an odds board. */
function useProbFlash(pct: number): 'up' | 'down' | null {
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)
  const prev = useRef(pct)
  useEffect(() => {
    if (prev.current === pct) return
    setFlash(pct > prev.current ? 'up' : 'down')
    prev.current = pct
    const t = setTimeout(() => setFlash(null), 900)
    return () => clearTimeout(t)
  }, [pct])
  return flash
}

export function GameRowSkeleton(props: { variant?: 'list' | 'card' }) {
  const { variant = 'list' } = props
  const teams = (
    <Col className="gap-2">
      <div className="bg-ink-100 h-5 w-2/3 rounded" />
      <div className="bg-ink-100 h-5 w-1/2 rounded" />
    </Col>
  )
  if (variant === 'card') {
    return (
      <div className="border-ink-200 bg-canvas-0 animate-pulse rounded-lg border">
        <div className="border-ink-100 border-b px-3 py-3">
          <div className="bg-ink-100 h-4 w-24 rounded" />
        </div>
        <div className="px-3 py-3">{teams}</div>
        <div className="border-ink-100 border-t px-3 py-3">
          <div className="bg-ink-100 h-3 w-40 rounded" />
        </div>
      </div>
    )
  }
  return (
    <div className="animate-pulse px-3 py-2.5">
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_4.5rem] gap-3">
        <div className="bg-ink-100 h-4 w-12 rounded" />
        {teams}
        <div className="bg-ink-100 ml-auto h-4 w-8 rounded" />
      </div>
    </div>
  )
}
