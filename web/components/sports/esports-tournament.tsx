import { useEffect, useId, useState } from 'react'
import type { EsportsLeague, EsportsRef } from 'common/bdl/esports-series'
import {
  esportsPicks,
  freshEsportsRead,
  sameEsportsPick,
  type EsportsPick,
  type EsportsScope,
  type EsportsSeriesView,
} from 'common/bdl/esports-market'
import type { readValorantPlacementPage } from 'common/bdl/esports-series-details'
import { LIVE_STALE_MS } from 'common/sports-schedule'
import { formatSportsPrice } from 'common/sports-price'
import { formatMoney } from 'common/util/format'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { SportHeroBackground } from './sport-hero-background'

type Placements = {
  tournamentId: number
  page: NonNullable<ReturnType<typeof readValorantPlacementPage>>
}
type Props = {
  league: EsportsLeague
  tournament: EsportsRef
  rows: readonly EsportsSeriesView[]
  scope?: EsportsScope
  placements?: Placements
  galleryPreview?: boolean
}
const titles = {
  cs: 'Counter-Strike 2',
  dota: 'Dota 2',
  lol: 'League of Legends',
  valorant: 'Valorant',
}
const date = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
})
function SeriesRow({
  row,
  now,
  picks,
  choose,
}: {
  row: EsportsSeriesView
  now: number
  picks: EsportsPick[]
  choose?: (p: EsportsPick) => void
}) {
  const { series: s } = row,
    heading = useId()
  const fresh = freshEsportsRead(row.observedAt, now),
    live = s.status === 'in_progress' && fresh && !s.review
  const status =
    s.review === 'forfeit'
      ? 'Forfeit under review'
      : s.review && s.review !== 'format'
      ? 'Series under review'
      : s.status === 'in_progress'
      ? live
        ? 'Live'
        : !fresh
        ? 'Last reported'
        : 'In progress'
      : s.status === 'final'
      ? 'Final'
      : s.status === 'scheduled'
      ? 'Scheduled'
      : s.status === 'canceled'
      ? 'Canceled'
      : s.status === 'postponed'
      ? 'Postponed'
      : 'Status unavailable'
  const stage = [
    s.stage?.name !== s.tournament?.name ? s.stage?.name : null,
    s.round,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <article
      aria-labelledby={heading}
      className="border-ink-200 bg-canvas-0 min-w-0 rounded-xl border px-3 py-3 sm:px-5"
    >
      <h3 id={heading} className="sr-only">
        {s.team1?.name ?? 'Opponent pending'} vs{' '}
        {s.team2?.name ?? 'Opponent pending'}
      </h3>
      <div className="text-ink-600 mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium">
        <span
          className={
            live
              ? 'text-scarlet-600 inline-flex items-center gap-1.5 font-bold'
              : 'text-ink-800'
          }
        >
          {live && (
            <span aria-hidden className="bg-scarlet-500 h-2 w-2 rounded-full" />
          )}
          {status}
        </span>
        {s.bestOf && <span>Best of {s.bestOf}</span>}
        {s.startTimeMs !== null && (
          <time dateTime={new Date(s.startTimeMs).toISOString()}>
            {date.format(s.startTimeMs)}
          </time>
        )}
      </div>
      {stage && (
        <p className="text-ink-600 mb-2 break-words text-xs">{stage}</p>
      )}
      <div className="divide-ink-100 divide-y">
        {[s.team1, s.team2].map((team, i) => {
          const score =
            s.score &&
            (!s.review || s.review === 'format') &&
            s.status !== 'scheduled'
              ? i === 0
                ? s.score.team1
                : s.score.team2
              : null
          const pick = picks.find((p) => p.entrantId === team?.id)
          return (
            <div
              key={i}
              className="grid min-h-[48px] grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 py-1"
            >
              <span className="text-ink-900 min-w-0 break-words font-semibold">
                {team?.name ?? 'Opponent pending'}
                {team && s.winnerId === team.id && (
                  <span className="ml-1.5 text-teal-600" aria-label="Winner">
                    ✓
                  </span>
                )}
              </span>
              <span className="text-ink-700 whitespace-nowrap text-sm font-medium tabular-nums">
                {score !== null && (
                  <>
                    {score} {score === 1 ? 'map' : 'maps'}
                  </>
                )}
              </span>
              {pick && choose && pick.buyable ? (
                <button
                  type="button"
                  aria-label={
                    'Pick ' +
                    pick.name +
                    ', ' +
                    formatSportsPrice(pick.probability)
                  }
                  className="bg-primary-100 text-primary-800 hover:bg-primary-200 focus-visible:ring-primary-500 min-h-[44px] min-w-[68px] rounded-lg px-3 font-bold tabular-nums focus-visible:ring-2"
                  onClick={() => choose(pick)}
                >
                  {formatSportsPrice(pick.probability)}
                </button>
              ) : pick ? (
                <span
                  aria-label={pick.name + ' price'}
                  className="text-ink-600 min-w-[58px] text-right font-semibold tabular-nums"
                >
                  {formatSportsPrice(pick.probability)}
                </span>
              ) : null}
            </div>
          )
        })}
      </div>
      {s.skipBestOfTwo && (
        <p className="text-ink-600 mt-1 text-xs">
          Best-of-two series excluded from winner markets
        </p>
      )}
      {s.review === 'entrants' && (
        <p className="text-ink-600 mt-1 text-xs">
          Waiting for confirmed opponents
        </p>
      )}
    </article>
  )
}

