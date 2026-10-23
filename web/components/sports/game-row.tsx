import { ChevronRightIcon, HeartIcon, UsersIcon } from '@heroicons/react/solid'
import { HeartIcon as OutlineHeartIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import dayjs from 'dayjs'
import Link from 'next/link'
import { ReactNode, useEffect, useRef, useState } from 'react'
import { formatJustTime } from 'client-common/lib/time'
import {
  ScheduleGame,
  ScheduleTeam,
  teamDisplayName,
} from 'common/sports-schedule'
import { readableTextColor } from 'common/sports-team-colors'
import { formatMoney, shortFormatNumber } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { GameLinkedMarkets } from 'web/components/sports/game-related-markets'
import { ScoreFreshness } from './score-freshness'
import { SportsMarketBadge } from './sports-market-badge'
import { SportHeroBackground } from './sport-hero-background'
import { getGameDisplayTeams } from './game-feed-utils'
import {
  backsOutcome,
  GameStake,
  hasOutcomeStake,
  OutcomeStake,
  profitLabel,
} from './game-positions'
import {
  Flag,
  MatchOutcome,
  SportsMatch,
} from 'web/components/sports/sports-match-card'
import {
  SportsThreeWayBetDialog,
  SportsVersusBetDialog,
} from 'web/components/sports/sports-bet-panel'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'

function gamePath(game: ScheduleGame) {
  return `/${game.creatorUsername}/${game.slug}`
}

/** "in 45m" / "in 3h" for games starting within the next 12 hours. */
function startsSoonLabel(startTime: number, now = Date.now()) {
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
          updatedTime: g.scoreUpdatedTime,
        }
      : undefined,
  }
}

/** Anchor for a game's card on its sport page. */
const gameAnchor = (game: Pick<ScheduleGame, 'id'>) => `game-${game.id}`

/**
 * One game: when it starts (or the live score), the two teams with their
 * prices as the bet buttons, and the draw for soccer.
 * Card, compact row, or featured scoreboard, with related markets below.
 */
