import { useEffect, useRef, useState } from 'react'
import type {
  NbaPlayoffBracket,
  NbaPlayoffSeries,
} from 'common/bdl/nba-playoff-series'
import {
  currentPlayoffPick,
  playoffMarketPicks,
  type PlayoffMarket,
  type PlayoffPick,
} from 'common/bdl/playoff-market'
import { formatSportsPrice } from 'common/sports-price'
import { LIVE_STALE_MS } from 'common/sports-schedule'
import { formatMoney } from 'common/util/format'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { SportHeroBackground } from './sport-hero-background'
const rounds = [
  'Opening round',
  'Conference semifinals',
  'Conference finals',
  'NBA Finals',
]
const roundLabel = (s: NbaPlayoffSeries) =>
  s.round ? rounds[s.round - 1] : 'Playoff series'
const short = (s: NbaPlayoffSeries, id: number) => {
  const t = s.teams.find((t) => t.id === id)
  return t?.abbreviation || t?.name
}

function LastGame({ series }: { series: NbaPlayoffSeries }) {
  const finals = series.games.filter(
    (g) => g.status === 'final' && g.startTime !== null
  )
  if (!finals.length || series.review.length) return null
  const ordered = [...finals].sort((a, b) => b.startTime! - a.startTime!)
  const last = ordered[0]
  if (!last.scores || ordered[1]?.startTime === last.startTime) return null
  return (
    <p className="text-ink-600 text-sm">
      <span className="font-medium">Latest recorded final</span> ·{' '}
      {short(series, last.awayId)} {last.scores[1]} –{' '}
      {short(series, last.homeId)} {last.scores[0]}
    </p>
  )
}

function Price({
  pick,
  choose,
}: {
  pick: PlayoffPick | undefined
  choose?: (p: PlayoffPick) => void
}) {
  if (!pick) return null
  const price = formatSportsPrice(pick.probability)
  if (!pick.buyable || !choose)
    return (
      <span className="text-ink-600 justify-self-end font-semibold tabular-nums">
        {price}
      </span>
    )
  return (
    <button
      type="button"
      className="bg-primary-100 text-primary-800 hover:bg-primary-200 focus-visible:ring-primary-500 min-h-[44px] min-w-[64px] justify-self-end rounded-md px-3 text-right font-bold tabular-nums focus-visible:ring-2"
      onClick={() => choose(pick)}
      aria-label={'Pick ' + pick.name + ', ' + price}
    >
      {price}
    </button>
  )
}

