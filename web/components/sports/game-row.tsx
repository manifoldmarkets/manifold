import { ChevronDownIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import dayjs from 'dayjs'
import { useEffect, useRef, useState } from 'react'
import { formatJustTime } from 'client-common/lib/time'
import {
  ScheduleGame,
  ScheduleTeam,
  SPORT_BY_KEY,
  teamDisplayName,
} from 'common/sports-schedule'
import { shortFormatNumber } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { GameRelatedMarkets } from 'web/components/sports/game-related-markets'
import {
  Flag,
  MatchOutcome,
  SportsMatch,
} from 'web/components/sports/sports-match-card'
import {
  SportsBetPanel,
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

/**
 * One game on the schedule: kickoff, the two teams with their prices, and an
 * expander that reveals every related market (props, totals, side-bets).
 * Modelled on the game rows of DraftKings / Polymarket: the prices are the
 * bet buttons, the row itself opens the "+N more" panel.
 */
export function GameRow(props: {
  game: ScheduleGame
  showLeague?: boolean
  defaultExpanded?: boolean
  className?: string
}) {
  const { game, showLeague, defaultExpanded, className } = props
  const [expanded, setExpanded] = useState(!!defaultExpanded)
  const [betOutcome, setBetOutcome] = useState<MatchOutcome | null>(null)
  const user = useUser()

  const live = game.status === 'live'
  const finished = game.status === 'finished'
  const canBet = !finished
  const sport = SPORT_BY_KEY[game.sport]

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
    track('bet intent', { location: 'sports schedule', outcome })
    setBetOutcome(outcome)
  }

  const toggle = () => {
    track('sports game expand', { contractId: game.id, expanded: !expanded })
    setExpanded((e) => !e)
  }

  return (
    <div
      className={clsx(
        'bg-canvas-0 border-ink-200 rounded-lg border transition-colors',
        expanded ? 'border-ink-300 shadow-sm' : 'hover:border-ink-300',
        className
      )}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => {
          // Only when the row itself is focused: the price chips inside are
          // real buttons and handle their own Enter / Space.
          if (e.target !== e.currentTarget) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggle()
          }
        }}
        aria-expanded={expanded}
        className="grid cursor-pointer grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-x-2 px-2 py-2 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto] sm:gap-x-3 sm:px-3"
      >
        {/* Kickoff / live clock / final */}
        <Col className="items-start gap-0.5 self-start pt-1">
          {live ? (
            <>
              <Row className="items-center gap-1 text-[11px] font-semibold text-red-600">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                LIVE
              </Row>
              {game.liveScore?.minute && (
                <span className="text-ink-600 text-xs tabular-nums">
                  {game.liveScore.minute === 'HT'
                    ? 'HT'
                    : `${game.liveScore.minute}'`}
                </span>
              )}
            </>
          ) : finished ? (
            <>
              <span className="text-ink-600 text-xs font-semibold">
                {game.isResolved ? 'Final' : 'Ended'}
              </span>
              <span className="text-ink-500 text-[11px]">
                {dayjs(game.startTime).format('ddd')}
              </span>
            </>
          ) : (
            <>
              {!game.kickoffKnown && (
                <span className="text-ink-400 text-[10px] uppercase tracking-wide">
                  Closes
                </span>
              )}
              <span className="text-ink-900 text-sm font-medium tabular-nums">
                {formatJustTime(game.startTime).replace(':00', '')}
              </span>
              <span className="text-ink-500 text-[11px]">
                {startsSoonLabel(game.startTime) ??
                  dayjs(game.startTime).format('ddd D')}
              </span>
            </>
          )}
          {showLeague && sport && (
            <span className="text-ink-400 mt-0.5 text-[10px] font-semibold uppercase tracking-wide">
              {sport.label}
            </span>
          )}
          {game.source === 'community' && (
            <span
              className="bg-ink-100 text-ink-500 mt-0.5 rounded px-1 text-[9px] font-semibold uppercase tracking-wide"
              title={`Created by @${game.creatorUsername}`}
            >
              Community
            </span>
          )}
        </Col>

        {/* Teams + prices */}
        <Col className="min-w-0 gap-1">
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

        {/* Expander */}
        <Col className="items-end gap-1 self-center">
          <Row
            className={clsx(
              'items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium transition-colors',
              expanded ? 'text-primary-700 bg-primary-50' : 'text-ink-500'
            )}
          >
            <span className="hidden sm:inline">
              {game.relatedCount > 0 ? `${game.relatedCount} more` : 'Details'}
            </span>
            <span className="sm:hidden">
              {game.relatedCount > 0 ? `+${game.relatedCount}` : ''}
            </span>
            <ChevronDownIcon
              className={clsx(
                'h-4 w-4 transition-transform',
                expanded && 'rotate-180'
              )}
            />
          </Row>
          <span className="text-ink-400 hidden text-[11px] sm:block">
            Ṁ{shortFormatNumber(game.volume)} · {game.uniqueBettorCount} traders
          </span>
        </Col>
      </div>

      {expanded && <GameRelatedMarkets game={game} />}

      {betOutcome &&
        (game.draw ? (
          <SportsBetPanel
            match={toSportsMatch(game)}
            initialOutcome={betOutcome}
            onClose={() => setBetOutcome(null)}
          />
        ) : (
          <SportsVersusBetDialog
            contractId={game.id}
            onClose={() => setBetOutcome(null)}
          />
        ))}
    </div>
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
        <span className="sm:hidden">{teamDisplayName(team.name)}</span>
        <span className="hidden sm:inline">{team.name}</span>
        {won && <span className="text-ink-600 ml-1 text-xs">✓</span>}
      </span>
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
  return (
    <span className="bg-ink-100 text-ink-600 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold">
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
        'w-14 shrink-0 rounded-md py-1 text-center text-sm font-semibold tabular-nums transition-colors sm:w-16',
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

export function GameRowSkeleton() {
  return (
    <div className="border-ink-200 bg-canvas-0 animate-pulse rounded-lg border px-3 py-2.5">
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] gap-3">
        <div className="bg-ink-100 h-4 w-12 rounded" />
        <Col className="gap-2">
          <div className="bg-ink-100 h-5 w-2/3 rounded" />
          <div className="bg-ink-100 h-5 w-1/2 rounded" />
        </Col>
        <div className="bg-ink-100 h-4 w-16 rounded" />
      </div>
    </div>
  )
}