export function GameRow(props: {
  game: ScheduleGame
  variant?: 'card' | 'featured' | 'compact'
  showLeague?: boolean
  className?: string
  liked?: boolean
  likeDisabled?: boolean
  onToggleLike?: () => void
  /** The signed-in account's stake on this game, marked to its live prices. */
  stake?: GameStake
  /** Called when a bet dialog closes, so the caller can re-read positions. */
  onPositionsChange?: () => void
}) {
  const {
    game,
    variant = 'card',
    showLeague,
    className,
    liked,
    likeDisabled,
    onToggleLike,
    stake,
    onPositionsChange,
  } = props
  const [betOutcome, setBetOutcome] = useState<MatchOutcome | null>(null)
  const user = useUser()
  const stakeOn = (answerId: string | undefined) =>
    answerId ? stake?.byAnswer[answerId] : undefined
  const closeDialog = () => {
    setBetOutcome(null)
    onPositionsChange?.()
  }
  const LikeIcon = liked ? HeartIcon : OutlineHeartIcon

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

  const drawWon = !!game.draw && game.winnerAnswerId === game.draw.answerId
  const displayTeams = getGameDisplayTeams(game)
  const matchupLabel = game.draw
    ? `${game.home.name} vs ${game.away.name}`
    : `${game.away.name} at ${game.home.name}`

  const gameControlClassName =
    'text-ink-500 inline-flex h-8 min-w-[2rem] shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-2 text-xs font-medium tabular-nums'
  const gameActionClassName =
    'border-transparent hover:bg-primary-100 hover:text-primary-700 focus-visible:ring-primary-500 transition-colors focus-visible:ring-2'
  const likeButton = onToggleLike && (
    <button
      type="button"
      onClick={onToggleLike}
      disabled={likeDisabled}
      aria-pressed={!!liked}
      aria-label={`${liked ? 'Unlike' : 'Like'} ${matchupLabel}`}
      title={liked ? 'Unlike' : 'Like'}
      className={clsx(
        gameControlClassName,
        gameActionClassName,
        'w-8 !px-0 disabled:opacity-50',
        liked && '!text-primary-600'
      )}
    >
      <LikeIcon className="h-4 w-4" aria-hidden />
    </button>
  )
  const gameLink = (
    <Link
      href={gamePath(game)}
      aria-label={`Open ${matchupLabel} game page`}
      title="Game page"
      className={clsx(gameControlClassName, gameActionClassName, 'w-8 !px-0')}
    >
      <ChevronRightIcon className="h-4 w-4" aria-hidden />
    </Link>
  )
  const gameControls = (
    <div
      role="group"
      aria-label="Game activity and actions"
      className="flex shrink-0 items-center gap-1"
    >
      <span
        className={clsx(gameControlClassName, 'border-transparent')}
        title={`Ṁ${shortFormatNumber(game.volume)} traded`}
      >
        Ṁ{shortFormatNumber(game.volume)}
        <span className="sr-only">traded</span>
      </span>
      <span
        className={clsx(gameControlClassName, 'border-transparent')}
        title={`${game.uniqueBettorCount} traders`}
      >
        <UsersIcon className="h-4 w-4" aria-hidden />
        {shortFormatNumber(game.uniqueBettorCount)}
        <span className="sr-only">traders</span>
      </span>
      {likeButton}
      {gameLink}
    </div>
  )

  const onBet = (outcome: MatchOutcome) => {
    if (!user) {
      firebaseLogin()
      return
    }
    track('bet intent', { location: `sports ${variant}`, outcome })
    setBetOutcome(outcome)
  }

  const [firstTeam, secondTeam] = displayTeams.map(
    ({ team, side, outcome }) => (
      <TeamLine
        key={team.answerId}
        team={team}
        score={score?.[side] ?? null}
        won={game.winnerAnswerId === team.answerId}
        lost={
          finished && game.isResolved && game.winnerAnswerId !== team.answerId
        }
        live={live}
        finished={finished}
        canBet={canBet}
        onBet={() => onBet(outcome)}
        stake={stakeOn(team.answerId)}
      />
    )
  )
  // Home, Draw, away: the order of the three-way ticket's picker.
  const teams =
    variant === 'compact' && game.draw ? (
      <ThreeWayStrip
        game={game}
        teams={displayTeams}
        score={score}
        live={live}
        finished={finished}
        canBet={canBet}
        onBet={onBet}
        stake={stake}
      />
    ) : (
      <div
        className={clsx(
          'min-w-0',
          variant === 'compact'
            ? 'grid gap-x-5 gap-y-2 sm:grid-cols-2'
            : 'flex flex-col gap-1.5 sm:gap-1'
        )}
      >
        {firstTeam}
        {game.draw && (
          <Row className="items-center gap-2 pl-10">
            <Col className="min-w-0 flex-1 gap-0.5">
              <span
                className={clsx(
                  'text-xs',
                  drawWon ? 'text-ink-900 font-semibold' : 'text-ink-500'
                )}
              >
                Draw{drawWon && ' ✓'}
              </span>
              <StakeLine stake={stakeOn(game.draw.answerId)} />
            </Col>
            <PriceChip
              prob={game.draw.prob}
              muted
              disabled={!canBet}
              held={backsOutcome(stakeOn(game.draw.answerId))}
              onClick={(e) => {
                e.stopPropagation()
                onBet('draw')
              }}
              label="Bet on a draw"
            />
          </Row>
        )}
        {secondTeam}
      </div>
    )

  // Kept outside the clickable row: clicks in a portal still bubble up the
  // React tree, and would open the game.
  const dialog =
    betOutcome &&
    (game.draw ? (
      <SportsThreeWayBetDialog
        match={toSportsMatch(game)}
        initialOutcome={betOutcome}
        onClose={closeDialog}
      />
    ) : (
      <SportsVersusBetDialog
        contractId={game.id}
        initialAnswerId={
          betOutcome === 'teamB' ? game.away.answerId : game.home.answerId
        }
        onClose={closeDialog}
      />
    ))

  if (variant === 'compact') {
    return (
      <section
        id={gameAnchor(game)}
        className={clsx(
          'bg-canvas-0 border-ink-200 scroll-mt-32 overflow-hidden rounded-xl border',
          className
        )}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 p-3 sm:grid-cols-[7rem_minmax(0,1fr)_auto]">
          <div className="col-span-2 mb-2 flex flex-wrap items-center gap-2 sm:col-span-1 sm:mb-0 sm:flex-col sm:items-start">
            <div className="flex flex-wrap items-center gap-1.5 sm:items-start">
              <SportsMarketBadge market={game} />
              <GameWhen game={game} stackOnWide />
            </div>
            {showLeague && (
              <span className="text-ink-400 text-[10px] font-semibold">
                {game.league}
              </span>
            )}
          </div>
          {teams}
          <div className="flex flex-col items-end gap-2">
            {likeButton}
            <Link
              href={gamePath(game)}
              aria-label={`Open ${matchupLabel}`}
              className={clsx(gameControlClassName, gameActionClassName)}
            >
              Ṁ{shortFormatNumber(game.volume)}
              <ChevronRightIcon className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          {stake && (
            <PositionSummary
              stake={stake}
              href={gamePath(game)}
              className="border-ink-100 col-span-2 mt-2 border-t pt-2 sm:col-span-3"
            />
          )}
        </div>
        <GameLinkedMarkets game={game} />
        {dialog}
      </section>
    )
  }

  if (variant === 'featured') {
    return (
      <section
        id={gameAnchor(game)}
        className={clsx(
          'border-primary-200 bg-primary-50 scroll-mt-32 overflow-hidden rounded-2xl border',
          className
        )}
      >
        <GameLinkedMarkets
          game={game}
          matchup={
            <div className="relative isolate flex min-w-0 flex-col overflow-hidden">
              <SportHeroBackground sport={game.sport} scoreboard />
              <div className="flex items-center gap-2 px-4 py-2 sm:px-5">
                <div className="@container flex min-w-[1rem] flex-1 items-center gap-2">
                  <SportsMarketBadge market={game} />
                  <span className="text-primary-700 @[5rem]:not-sr-only sr-only whitespace-nowrap text-[10px] font-bold uppercase tracking-wide">
                    Featured
                  </span>
                </div>
                {gameControls}
              </div>
              <div className="@container/scoreboard mx-auto my-auto w-full max-w-md px-4 pb-5 pt-3 sm:px-5">
                <div className="text-ink-500 mb-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs">
                  <span>
                    {game.league} · {dayjs(game.startTime).format('ddd, MMM D')}
                  </span>
                  <GameWhen game={game} />
                </div>
                <div className="grid grid-cols-2 items-center gap-x-6 gap-y-2 text-center">
                  {displayTeams.map(({ team }, index) => (
                    <div
                      key={team.answerId}
                      className={clsx(
                        'row-start-1 justify-self-center',
                        index === 0 ? 'col-start-1' : 'col-start-2'
                      )}
                    >
                      <TeamBadge team={team} featured />
                    </div>
                  ))}
                  <div className="col-span-2 col-start-1 row-start-1 justify-self-center">
                    {score ? (
                      <span
                        className={clsx(
                          'text-ink-1000 @[22rem]/scoreboard:text-3xl whitespace-nowrap font-bold tabular-nums',
                          score.home >= 100 || score.away >= 100
                            ? '@[18rem]/scoreboard:text-2xl text-lg'
                            : 'text-2xl'
                        )}
                        aria-label={displayTeams
                          .map(
                            ({ team, side }) => `${team.name} ${score[side]}`
                          )
                          .join(', ')}
                      >
                        {score[displayTeams[0].side]}
                        <span className="text-ink-400 mx-1.5 font-normal">
                          –
                        </span>
                        {score[displayTeams[1].side]}
                      </span>
                    ) : (
                      <span className="text-ink-400 text-sm font-medium">
                        vs
                      </span>
                    )}
                  </div>
                  {displayTeams.map(({ team }, index) => (
                    <div
                      key={team.answerId}
                      className={clsx(
                        'row-start-2 min-w-0',
                        index === 0 ? 'col-start-1' : 'col-start-2'
                      )}
                    >
                      <h3 className="text-ink-1000 @[18rem]/scoreboard:text-base @[22rem]/scoreboard:text-lg flex min-h-[2.75rem] items-center justify-center text-sm font-bold leading-tight [text-wrap:balance]">
                        {team.name}
                      </h3>
                    </div>
                  ))}
                  {displayTeams.map(({ team, outcome }, index) => {
                    const held = backsOutcome(stakeOn(team.answerId))
                    return (
                      <PriceChip
                        key={team.answerId}
                        prob={team.prob}
                        disabled={!canBet}
                        held={held}
                        label={`Bet on ${team.name}`}
                        onClick={() => onBet(outcome)}
                        className={clsx(
                          'row-start-3 max-w-full justify-self-center shadow-sm',
                          !held &&
                            '!bg-canvas-0 hover:!bg-primary-600 hover:!text-ink-0',
                          game.draw
                            ? '@[22rem]/scoreboard:!w-24 !w-20'
                            : '!w-24',
                          index === 0 ? 'col-start-1' : 'col-start-2'
                        )}
                      />
                    )
                  })}
                  {game.draw && (
                    <button
                      type="button"
                      disabled={!canBet}
                      onClick={() => onBet('draw')}
                      aria-label={`Bet on a draw (${Math.round(
                        game.draw.prob * 100
                      )}%)${
                        backsOutcome(stakeOn(game.draw.answerId))
                          ? ', your pick'
                          : ''
                      }`}
                      className={clsx(
                        'text-primary-700 hover:bg-primary-100 focus-visible:ring-primary-500 col-span-2 col-start-1 row-start-3 min-h-[40px] justify-self-center rounded-lg px-2 text-xs font-semibold focus-visible:ring-2 disabled:opacity-60',
                        backsOutcome(stakeOn(game.draw.answerId)) &&
                          '!bg-primary-600 !text-ink-0 hover:!bg-primary-700'
                      )}
                    >
                      Draw
                      <br />
                      {Math.round(game.draw.prob * 100)}%
                    </button>
                  )}
                  {displayTeams.map(({ team }, index) => (
                    <StakeLine
                      key={team.answerId}
                      stake={stakeOn(team.answerId)}
                      className={clsx(
                        'row-start-4 justify-center',
                        index === 0 ? 'col-start-1' : 'col-start-2'
                      )}
                    />
                  ))}
                  {game.draw && (
                    <StakeLine
                      stake={stakeOn(game.draw.answerId)}
                      className="col-span-2 col-start-1 row-start-5 justify-center"
                    />
                  )}
                </div>
                {stake && (
                  <PositionSummary
                    stake={stake}
                    href={gamePath(game)}
                    className="border-primary-200 mt-4 border-t pt-2"
                  />
                )}
              </div>
            </div>
          }
        />
        {dialog}
      </section>
    )
  }

  return (
    <div
      id={gameAnchor(game)}
      className={clsx(
        'bg-canvas-0 border-ink-200 hover:border-primary-300 scroll-mt-32 overflow-hidden rounded-xl border transition-colors',
        className
      )}
    >
      <Row className="min-h-[3rem] flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <GameWhen game={game} />
          <SportsMarketBadge market={game} />
          {showLeague && (
            <span className="text-ink-400 truncate text-[10px] font-semibold uppercase tracking-wide">
              {game.league}
            </span>
          )}
        </div>
        {gameControls}
      </Row>
      <div className="px-4 pb-3">{teams}</div>
      {stake && (
        <PositionSummary
          stake={stake}
          href={gamePath(game)}
          className="border-ink-100 border-t px-4 py-2"
        />
      )}
      <GameLinkedMarkets game={game} />
      {dialog}
    </div>
  )
}