function Ticket({
  pick,
  recheck,
  close,
}: {
  pick: EsportsPick
  recheck: () => EsportsPick | undefined
  close: () => void
}) {
  const [amount, setAmount] = useState('10'),
    [receipt, setReceipt] = useState<number>()
  const stake = Number(amount),
    valid = Number.isSafeInteger(stake) && stake > 0
  return (
    <Modal
      open
      adaptToKeyboard
      ariaLabel={'Preview pick for ' + pick.name}
      setOpen={(open) => {
        if (!open) close()
      }}
      className={MODAL_CLASS}
      size="sm"
    >
      <h3 className="text-ink-900 text-lg font-semibold">{pick.name}</h3>
      <p className="text-ink-600 text-sm">
        Gallery ticket · {formatSportsPrice(pick.probability)}
      </p>
      {receipt === undefined ? (
        <form
          className="mt-4 grid gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            const current = recheck()
            if (!current) {
              close()
              return
            }
            if (valid && current.probability === pick.probability)
              setReceipt(stake)
          }}
        >
          <label className="text-ink-700 text-sm">
            Demo stake
            <input
              className="bg-canvas-0 border-ink-300 mt-1 block min-h-[44px] w-full rounded-md border px-3"
              type="number"
              step="1"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </label>
          <button
            type="submit"
            disabled={!valid}
            className="bg-primary-600 min-h-[44px] rounded-md px-4 font-semibold text-white disabled:opacity-50"
          >
            Preview pick
          </button>
        </form>
      ) : (
        <p role="status" className="text-ink-800 mt-3 font-medium">
          {formatMoney(receipt)} previewed on {pick.name}.
        </p>
      )}
    </Modal>
  )
}

// Market-backed consumers must supply their own visibility-filtered rows. The
// gallery's optional interactive ticket only previews its local synthetic data.
export function EsportsTournament({
  league,
  tournament,
  rows,
  scope,
  placements,
  galleryPreview = false,
}: Props) {
  const [, refresh] = useState(0),
    [selected, setSelected] = useState<EsportsPick | null>(null)
  const now = Date.now(),
    seen = new Set<string>(),
    duplicates = new Set<string>()
  const matched = rows.filter(
    ({ series: s }) => s.league === league && s.tournament?.id === tournament.id
  )
  for (const { series: s } of matched) {
    if (seen.has(s.eventId)) duplicates.add(s.eventId)
    seen.add(s.eventId)
  }
  const visible = matched
    .filter(({ series: s }) => !duplicates.has(s.eventId))
    .sort(
      (a, b) =>
        (a.series.startTimeMs ?? Infinity) -
          (b.series.startTimeMs ?? Infinity) || a.series.id - b.series.id
    )
  const resolvePick = (p: EsportsPick, at: number) => {
    const row = visible.find(({ series }) => series.eventId === p.eventId)
    return (
      row &&
      esportsPicks(row, at, scope).find(
        (q) => sameEsportsPick(q, p) && q.buyable
      )
    )
  }
  const current =
    selected && galleryPreview ? resolvePick(selected, now) : undefined
  useEffect(() => {
    if (selected && !current) setSelected(null)
  }, [selected, current])
  const times = visible.flatMap((r) => [
    (r.observedAt ?? -Infinity) + LIVE_STALE_MS,
    (r.marketReadAt ?? -Infinity) + LIVE_STALE_MS,
    r.market?.closeTime ?? -Infinity,
  ])
  const next = times.reduce(
    (earliest, t) => (t > now ? Math.min(earliest, t) : earliest),
    Infinity
  )
  useEffect(() => {
    const update = () => refresh((n) => n + 1)
    const timer = Number.isFinite(next)
      ? window.setTimeout(
          update,
          Math.min(2147483647, Math.max(0, next - Date.now()))
        )
      : undefined
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('focus', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [next])
  const places =
    league === 'valorant' && placements?.tournamentId === tournament.id
      ? placements.page.placements
      : []
  return (
    <section aria-label={tournament.name} className="min-w-0 space-y-3">
      <header className="bg-primary-50 border-primary-100 relative isolate overflow-hidden rounded-xl border px-4 py-5 sm:px-6">
        <SportHeroBackground sport="esports" />
        <p className="text-primary-700 text-xs font-semibold uppercase tracking-wide">
          {titles[league]}
        </p>
        <h2 className="text-ink-900 mt-1 max-w-prose break-words text-xl font-bold sm:text-2xl">
          {tournament.name}
        </h2>
      </header>
      {visible.map((row) => (
        <SeriesRow
          key={row.series.eventId}
          row={row}
          now={now}
          picks={esportsPicks(row, now, scope)}
          choose={
            galleryPreview
              ? (p) => {
                  const verified = resolvePick(p, Date.now())
                  if (verified) setSelected(verified)
                  else refresh((n) => n + 1)
                }
              : undefined
          }
        />
      ))}
      {places.length > 0 && (
        <div className="border-ink-200 bg-canvas-0 rounded-xl border px-3 py-3 sm:px-5">
          <h3 className="text-ink-900 mb-2 font-semibold">
            Tournament placements
          </h3>
          <table className="w-full table-fixed text-left text-sm">
            <thead className="text-ink-600">
              <tr>
                <th scope="col" className="w-20 pb-2 font-medium">
                  Place
                </th>
                <th scope="col" className="pb-2 font-medium">
                  Team
                </th>
              </tr>
            </thead>
            <tbody className="divide-ink-100 divide-y">
              {places.map((p) => (
                <tr key={p.team.id}>
                  <td className="text-ink-700 py-2.5 tabular-nums">
                    {p.label}
                  </td>
                  <td className="text-ink-900 break-words py-2.5 font-medium">
                    {p.team.name}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {current && (
        <Ticket
          key={current.contractId + '/' + current.answerId}
          pick={current}
          recheck={() => resolvePick(current, Date.now())}
          close={() => setSelected(null)}
        />
      )}
    </section>
  )
}
