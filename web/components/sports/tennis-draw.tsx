import { useEffect, useId, useState } from 'react'
import { LIVE_STALE_MS } from 'common/sports-schedule'
import type { TennisMatch, TennisRound } from 'common/bdl/tennis'
import { tennisRoundNames } from 'common/bdl/tennis'
import { formatSportsPrice } from 'common/sports-price'
import {
  tennisPicks,
  sameTennisPick,
  type TennisMarketSource,
  type TennisPick,
} from 'common/bdl/tennis-market'
const statusLabel: Record<TennisMatch['status'], string> = {
  scheduled: 'Scheduled',
  live: 'Live',
  final: 'Final',
  suspended: 'Suspended',
  canceled: 'Canceled',
  unavailable: 'Status unavailable',
}
type Freshness = { readStartedAt?: number | null; now?: number }
// The gallery supplies a local preview. Native submission requires a separately guarded order path.
type Ticket = {
  market: TennisMarketSource
  onPick: (pick: TennisPick, close: () => void) => React.ReactNode
}
type Props = Freshness & { match: TennisMatch; ticket?: Ticket }
export function TennisMatchCard({ match, readStartedAt, now, ticket }: Props) {
  const heading = useId(),
    [choice, setChoice] = useState<TennisPick>(),
    [, tick] = useState(0)
  const when = now ?? Date.now(),
    market = ticket?.market
  const fresh =
    readStartedAt != null &&
    Number.isSafeInteger(readStartedAt) &&
    readStartedAt >= 0 &&
    readStartedAt <= when &&
    when - readStartedAt < LIVE_STALE_MS
  const live = match.status === 'live' && fresh
  const deadline = fresh
    ? Math.min(
        readStartedAt! + LIVE_STALE_MS,
        market?.closeTime && market.closeTime > when
          ? market.closeTime
          : Infinity
      )
    : null
  useEffect(() => {
    if (deadline == null || now != null) return
    const timer = window.setTimeout(
      () => tick((n) => n + 1),
      Math.max(0, deadline - Date.now())
    )
    return () => window.clearTimeout(timer)
  }, [deadline, now])
  const picks = tennisPicks(match, market, readStartedAt, when)
  const selected =
    choice && picks.find((p) => p.buyable && sameTennisPick(p, choice))
  useEffect(() => {
    if (choice && !selected) setChoice(undefined)
  }, [choice, selected])
  const choose = (pick: TennisPick) => {
    const latest = tennisPicks(
      match,
      market,
      readStartedAt,
      now ?? Date.now()
    ).find((p) => p.buyable && sameTennisPick(p, pick))
    if (latest) setChoice(latest)
  }
  const status =
    match.attention === 'walkover'
      ? 'Walkover'
      : match.attention === 'retired'
      ? 'Retirement'
      : match.attention === 'defaulted'
      ? 'Default'
      : match.status === 'live' && !live
      ? 'Latest score'
      : statusLabel[match.status]
  const day = match.timing?.venueDay
  return (
    <article
      aria-labelledby={heading}
      className="border-ink-200 bg-canvas-0 min-w-0 rounded-lg border"
    >
      <header className="text-ink-600 flex flex-wrap items-center justify-between gap-2 px-3 pt-3 text-xs">
        <h3 id={heading} className="text-ink-800 font-medium">
          {match.tournament.name}
          {match.round && ' · ' + tennisRoundNames[match.round]}
        </h3>
        <span className="inline-flex items-center gap-1.5">
          {live && (
            <span aria-hidden className="bg-success-500 h-2 w-2 rounded-full" />
          )}
          {status}
        </span>
      </header>
      <ul className="divide-ink-100 divide-y px-3">
        {match.sides.map((side) => {
          const pick = picks.find((p) => p.entrantId === side.id)
          return (
            <li key={side.id} className="py-2">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <span className="text-ink-900 min-w-0 break-words font-semibold">
                  {side.name}
                  {side.id === match.winnerId && (
                    <>
                      <span aria-hidden className="text-success-700 ml-1">
                        ✓
                      </span>
                      <span className="sr-only"> Winner</span>
                    </>
                  )}
                </span>
                {pick &&
                  (pick.buyable ? (
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      aria-label={
                        'Pick ' +
                        side.name +
                        ' at ' +
                        formatSportsPrice(pick.probability)
                      }
                      onClick={() => choose(pick)}
                      className="border-primary-300 bg-primary-50 text-primary-800 hover:bg-primary-100 focus-visible:ring-primary-500 min-h-[44px] min-w-[76px] shrink-0 rounded-md border px-3 font-semibold tabular-nums focus-visible:ring-2"
                    >
                      {formatSportsPrice(pick.probability)}
                    </button>
                  ) : (
                    <span
                      aria-label={'Market price for ' + side.name}
                      className="text-ink-600 px-3 font-medium tabular-nums"
                    >
                      {formatSportsPrice(pick.probability)}
                    </span>
                  ))}
              </div>
              {!!side.sets.length && (
                <ol
                  aria-label={side.name + ' set scores'}
                  className="text-ink-600 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums"
                >
                  {side.sets.map((s, i) => (
                    <li key={i}>
                      S{i + 1} <b className="text-ink-800">{s.games}</b>
                      {s.tiebreak != null && (
                        <sup aria-label={'tiebreak ' + s.tiebreak}>
                          {s.tiebreak}
                        </sup>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              {live && (side.points !== null || side.serving) && (
                <p className="text-ink-700 mt-1 text-xs">
                  {side.points !== null && 'Game ' + side.points}
                  {side.points !== null && side.serving && ' · '}
                  {side.serving && 'Serving'}
                </p>
              )}
            </li>
          )
        })}
      </ul>
      {match.status === 'scheduled' && (
        <p className="text-ink-600 px-3 pb-3 text-xs">
          {match.timing?.startKnown ? (
            <time dateTime={new Date(match.timing.earliestStart).toISOString()}>
              {new Date(match.timing.earliestStart).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                timeZoneName: 'short',
              })}
            </time>
          ) : day ? (
            <>
              <time dateTime={day}>
                {new Date(day + 'T12:00:00Z').toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  timeZone: 'UTC',
                })}
              </time>{' '}
              · Time to be confirmed
            </>
          ) : (
            'Start time to be confirmed'
          )}
        </p>
      )}
      {match.attention === 'scores' && (
        <p className="text-ink-600 px-3 pb-3 text-xs">Score unconfirmed</p>
      )}
      {selected && ticket?.onPick(selected, () => setChoice(undefined))}
    </article>
  )
}
export function TennisDraw({
  rounds,
  readStartedAt,
  now,
  tickets,
}: {
  rounds: { round: TennisRound; matches: TennisMatch[] }[]
  tickets?: ReadonlyMap<string, Ticket>
} & Freshness) {
  return (
    <section aria-label="Tournament draw" className="space-y-4">
      {rounds.length ? (
        rounds.map(({ round, matches }) => (
          <section key={round}>
            <h2 className="text-ink-800 mb-2 text-sm font-semibold">
              {tennisRoundNames[round]}
            </h2>
            <div className="grid min-w-0 gap-2 md:grid-cols-2">
              {matches.map((match) => (
                <TennisMatchCard
                  key={match.eventId}
                  match={match}
                  readStartedAt={readStartedAt}
                  now={now}
                  ticket={tickets?.get(match.eventId)}
                />
              ))}
            </div>
          </section>
        ))
      ) : (
        <p className="text-ink-600 text-sm">
          No confirmed matches in these rounds.
        </p>
      )}
    </section>
  )
}
