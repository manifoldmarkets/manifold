import clsx from 'clsx'
import { createContext, useContext, useMemo, useState } from 'react'

import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { formatOdds } from 'web/components/usa-map/election-display'
import { DEM_COLOR, REP_COLOR } from 'web/components/usa-map/state-election-map'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import {
  BOARD_COLUMNS,
  BoardColumn,
  BoardGroupBy,
  BoardMode,
  BoardOffice,
  BoardRace,
  calledTotals,
  columnTotals,
  flipped,
  groupRaces,
  raceId,
  raceLabel,
  raceName,
  ResultColumn,
} from 'web/lib/politics/race-board'
import { track } from 'web/lib/service/analytics'
import { BetTarget, useQuickBet } from './quick-bet'

// Every race of an office on one board, NYT-style: five columns by how our
// markets rate each race (same thresholds as the electoral college model),
// or grouped by state, or by the week's biggest moves. On election night the
// columns freeze at the pre-election prices; called races fill with the
// winner's colour, hatched when the seat flipped. Once the frozen prices
// can't be read, the board groups by result instead (BoardMode).

const OFFICE_LABEL: Record<BoardOffice, string> = {
  P: 'President',
  V: 'Popular vote',
  S: 'Senate',
  G: 'Governor',
  H: 'House',
}

const OTHER_COLOR = '#8a8a8a'
const partyColor = (p: 'D' | 'R' | 'O') =>
  p === 'D' ? DEM_COLOR : p === 'R' ? REP_COLOR : OTHER_COLOR

// Column accents: the party colour at full strength for the easy wins, a
// lighter one for the narrow ones, neutral gray for the toss-ups.
const COLUMN_ACCENT: Record<BoardColumn, string> = {
  solidD: DEM_COLOR,
  leanD: '#9fb3dc',
  tossup: '#cfcac4',
  leanR: '#e3a5a2',
  solidR: REP_COLOR,
}
const RESULT_ACCENT: Record<ResultColumn, string> = {
  wonD: DEM_COLOR,
  uncalled: COLUMN_ACCENT.tossup,
  wonR: REP_COLOR,
  wonO: OTHER_COLOR,
}

// Leader and chance as the reader sees it: "D 64%".
function leaderOf(race: BoardRace) {
  if (race.c) return { party: race.c, text: race.c === 'O' ? 'Other' : race.c }
  const p = race.p
  return p >= 0.5
    ? { party: 'D' as const, text: `D ${formatOdds(p)}` }
    : { party: 'R' as const, text: `R ${formatOdds(1 - p)}` }
}

// Betting from the board: each race opens the page's bet dialog on the party
// it shows leading, without leaving the page.
const BoardBet = createContext<(target: BetTarget) => void>(() => undefined)
const raceBet = (race: BoardRace): BetTarget => ({
  slug: race.s,
  creator: race.u,
  party: leaderOf(race).party === 'R' ? 'R' : 'D',
})

function weekText(w: number | undefined) {
  if (w === undefined || Math.abs(w) < 0.01) return undefined
  const pts = Math.round(Math.abs(w) * 100)
  return `${w > 0 ? 'D' : 'R'} +${pts}`
}

