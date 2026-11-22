import { useState } from 'react'
import type { GolfField, GolfPlayer } from 'common/bdl/golf'
import {
  golfMarketView,
  type GolfMarket,
  type GolfPick,
} from 'common/bdl/golf-market'
import { formatSportsPrice } from 'common/sports-price'
import { LIVE_STALE_MS } from 'common/sports-schedule'
import { SportHeroBackground } from './sport-hero-background'

const statusName = {
  scheduled: 'Upcoming',
  live: 'In play',
  suspended: 'Suspended',
  final: 'Final',
  unavailable: 'Status unavailable',
}
const playerName = {
  active: '',
  entered: 'Entered',
  withdrawn: 'WD',
  disqualified: 'DQ',
  cut: 'Cut',
  unknown: 'Unconfirmed',
}
function standing(p: GolfPlayer) {
  if (p.state !== 'active') return playerName[p.state]
  return p.position
    ? (p.position.tied ? 'T' : '') + String(p.position.rank)
    : '—'
}
const relativeScore = (n: number | null) =>
  n === null
    ? '—'
    : n === 0
    ? 'E'
    : n > 0
    ? '+' + n
    : String(n).replace('-', '−')
function pickStanding(field: GolfField, playerId: number | null) {
  if (!field.hasResults || field.incomplete || playerId === null) return null
  const player = field.players.find((p) => p.playerId === playerId)
  if (!player || player.fieldPresent === false) return null
  const place = player.position
    ? (player.position.tied ? 'T' : '#') + player.position.rank
    : playerName[player.state]
  const score =
    player.toPar === null ? '' : relativeScore(player.toPar) + ' to par'
  return [place, score].filter(Boolean).join(' · ') || null
}
export function FieldEvent({
  field,
  market,
  now,
  onPick,
}: {
  field: GolfField
  market: GolfMarket
  now: number
  onPick?: (pick: GolfPick) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const view = golfMarketView(field, market, now)
  if (!view) return null
  const t = field.tournament
  const prices =
    expanded || view.picks.length <= 4
      ? view.picks
      : view.kind === 'winner'
      ? [...view.picks.slice(0, 3), view.picks[view.picks.length - 1]]
      : view.picks.slice(0, 4)
  const stale =
    !Number.isSafeInteger(field.readStartedAt) ||
    field.readStartedAt < 0 ||
    !Number.isFinite(now) ||
    field.readStartedAt > now ||
    now - field.readStartedAt >= LIVE_STALE_MS
  const state =
    t.state === 'live' && stale ? 'Awaiting update' : statusName[t.state]
  return (
    <section
      aria-label={t.name}
      className="bg-canvas-0 border-ink-200 text-ink-900 min-w-0 overflow-hidden rounded-xl border"
    >
      <header className="border-primary-200 bg-primary-50 relative isolate space-y-1 overflow-hidden border-b py-4 pl-4 pr-20 sm:pl-6 sm:pr-36">
        <div className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-28 select-none sm:w-48 [&>svg]:opacity-40">
          <SportHeroBackground sport="golf" />
        </div>
        <p className="text-ink-600 text-sm font-semibold">
          {t.tour.toUpperCase()} · {state}
          {t.round !== null && (!stale || t.state !== 'live')
            ? ' · Round ' + t.round
            : ''}
        </p>
        <h2 className="break-words text-xl font-bold sm:text-2xl">{t.name}</h2>
        {t.course && <p className="text-ink-600 text-sm">{t.course}</p>}
      </header>
      <div className="space-y-3 px-4 py-4 sm:px-6">
        <h3 className="font-semibold">
          {view.kind === 'winner'
            ? 'Tournament winner'
            : 'Finish in the top 10'}
        </h3>
        {market.isResolved || market.resolution ? (
          <p className="text-ink-600 text-sm">Resolved market · pool prices</p>
        ) : !Number.isFinite(market.closeTime) || market.closeTime! <= now ? (
          <p className="text-ink-600 text-sm">Closed market · pool prices</p>
        ) : (
          !view.picks.some((p) => p.buyable) && (
            <p className="text-ink-600 text-sm">Trading on hold</p>
          )
        )}
        <ul className="divide-ink-100 divide-y">
          {prices.map((p) => (
            <li
              key={p.answerId}
              className="flex min-h-[50px] items-center justify-between gap-3 py-1"
            >
              <span className="min-w-0 break-words font-medium">
                {p.name}
                <span className="text-ink-600 block text-xs font-normal tabular-nums">
                  {pickStanding(field, p.playerId)}
                </span>
              </span>
              {p.buyable && onPick ? (
                <button
                  type="button"
                  aria-label={
                    p.name +
                    ', ' +
                    formatSportsPrice(p.probability) +
                    ', ' +
                    (view.kind === 'winner' ? 'tournament winner' : 'top 10')
                  }
                  className="bg-primary-100 text-primary-800 hover:bg-primary-200 min-h-[44px] min-w-[76px] rounded-md px-3 text-right text-lg font-bold tabular-nums"
                  onClick={() => onPick(p)}
                >
                  {formatSportsPrice(p.probability)}
                </button>
              ) : (
                <span className="text-ink-600 py-2 text-right text-lg font-semibold tabular-nums">
                  {formatSportsPrice(p.probability)}
                </span>
              )}
            </li>
          ))}
        </ul>
        {view.picks.length > 4 && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            className="text-primary-700 min-h-[44px] font-medium"
          >
            {expanded
              ? 'Show fewer outcomes'
              : 'All ' + view.picks.length + ' outcomes'}
          </button>
        )}
        {field.players.length > 0 && (
          <details className="border-ink-200 border-t pt-1">
            <summary className="text-ink-700 min-h-[44px] cursor-pointer py-3 font-medium">
              {field.hasResults ? 'Leaderboard' : 'Entered field'}
              {field.incomplete ? ' · partial' : ''}
            </summary>
            <table className="text-ink-800 w-full table-fixed text-left text-sm">
              <caption className="sr-only">{t.name} recorded players</caption>
              <thead className="text-ink-600">
                <tr>
                  <th className="w-[4.4rem] py-2" scope="col">
                    {field.hasResults ? 'Place' : 'Status'}
                  </th>
                  <th scope="col">Player</th>
                  {field.hasResults && (
                    <>
                      <th scope="col" className="w-12 text-right">
                        Score
                      </th>
                      <th scope="col" className="w-12 text-right">
                        Thru
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {field.players.map((p) => (
                  <tr key={p.playerId} className="border-ink-100 border-t">
                    <td className="py-2 pr-1">{standing(p)}</td>
                    <th scope="row" className="break-words pr-1 font-normal">
                      {p.name}
                    </th>
                    {field.hasResults && (
                      <>
                        <td className="text-right tabular-nums">
                          {relativeScore(p.toPar)}
                        </td>
                        <td className="text-right tabular-nums">
                          {p.through ?? '—'}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-ink-500 mt-2 text-xs">
              {Number.isSafeInteger(field.readStartedAt) &&
              Number.isFinite(new Date(field.readStartedAt).getTime())
                ? 'Read started ' +
                  new Date(field.readStartedAt).toLocaleString()
                : ''}
            </p>
          </details>
        )}
      </div>
    </section>
  )
}