type Props = {
  bracket: NbaPlayoffBracket
  markets: readonly PlayoffMarket[]
  readAt: number
  galleryPreview?: boolean
}
export function PlayoffBracket({
  bracket,
  markets,
  readAt,
  galleryPreview = false,
}: Props) {
  const season = bracket.season
  const byId = (id: string) => {
    const found = markets.filter((m) => m.sportsEventId === id)
    return found.length === 1 ? found[0] : undefined
  }
  const latest = [...bracket.series].sort(
    (a, b) =>
      (b.round ?? 0) - (a.round ?? 0) || a.eventId.localeCompare(b.eventId)
  )[0]
  const heading = useRef<HTMLHeadingElement>(null)
  const [selected, setSelected] = useState<string>()
  const current = bracket.series.find((s) => s.eventId === selected) ?? latest
  const [pick, setPick] = useState<PlayoffPick>()
  const [size, setSize] = useState('10')
  const [receipt, setReceipt] = useState<number>()
  const [viewTime, setViewTime] = useState(Date.now)
  useEffect(() => {
    const deadlines = [
      readAt + LIVE_STALE_MS,
      ...markets.flatMap((m) =>
        typeof m.closeTime === 'number' && Number.isFinite(m.closeTime)
          ? [m.closeTime]
          : []
      ),
    ]
    let timer: ReturnType<typeof setTimeout>
    function tick() {
      clearTimeout(timer)
      const at = Date.now()
      setViewTime((previous) => Math.max(previous, at))
      const next = Math.min(...deadlines.filter((d) => d > at))
      if (Number.isFinite(next))
        timer = setTimeout(tick, Math.min(2_147_483_647, Math.ceil(next - at)))
    }
    tick()
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('focus', tick)
    }
  }, [markets, readAt])
  const now = viewTime
  const selectPick = galleryPreview
    ? (p: PlayoffPick) => {
        const current = currentPlayoffPick(
          bracket,
          byId(p.eventId),
          readAt,
          p,
          Math.max(now, Date.now())
        )
        if (!current) return
        setReceipt(undefined)
        setSize('10')
        setPick(current)
      }
    : undefined
  const active =
    pick && galleryPreview
      ? currentPlayoffPick(bracket, byId(pick.eventId), readAt, pick, now)
      : undefined
  const amount = Number(size),
    valid = Number.isSafeInteger(amount) && amount > 0
  const seriesPicks = current
    ? playoffMarketPicks(
        bracket,
        current.eventId,
        byId(current.eventId),
        readAt,
        now
      )
    : []
  const titlePicks = playoffMarketPicks(
    bracket,
    bracket.championEventId,
    byId(bracket.championEventId),
    readAt,
    now
  )
  const champion =
    bracket.champion &&
    bracket.series
      .find((s) => s.eventId === bracket.champion?.seriesId)
      ?.teams.find((t) => t.id === bracket.champion?.teamId)
  const title = [...titlePicks].sort(
    (a, b) => b.probability - a.probability || a.name.localeCompare(b.name)
  )
  const championRow = (p: PlayoffPick) => (
    <li
      key={p.answerId}
      className="grid min-h-[48px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3"
    >
      <span className="break-words">{p.name}</span>
      <Price pick={p} choose={selectPick} />
    </li>
  )
  const review = !!(bracket.review.length || current?.review.length)
  return (
    <section
      className="text-ink-900 min-w-0 space-y-4"
      aria-label="NBA playoff bracket"
    >
      {current && (
        <article className="border-ink-200 bg-canvas-0 overflow-hidden rounded-xl border">
          <header className="border-primary-200 bg-primary-50 relative isolate overflow-hidden border-b px-4 py-4 pr-20 sm:px-6 sm:pr-36">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-24 sm:w-44"
            >
              <SportHeroBackground sport="nba" />
            </div>
            <p className="text-ink-600 text-sm font-semibold">
              NBA · {season}–{String(season + 1).slice(-2)} ·{' '}
              {roundLabel(current)}
            </p>
            <h2 ref={heading} tabIndex={-1} className="text-xl font-bold">
              Series winner
            </h2>
            <p className="text-ink-600 text-sm">
              {review
                ? 'Under review'
                : current.winnerId
                ? 'Series complete'
                : 'First to four wins'}
            </p>
          </header>
          <div className="space-y-2 px-4 py-3 sm:px-6">
            <div className="text-ink-500 grid grid-cols-[minmax(0,1fr)_3rem_4.5rem] gap-2 text-right text-xs">
              <span className="text-left">Team</span>
              <span>Wins</span>
              <span>{seriesPicks.length ? 'Price' : ''}</span>
            </div>
            <ul className="divide-ink-100 divide-y">
              {current.teams.map((t, i) => (
                <li
                  key={t.id}
                  className="grid min-h-[52px] grid-cols-[minmax(0,1fr)_3rem_4.5rem] items-center gap-2"
                >
                  <span className="break-words font-semibold">
                    {t.name}
                    {current.winnerId === t.id && !review && (
                      <span className="text-primary-700 block text-xs">
                        Series winner
                      </span>
                    )}
                  </span>
                  <span className="text-right text-xl font-bold tabular-nums">
                    {current.wins[i]}
                  </span>
                  <Price
                    pick={seriesPicks.find((p) => p.teamId === t.id)}
                    choose={selectPick}
                  />
                </li>
              ))}
            </ul>
            {!seriesPicks.length && (
              <p className="text-ink-600 text-xs">No linked series prices.</p>
            )}
            {seriesPicks.length > 0 && !seriesPicks.some((p) => p.buyable) && (
              <p className="text-ink-600 text-xs">
                Trading closed or held · pool prices
              </p>
            )}
            <LastGame series={current} />
          </div>
        </article>
      )}
      <section
        aria-label="NBA champion"
        className="bg-canvas-0 border-ink-200 rounded-xl border p-4"
      >
        <h2 className="text-lg font-semibold">NBA champion</h2>
        {champion && !bracket.review.length && (
          <p className="text-primary-700 font-semibold">
            {champion.name} · Playoff winner
          </p>
        )}
        {!title.length && !champion && (
          <p className="text-ink-600 text-sm">No linked championship prices.</p>
        )}
        <ul className="divide-ink-100 divide-y">
          {title.slice(0, 3).map(championRow)}
        </ul>
        {title.length > 3 && (
          <details>
            <summary className="text-ink-700 min-h-[44px] cursor-pointer py-3 font-medium">
              Remaining {title.length - 3} teams
            </summary>
            <ul className="divide-ink-100 divide-y">
              {title.slice(3).map(championRow)}
            </ul>
          </details>
        )}
      </section>
      {bracket.series.length > 0 && (
        <section
          aria-label="Playoff rounds"
          className="border-ink-200 bg-canvas-0 rounded-xl border p-4"
        >
          <h2 className="mb-2 text-lg font-semibold">Playoff bracket</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2, 3, 4, null].map((r) => {
              const group = bracket.series.filter((s) => s.round === r)
              if (!group.length) return null
              return (
                <section key={r ?? 0}>
                  <h3 className="text-ink-600 text-sm font-semibold">
                    {r ? rounds[r - 1] : 'Round unconfirmed'}
                  </h3>
                  <ul className="divide-ink-100 divide-y">
                    {group.map((s) => (
                      <li key={s.eventId}>
                        <button
                          type="button"
                          aria-pressed={current?.eventId === s.eventId}
                          onClick={() => {
                            setPick(undefined)
                            setSelected(s.eventId)
                            heading.current?.focus()
                          }}
                          className="hover:bg-canvas-50 grid min-h-[44px] w-full grid-cols-[1fr_auto] items-center gap-3 rounded px-1 text-left text-sm"
                        >
                          <span className="break-words">
                            {short(s, s.teams[0].id)} vs{' '}
                            {short(s, s.teams[1].id)}
                          </span>
                          <strong className="tabular-nums">
                            {s.wins.join('–')}
                          </strong>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        </section>
      )}
      {pick && galleryPreview && (
        <Modal
          open
          setOpen={(open) => {
            if (!open) setPick(undefined)
          }}
          size="sm"
          ariaLabel={'Preview pick for ' + pick.name}
          className={MODAL_CLASS}
        >
          <h3 className="text-lg font-semibold">{pick.name}</h3>
          <p className="text-ink-600 text-sm">
            Gallery ticket · {formatSportsPrice(pick.probability)}
          </p>
          {receipt !== undefined ? (
            <p role="status" className="mt-3">
              {formatMoney(receipt)} preview for {pick.name}
            </p>
          ) : (
            <form
              className="mt-4 grid gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                if (
                  valid &&
                  currentPlayoffPick(
                    bracket,
                    byId(pick.eventId),
                    readAt,
                    pick,
                    Math.max(now, Date.now())
                  )
                )
                  setReceipt(amount)
              }}
            >
              {!active && (
                <p role="status">This selection is no longer available.</p>
              )}
              <label className="text-sm">
                Demo stake
                <input
                  className="border-ink-300 bg-canvas-0 mt-1 block min-h-[44px] w-full rounded border px-3"
                  type="number"
                  min="1"
                  step="1"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                />
              </label>
              <button
                type="submit"
                disabled={!active || !valid}
                className="bg-primary-600 min-h-[44px] rounded px-3 font-semibold text-white disabled:opacity-50"
              >
                Confirm preview
              </button>
            </form>
          )}
        </Modal>
      )}
    </section>
  )
}