export function RaceBoard(props: {
  races: BoardRace[]
  mode: BoardMode
  freezeTime?: number
  cycle: number
  trackingName: string
}) {
  const { races, mode, cycle, trackingName } = props
  const offices = useMemo(
    () =>
      (['P', 'V', 'S', 'G', 'H'] as BoardOffice[]).filter((o) =>
        races.some((r) => r.o === o)
      ),
    [races]
  )
  const [office, setOffice] = usePersistentInMemoryState<BoardOffice>(
    offices[0] ?? 'P',
    `election-board-office-${cycle}`
  )
  const [groupBy, setGroupBy] = usePersistentInMemoryState<BoardGroupBy>(
    'rating',
    `election-board-group-${cycle}`
  )
  const current = offices.includes(office) ? office : offices[0]
  const shown = useMemo(
    () => races.filter((r) => r.o === current),
    [races, current]
  )
  const groups = useMemo(
    () => groupRaces(shown, groupBy, mode),
    [shown, groupBy, mode]
  )
  const { open, dialog } = useQuickBet(trackingName)
  if (!current) return null
  const weight = current === 'P' ? 'ev' : 'races'
  const totals = columnTotals(shown, mode)
  const wonAsChips =
    mode === 'results' &&
    groups.some((g) => g.key !== 'uncalled' && g.races.length > COLUMN_ROWS)
  const called = calledTotals(shown, weight)
  const anyCalled = called.D + called.R + called.O > 0

  return (
    <BoardBet.Provider value={open}>
      <div className="bg-canvas-0 border-ink-200 flex flex-col gap-3 rounded-xl border p-3 sm:p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {offices.length > 1 ? (
            <ChoicesToggleGroup
              currentChoice={current}
              choicesMap={Object.fromEntries(
                offices.map((o) => [OFFICE_LABEL[o], o])
              )}
              setChoice={(o) => {
                track(`${trackingName} office`, { office: o })
                setOffice(o as BoardOffice)
              }}
              color="gray"
              ariaLabel="Office"
              toggleClassName="!px-3 !py-1 text-sm"
            />
          ) : (
            <h3 className="text-ink-1000 text-base font-semibold">
              {OFFICE_LABEL[current]}
              {current === 'P' || current === 'V' ? ' by state' : ''}
            </h3>
          )}
          <ChoicesToggleGroup
            currentChoice={groupBy}
            choicesMap={{
              [mode === 'results' ? 'Result' : 'Rating']: 'rating',
              State: 'state',
              'Biggest moves': 'moves',
            }}
            setChoice={(g) => {
              track(`${trackingName} group`, { by: g })
              setGroupBy(g as BoardGroupBy)
            }}
            color="gray"
            ariaLabel="Group races by"
            toggleClassName="!px-2.5 !py-1 text-xs"
          />
        </div>

        {anyCalled && (
          <div className="text-ink-700 text-sm">
            Called so far:{' '}
            <CalledCount party="D" n={called.D} weight={weight} />
            {' · '}
            <CalledCount party="R" n={called.R} weight={weight} />
            {called.O > 0 && (
              <>
                {' · '}
                <CalledCount party="O" n={called.O} weight={weight} />
              </>
            )}
          </div>
        )}

        {groupBy === 'rating' ? (
          <div
            className={clsx(
              'grid gap-3',
              mode !== 'results'
                ? 'lg:grid-cols-5'
                : groups.length === 4
                ? 'lg:grid-cols-4'
                : 'lg:grid-cols-3'
            )}
          >
            {groups.map((g) => {
              const rating = BOARD_COLUMNS.find((c) => c.key === g.key)
              const t = totals[g.key] ?? { races: 0, ev: 0 }
              // Long easy-win columns list as chips. By result, the won
              // columns go to chips together (any of them long), so a view
              // doesn't mix rows and chips for the same kind of column.
              const compact =
                mode === 'results'
                  ? g.key !== 'uncalled' && wonAsChips
                  : (g.key === 'solidD' || g.key === 'solidR') &&
                    g.races.length > COLUMN_ROWS
              const count =
                current === 'P'
                  ? `${t.races} · ${t.ev} EV`
                  : `${t.races} ${t.races === 1 ? 'race' : 'races'}`
              return (
                <section key={g.key} aria-label={g.label} className="min-w-0">
                  <header
                    className="border-t-4 pb-2 pt-1.5"
                    style={{
                      borderColor: rating
                        ? COLUMN_ACCENT[rating.key]
                        : RESULT_ACCENT[g.key as ResultColumn],
                    }}
                  >
                    <div className="text-ink-1000 text-sm font-semibold leading-tight">
                      {g.label}
                    </div>
                    <div className="text-ink-600 text-xs tabular-nums">
                      {rating ? `${rating.range} · ${count}` : count}
                    </div>
                  </header>
                  {g.races.length === 0 ? (
                    <div className="text-ink-500 text-xs">None</div>
                  ) : compact ? (
                    <div className="flex flex-wrap gap-1">
                      {g.races.map((r) => (
                        <RaceChip key={raceId(r)} race={r} />
                      ))}
                    </div>
                  ) : (
                    <ColumnRows
                      key={`${current}-${g.key}`}
                      races={g.races}
                      trackingName={trackingName}
                    />
                  )}
                </section>
              )
            })}
          </div>
        ) : (
          <div
            className={clsx(
              'grid gap-3',
              groupBy === 'state' && 'sm:grid-cols-2 lg:grid-cols-3'
            )}
          >
            {groups.map((g) => (
              <section key={g.key} aria-label={g.label} className="min-w-0">
                {groupBy === 'state' && (
                  <h4 className="text-ink-900 mb-1 text-sm font-semibold">
                    {g.label}
                  </h4>
                )}
                {g.races.length === 0 ? (
                  <div className="text-ink-500 text-sm">
                    No race moved a point or more this week.
                  </div>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {g.races.map((r) => (
                      <RaceRow
                        key={raceId(r)}
                        race={r}
                        showWeek={groupBy === 'moves'}
                      />
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}

        <BoardLegend mode={mode} freezeTime={props.freezeTime} />
      </div>
      {dialog}
    </BoardBet.Provider>
  )
}

// A long column (the House has 100+ narrow races) shows its closest races
// first, with the rest a click away.
const COLUMN_ROWS = 12
function ColumnRows(props: { races: BoardRace[]; trackingName: string }) {
  const { races, trackingName } = props
  const [all, setAll] = useState(false)
  const shown =
    all || races.length <= COLUMN_ROWS + 3 ? races : races.slice(0, COLUMN_ROWS)
  return (
    <>
      <ul className="flex flex-col gap-1">
        {shown.map((r) => (
          <RaceRow key={raceId(r)} race={r} />
        ))}
      </ul>
      {shown.length < races.length && (
        <button
          type="button"
          className="text-primary-700 hover:text-primary-800 mt-1.5 text-xs font-medium hover:underline"
          onClick={() => {
            track(`${trackingName} show all`, { races: races.length })
            setAll(true)
          }}
        >
          Show all {races.length}
        </button>
      )}
    </>
  )
}

function CalledCount(props: {
  party: 'D' | 'R' | 'O'
  n: number
  weight: 'ev' | 'races'
}) {
  const { party, n, weight } = props
  const name =
    party === 'D' ? 'Democrats' : party === 'R' ? 'Republicans' : 'Others'
  return (
    <span className="inline-flex items-center gap-1 font-semibold tabular-nums">
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: partyColor(party) }}
      />
      {name} {n}
      {weight === 'ev' ? ' EV' : ''}
    </span>
  )
}

// A called race fills with the winner's colour (white text); hatched when
// it flipped, with the theme's ink so it reads in light and dark mode.
function calledStyle(race: BoardRace) {
  if (!race.c) return undefined
  const color = partyColor(race.c)
  return flipped(race)
    ? {
        backgroundImage: `repeating-linear-gradient(135deg, ${color}cc 0 4px, transparent 4px 9px)`,
        backgroundColor: `${color}33`,
      }
    : { backgroundColor: color, color: 'white' }
}
const calledClass = (race: BoardRace) =>
  race.c && flipped(race) ? 'text-ink-1000 font-semibold' : undefined

function RaceRow(props: { race: BoardRace; showWeek?: boolean }) {
  const { race, showWeek } = props
  const bet = useContext(BoardBet)
  const leader = leaderOf(race)
  const week = weekText(race.w)
  const called = calledStyle(race)
  const name = raceName(race)
  const body = (
    <span
      className={clsx(
        'flex min-h-[2rem] items-center gap-2 rounded-md px-2 py-1 text-sm',
        !called && 'bg-canvas-50 hover:bg-canvas-100',
        calledClass(race),
        race.s && 'cursor-pointer'
      )}
      style={called}
      title={`${name}${race.c ? `: called for ${leader.text}` : ''}`}
    >
      <span className="min-w-0 flex-1 truncate font-semibold tabular-nums">
        {raceLabel(race)}
        {race.sp ? '*' : ''}
      </span>
      {race.c ? (
        <span className="shrink-0 text-xs font-semibold">
          ✓ {race.c === 'O' ? 'Other' : race.c}
          {flipped(race) ? ' flip' : ''}
        </span>
      ) : (
        <span className="inline-flex shrink-0 items-center gap-1 text-xs tabular-nums">
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: partyColor(leader.party) }}
          />
          {leader.text}
        </span>
      )}
      {showWeek && !race.c && (
        <span className="text-ink-600 w-12 shrink-0 text-right text-xs tabular-nums">
          {week ?? '—'}
        </span>
      )}
    </span>
  )
  return (
    <li>
      {race.s ? (
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => bet(raceBet(race))}
          className="block w-full text-left"
          aria-label={`Bet: ${name}, ${leader.text}`}
        >
          {body}
        </button>
      ) : (
        body
      )}
    </li>
  )
}

// The easy wins, compact: just the label, as a chip.
function RaceChip(props: { race: BoardRace }) {
  const { race } = props
  const bet = useContext(BoardBet)
  const leader = leaderOf(race)
  const called = calledStyle(race)
  const chip = (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium tabular-nums',
        !called && 'bg-canvas-50 text-ink-800 hover:bg-canvas-100',
        calledClass(race)
      )}
      style={called}
      title={`${raceName(race)}: ${leader.text}`}
    >
      {raceLabel(race)}
      {race.sp ? '*' : ''}
    </span>
  )
  return race.s ? (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={() => bet(raceBet(race))}
      aria-label={`Bet: ${raceName(race)}, ${leader.text}`}
    >
      {chip}
    </button>
  ) : (
    chip
  )
}

function BoardLegend(props: { mode: BoardMode; freezeTime?: number }) {
  const { mode, freezeTime } = props
  return (
    <div className="text-ink-600 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <span>
        Odds are the leading party&apos;s chance from each race&apos;s market.
      </span>
      {mode === 'results' && (
        <span>
          Races are grouped by result: called (resolved, or a party at 99% or
          more) under the winner, the rest under Not yet called with their
          current odds.
        </span>
      )}
      {mode === 'frozen' && freezeTime && (
        <span>
          Columns hold the odds from{' '}
          {new Date(freezeTime).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZone: 'America/New_York',
            timeZoneName: 'short',
          })}
          , before the first polls opened.
        </span>
      )}
      <span className="inline-flex items-center gap-1">
        <span
          aria-hidden
          className="inline-block h-3 w-5 rounded-sm"
          style={{
            backgroundImage: `repeating-linear-gradient(135deg, ${DEM_COLOR} 0 6px, transparent 6px 10px)`,
            backgroundColor: `${DEM_COLOR}55`,
          }}
        />
        Hatched: won by a different party than held the seat
      </span>
      <span>* special election</span>
    </div>
  )
}
