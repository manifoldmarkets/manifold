import { useEffect, useState } from 'react'
import { getGameDisplayTeams } from 'common/sports-game-feed'
import { formatSportsPrice } from 'common/sports-price'
import type { ScheduleGame } from 'common/sports-schedule'
import { gameScoreLabel, scoreboardDetailLines } from 'common/sports-scoreboard'
import { ScoreFreshness } from './score-freshness'

export function TeamScoreboard({
  game,
  onBet,
}: {
  game: ScheduleGame
  onBet?: (answerId: string) => void
}) {
  // The first browser render must use the same zone as the server.
  const [zone, setZone] = useState('UTC')
  useEffect(() => setZone(Intl.DateTimeFormat().resolvedOptions().timeZone), [])
  const dateText = (at: number, withTime = false) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      month: 'short',
      day: 'numeric',
      ...(withTime && { hour: 'numeric', minute: '2-digit' }),
      timeZoneName: 'short',
    }).format(at)
  const voided = game.isResolved && game.isCanceled
  const state = voided ? 'canceled' : game.gameState
  const awaiting = !state && !game.isResolved && game.status === 'finished'
  const label = voided
    ? 'Canceled'
    : gameScoreLabel(game, (time) => dateText(time)) ??
      (awaiting ? 'Awaiting result' : null)
  const final = state === 'final' || (!state && game.isResolved)
  const settling = state === 'settling'
  const canceled = state === 'canceled'
  const live = state === 'live' || (!state && game.status === 'live')
  const ended = final || settling || awaiting
  const showScores = ended || live || state === 'suspended'
  const lastScoreIsFinal = ['FINAL', 'FINISHED', 'AWARDED'].includes(
    game.liveScore?.status.toUpperCase() ?? ''
  )
  const scores = ended
    ? game.finalScore ?? (lastScoreIsFinal ? game.liveScore : null)
    : game.liveScore
  const allowScoreDetails =
    showScores && (!ended || !!game.finalScore || lastScoreIsFinal)
  const draw =
    final &&
    (game.draw
      ? game.winnerAnswerId === game.draw.answerId
      : game.sport === 'nfl' &&
        !game.winnerAnswerId &&
        game.finalScore != null &&
        game.finalScore.home === game.finalScore.away)
  const scheduled =
    state === 'scheduled' || (!state && game.status === 'upcoming')
  const date =
    scheduled || state === 'postponed'
      ? game.kickoffKnown && scheduled
        ? game.startTime
        : game.closeTime
      : null
  const regulation =
    game.sport === 'nhl'
      ? 3
      : game.sport === 'ncaab'
      ? 2
      : ['nba', 'wnba', 'wncaab', 'nfl'].includes(game.sport)
      ? 4
      : 0
  const periods =
    (allowScoreDetails && regulation && game.scoreboard?.periodScores) || []
  const start = Math.max(0, periods.length - 4)
  const visiblePeriods = periods.slice(start).map((score, i) => {
    const n = start + i + 1
    const prefix =
      game.sport === 'nhl' ? 'P' : game.sport === 'ncaab' ? 'H' : 'Q'
    const label =
      n <= regulation
        ? prefix + n
        : n === regulation + 1
        ? 'OT'
        : n - regulation + 'OT'
    return { label, score }
  })
  const details = allowScoreDetails
    ? scoreboardDetailLines(
        periods.length
          ? {
              ...game,
              scoreboard: {
                ...game.scoreboard,
                periodScores: periods.slice(0, start),
              },
            }
          : game
      )
    : []
  const showFreshness =
    (live || state === 'suspended' || settling) &&
    (scores?.home != null ||
      scores?.away != null ||
      visiblePeriods.length > 0 ||
      details.length > 0 ||
      !!game.clock ||
      !!game.period ||
      !!game.liveScore?.minute ||
      !!game.liveScore?.clock)
  const showPrices = !canceled && (!showScores || !!onBet)

  return (
    <section
      aria-label={`${game.home.name} and ${game.away.name} scoreboard`}
      className="@container border-ink-200 bg-canvas-0 text-ink-900 min-w-0 rounded-xl border"
    >
      <header className="border-ink-200 bg-canvas-50 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-t-xl border-b px-4 py-3">
        <span className="text-ink-600 min-w-0 text-xs font-semibold uppercase tracking-wider [overflow-wrap:anywhere]">
          {game.league}
        </span>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm font-semibold">
          {settling ? (
            <details className="text-ink-700">
              <summary
                className="min-h-[40px] cursor-pointer py-2.5"
                title="Results are checked before payout."
              >
                {label}
              </summary>
              <p className="mb-2 text-xs font-normal">
                Results are checked before payout.
              </p>
            </details>
          ) : (
            label && (
              <span className="inline-flex items-center gap-1">
                {live && (
                  <span
                    aria-hidden
                    className="bg-scarlet-500 h-2 w-2 rounded-full"
                  />
                )}
                {live && label !== 'In progress' && 'Live · '}
                {label}
                {voided && ' · N/A'}
              </span>
            )
          )}
          {date != null && Number.isFinite(new Date(date).getTime()) && (
            <span>
              {(!game.kickoffKnown || state === 'postponed') && 'Closes '}
              <time dateTime={new Date(date).toISOString()}>
                {dateText(date, true)}
              </time>
            </span>
          )}
        </div>
      </header>
      <div className="@[24rem]:px-5 px-4 py-3">
        <table className="w-full table-fixed text-left">
          <thead className="text-ink-600 text-xs">
            <tr>
              <th scope="col" className="font-medium">
                Team
              </th>
              {visiblePeriods.map(({ label }) => (
                <th
                  scope="col"
                  key={label}
                  className="text-ink-500 @[24rem]:w-7 w-5 text-center text-[10px] font-medium"
                >
                  {label}
                </th>
              ))}
              {showScores && !canceled && (
                <th scope="col" className="w-10 text-right font-medium">
                  Score
                </th>
              )}
              {showPrices && (
                <th scope="col" className="w-[4.25rem] text-right font-medium">
                  Chance
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {getGameDisplayTeams(game).map(({ team, side }) => (
              <tr key={side} className="border-ink-100 border-b last:border-0">
                <th
                  scope="row"
                  className="break-words py-2 pr-2 align-middle leading-tight"
                >
                  <span className="text-ink-600 block text-[11px] font-medium">
                    {side === 'home' ? 'Home' : 'Away'}
                  </span>
                  <span className="@[24rem]:text-lg text-base">
                    {team.name}
                  </span>
                  {final && game.winnerAnswerId === team.answerId && (
                    <span className="text-primary-700 ml-2 inline-block text-xs">
                      Winner
                    </span>
                  )}
                </th>
                {visiblePeriods.map(({ label, score }) => (
                  <td
                    key={label}
                    className="text-ink-500 text-center text-xs tabular-nums"
                  >
                    {score[side] ?? '—'}
                  </td>
                ))}
                {showScores && !canceled && (
                  <td className="text-right text-2xl font-semibold tabular-nums">
                    {scores?.[side] ?? '—'}
                  </td>
                )}
                {showPrices && (
                  <td className="text-right font-semibold tabular-nums">
                    {onBet &&
                    team.prob != null &&
                    Number.isFinite(team.prob) &&
                    team.prob > 0 &&
                    team.prob < 1 ? (
                      <button
                        type="button"
                        aria-label={
                          'Bet on ' +
                          team.name +
                          ' at ' +
                          formatSportsPrice(team.prob)
                        }
                        className="bg-primary-100 text-primary-700 hover:bg-primary-200 min-h-[44px] min-w-[64px] rounded-lg px-2 py-1"
                        onClick={() => onBet(team.answerId)}
                      >
                        {formatSportsPrice(team.prob)}
                      </button>
                    ) : (
                      formatSportsPrice(team.prob)
                    )}
                  </td>
                )}
              </tr>
            ))}
            {game.draw && !showScores && !canceled && (
              <tr>
                <th
                  scope="row"
                  className="text-ink-600 py-2 text-sm font-medium"
                >
                  Draw
                </th>
                <td className="text-right font-semibold tabular-nums">
                  {formatSportsPrice(game.draw.prob)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {draw && (
          <div className="text-ink-700 mt-1 text-right text-sm font-semibold">
            {game.draw ? 'Draw' : 'Tie'}
          </div>
        )}
      </div>
      {game.scoreboard?.standings && <TeamStandings game={game} />}
      {(details.length > 0 || showFreshness) && (
        <footer className="border-ink-200 text-ink-600 [&_button]:text-ink-600 flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2 text-xs tabular-nums [&_button]:min-h-[40px]">
          {details.map((line) => (
            <span key={line}>{line}</span>
          ))}
          {showFreshness && (
            <ScoreFreshness updatedTime={game.scoreUpdatedTime} />
          )}
        </footer>
      )}
    </section>
  )
}

function TeamStandings({ game }: { game: ScheduleGame }) {
  const rows = getGameDisplayTeams(game).flatMap(({ side, team }) => {
    const record = game.scoreboard?.standings?.[side]
    if (!record) return []
    const overtimeLosses =
      'overtimeLosses' in record &&
      typeof record.overtimeLosses === 'number' &&
      Number.isSafeInteger(record.overtimeLosses) &&
      record.overtimeLosses >= 0
        ? record.overtimeLosses
        : undefined
    return [{ team, record, overtimeLosses }]
  })
  if (!rows.length) return null
  rows.sort(
    (a, b) =>
      (a.record.rank ?? Number.MAX_SAFE_INTEGER) -
      (b.record.rank ?? Number.MAX_SAFE_INTEGER)
  )
  const ranked = rows.some(({ record }) => record.rank != null)
  const hasOvertimeLosses = rows.some(
    ({ overtimeLosses }) => overtimeLosses != null
  )
  const tied = rows.some(({ record }) => record.ties != null)
  return (
    <div className="border-ink-200 border-t px-4 py-3">
      <table className="w-full text-right text-xs tabular-nums">
        <caption className="text-ink-700 mb-1 text-left text-sm font-semibold">
          Standings
        </caption>
        <thead className="text-ink-600">
          <tr>
            <th scope="col" className="text-left">
              Team
            </th>
            {ranked && (
              <th scope="col" className="px-1">
                Rank
              </th>
            )}
            <th scope="col" className="px-1">
              Wins
            </th>
            <th scope="col" className="px-1">
              Losses
            </th>
            {hasOvertimeLosses && (
              <th scope="col" className="px-1">
                <abbr title="Overtime losses">OTL</abbr>
              </th>
            )}
            {tied && (
              <th scope="col" className="px-1">
                Ties
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ team, record, overtimeLosses }) => (
            <tr key={team.answerId}>
              <th
                scope="row"
                className="py-1 pr-1 text-left font-medium [overflow-wrap:anywhere]"
              >
                {team.name}
              </th>
              {ranked && <td className="px-1">{record.rank ?? '—'}</td>}
              <td className="px-1">{record.wins}</td>
              <td className="px-1">{record.losses}</td>
              {hasOvertimeLosses && (
                <td className="px-1">{overtimeLosses ?? '—'}</td>
              )}
              {tied && <td className="px-1">{record.ties ?? '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