/**
 * When a game is: the kickoff time (and how soon), "In progress" with the score age, or
 * the final, displayed inline in a card header.
 */
function GameWhen(props: {
  game: ScheduleGame
  /** From sm up, put "in 1h 45m" under the time (the compact row's column). */
  stackOnWide?: boolean
}) {
  const { game, stackOnWide } = props
  const live = game.status === 'live'
  // A live feed (score / clock) is only available for some leagues; without
  // it the game says "In progress" rather than pretending to have a clock.
  const hasFeed = live && !!game.liveScore
  const finished = game.status === 'finished'
  const time = formatJustTime(game.startTime).replace(':00', '')

  let primary: ReactNode
  let secondary: ReactNode
  if (hasFeed) {
    primary = (
      <Row className="items-center gap-1 whitespace-nowrap text-[11px] font-semibold text-red-600">
        In progress
      </Row>
    )
    secondary = <ScoreFreshness updatedTime={game.scoreUpdatedTime} />
  } else if (live) {
    primary = (
      <span className="whitespace-nowrap text-[11px] font-semibold text-red-600">
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

function TeamLine(props: {
  team: ScheduleTeam
  score: number | null
  won: boolean
  lost: boolean
  live: boolean
  finished: boolean
  canBet: boolean
  onBet: () => void
  stake?: OutcomeStake
}) {
  const { team, score, won, lost, live, finished, canBet, onBet, stake } = props
  return (
    <Row className="min-w-0 items-center gap-2">
      <TeamBadge team={team} />
      <Col className="min-w-0 flex-1 gap-0.5">
        <span
          className={clsx(
            'truncate text-sm',
            won ? 'text-ink-1000 font-semibold' : 'text-ink-900 font-medium',
            lost && 'text-ink-500 line-through decoration-transparent'
          )}
        >
          <span className="sm:hidden">{mobileTeamName(team)}</span>
          <span className="hidden sm:inline">{team.name}</span>
        </span>
        <StakeLine stake={stake} />
      </Col>
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
          held={backsOutcome(stake)}
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

/**
 * A three-way game's compact row: home, Draw and away side by side, each a
 * name over its price, so the Draw sits between the teams at any width.
 */
function ThreeWayStrip(props: {
  game: ScheduleGame
  teams: ReturnType<typeof getGameDisplayTeams>
  score: { home: number; away: number } | null
  live: boolean
  finished: boolean
  canBet: boolean
  onBet: (outcome: MatchOutcome) => void
  stake?: GameStake
}) {
  const { game, teams, score, live, finished, canBet, onBet, stake } = props
  const [first, second] = teams.map(({ team, side, outcome }) => {
    const won = game.winnerAnswerId === team.answerId
    const teamScore = score?.[side]
    return (
      <StripCell
        key={team.answerId}
        prob={team.prob}
        betLabel={`Bet on ${team.name}`}
        won={won}
        lost={finished && game.isResolved && !won}
        finished={finished}
        canBet={canBet}
        onBet={() => onBet(outcome)}
        stake={stake?.byAnswer[team.answerId]}
        reserveStake={!!stake}
      >
        <span className="@[7rem]:inline-flex hidden shrink-0">
          <TeamBadge team={team} small />
        </span>
        <span className="min-w-0 truncate">
          <span className="@[12rem]:hidden">{mobileTeamName(team)}</span>
          <span className="@[12rem]:inline hidden">{team.name}</span>
        </span>
        {teamScore != null && (
          <span
            className={clsx(
              'shrink-0 font-semibold tabular-nums',
              live && 'text-red-600'
            )}
          >
            {teamScore}
          </span>
        )}
      </StripCell>
    )
  })
  const draw = game.draw
  const drawWon = !!draw && game.winnerAnswerId === draw.answerId
  return (
    <div className="grid min-w-0 grid-cols-3 gap-2">
      {first}
      {draw && (
        <StripCell
          prob={draw.prob}
          betLabel="Bet on a draw"
          muted
          won={drawWon}
          lost={finished && game.isResolved && !drawWon}
          finished={finished}
          canBet={canBet}
          onBet={() => onBet('draw')}
          stake={stake?.byAnswer[draw.answerId]}
          reserveStake={!!stake}
        >
          Draw
        </StripCell>
      )}
      {second}
    </div>
  )
}

function StripCell(props: {
  prob: number
  betLabel: string
  muted?: boolean
  won: boolean
  lost: boolean
  finished: boolean
  canBet: boolean
  onBet: () => void
  children: ReactNode
  stake?: OutcomeStake
  /** Keep the cells level when another cell in the strip shows a stake. */
  reserveStake?: boolean
}) {
  const {
    prob,
    betLabel,
    muted,
    won,
    lost,
    finished,
    canBet,
    onBet,
    stake,
    reserveStake,
  } = props
  return (
    <div className="@container flex min-w-0 flex-col gap-1">
      <Row
        className={clsx(
          'h-5 min-w-0 items-center justify-center gap-1.5 text-xs',
          won
            ? 'text-ink-1000 font-semibold'
            : lost || muted
            ? 'text-ink-500'
            : 'text-ink-900 font-medium'
        )}
      >
        {props.children}
        {won && (
          <span className="shrink-0" aria-label="winner">
            ✓
          </span>
        )}
      </Row>
      {finished ? (
        <span className="text-ink-500 flex min-h-[40px] items-center justify-center text-xs tabular-nums">
          {Math.round(prob * 100)}%
        </span>
      ) : (
        <PriceChip
          prob={prob}
          muted={muted}
          disabled={!canBet}
          held={backsOutcome(stake)}
          onClick={(e) => {
            e.stopPropagation()
            onBet()
          }}
          label={betLabel}
          className="!w-full"
        />
      )}
      <StakeLine
        stake={stake}
        placeholder={reserveStake}
        compact
        className="justify-center"
      />
    </div>
  )
}

function TeamBadge({
  team,
  featured = false,
  small = false,
}: {
  team: ScheduleTeam
  featured?: boolean
  small?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const size = featured
    ? 'h-8 w-8 @[18rem]/scoreboard:h-10 @[18rem]/scoreboard:w-10'
    : small
    ? 'h-5 w-5'
    : 'h-8 w-8'
  if (team.imageUrl && !failed) {
    return (
      <img
        src={team.imageUrl}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={clsx(size, 'flex-shrink-0 rounded-full object-contain')}
      />
    )
  }
  if (team.flag) {
    return (
      <span
        className={clsx(size, 'flex flex-shrink-0 items-center justify-center')}
      >
        <Flag emoji={team.flag} name={team.name} />
      </span>
    )
  }
  const { color } = team
  return (
    <span
      className={clsx(
        size,
        'flex flex-shrink-0 items-center justify-center rounded-lg font-bold',
        featured ? 'text-xs' : small ? 'text-[7px]' : 'text-[10px]',
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

/**
 * The price is the bet button, as on every sportsbook. Filled in when the
 * account is paid if this outcome wins, so a card shows which side you're on.
 */
function PriceChip(props: {
  prob: number
  onClick: (e: React.MouseEvent) => void
  label: string
  disabled?: boolean
  muted?: boolean
  held?: boolean
  className?: string
}) {
  const { prob, onClick, label, disabled, muted, held, className } = props
  const pct = Math.round(prob * 100)
  const flash = useProbFlash(pct)
  return (
    <button
      type="button"
      aria-label={`${label} (${pct}%)${held ? ', your pick' : ''}`}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'focus-visible:ring-primary-500 min-h-[40px] w-16 shrink-0 rounded-lg py-2 text-center text-base font-bold tabular-nums transition-colors focus-visible:ring-2 sm:w-20',
        className,
        flash === 'up' && '!bg-teal-500/30 !text-teal-700',
        flash === 'down' && '!bg-scarlet-500/30 !text-scarlet-700',
        muted
          ? 'bg-canvas-50 text-ink-600 hover:bg-primary-100 hover:text-primary-800 border-ink-200 border text-xs'
          : 'bg-primary-50 text-primary-800 hover:bg-primary-600 hover:text-ink-0',
        // The price flash wins while it lasts.
        held &&
          !flash &&
          '!bg-primary-600 !text-ink-0 hover:!bg-primary-700 border-transparent',
        disabled &&
          'hover:bg-primary-50 hover:text-primary-800 cursor-default opacity-60'
      )}
    >
      {pct}%
    </button>
  )
}

/**
 * Under a team (or the draw): what the account is paid if it wins, and any
 * open limit orders on it. Nothing when the account has neither, unless a
 * placeholder is asked for to keep neighbouring cells level.
 */
function StakeLine(props: {
  stake?: OutcomeStake
  placeholder?: boolean
  /** A narrow strip cell: shorter order labels, and text may wrap. */
  compact?: boolean
  className?: string
}) {
  const { stake, placeholder, compact, className } = props
  if (!stake || !hasOutcomeStake(stake)) {
    return placeholder ? (
      <div className={clsx('min-h-[1rem]', className)} aria-hidden />
    ) : null
  }
  const itemClassName = clsx(
    'inline-flex items-center gap-1 tabular-nums',
    compact ? 'min-w-0 text-center' : 'whitespace-nowrap'
  )
  return (
    <div
      className={clsx(
        'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-4',
        className
      )}
    >
      {backsOutcome(stake) && (
        <span className={clsx(itemClassName, 'text-primary-700 font-semibold')}>
          <span
            className="bg-primary-600 h-1.5 w-1.5 shrink-0 rounded-full"
            aria-hidden
          />
          Pays {formatMoney(stake.payoutIfWins)}
        </span>
      )}
      {stake.orders.map((order, i) => (
        <span key={i} className={clsx(itemClassName, 'text-ink-500')}>
          <span
            className="border-ink-400 h-1.5 w-1.5 shrink-0 rounded-full border"
            aria-hidden
          />
          <span className={compact ? 'sr-only' : undefined}>
            {order.against ? 'No' : 'Order'}{' '}
          </span>
          {order.against && compact ? 'No ' : ''}
          {formatMoney(order.amount)} at {Math.round(order.prob * 100)}%
        </span>
      ))}
    </div>
  )
}

/**
 * The account's stake on a game: what's in, what it's worth at the current
 * prices and the profit, plus open orders, with a link to the market to sell
 * or add.
 */
function PositionSummary(props: {
  stake: GameStake
  href: string
  className?: string
}) {
  const { stake, href, className } = props
  const profit = profitLabel(stake.profit)
  return (
    <Row
      className={clsx(
        'text-ink-600 min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] tabular-nums',
        className
      )}
    >
      <span
        className="bg-primary-600 h-1.5 w-1.5 shrink-0 rounded-full"
        aria-hidden
      />
      <span className="sr-only">Your position:</span>
      {stake.hasShares && (
        <>
          <span className="whitespace-nowrap">
            {formatMoney(stake.invested)} in
          </span>
          <span className="text-ink-400" aria-hidden>
            ·
          </span>
          <span className="whitespace-nowrap">
            Worth {formatMoney(stake.value)}
          </span>
          <span
            className={clsx(
              'whitespace-nowrap font-semibold',
              profit.className
            )}
          >
            {profit.text}
          </span>
        </>
      )}
      {stake.openOrders > 0 && (
        <>
          {stake.hasShares && (
            <span className="text-ink-400" aria-hidden>
              ·
            </span>
          )}
          <span className="whitespace-nowrap">
            {stake.openOrders} open{' '}
            {stake.openOrders === 1 ? 'order' : 'orders'}
          </span>
        </>
      )}
      <Link
        href={href}
        className="text-primary-700 hover:text-primary-800 ml-auto whitespace-nowrap font-semibold"
      >
        Manage
      </Link>
    </Row>
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

export function GameRowSkeleton(props: { variant?: 'compact' | 'card' }) {
  const { variant = 'card' } = props
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
    <div className="border-ink-200 bg-canvas-0 animate-pulse rounded-xl border px-3 py-2.5">
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_4.5rem] gap-3">
        <div className="bg-ink-100 h-4 w-12 rounded" />
        {teams}
        <div className="bg-ink-100 ml-auto h-4 w-8 rounded" />
      </div>
    </div>
  )
}
