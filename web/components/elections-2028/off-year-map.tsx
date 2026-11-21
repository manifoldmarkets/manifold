import clsx from 'clsx'
import { groupBy, sortBy, uniq } from 'lodash'
import { useEffect, useState } from 'react'

import { Contract, isMultiCpmm } from 'common/contract'
import { Atlas, loadAtlas } from 'web/components/usa-map/atlas-shapes'
import { formatOdds, labelInk } from 'web/components/usa-map/election-display'
import {
  isDemocraticAnswer,
  isRepublicanAnswer,
  partyProbsToColor,
} from 'web/components/usa-map/state-election-map'
import { offYearRace, yearIn } from 'web/lib/politics/election-glance'
import { TIMELINE } from 'web/lib/politics/elections-2028-config'
import { settledPartyProbs } from 'web/lib/politics/settlement'
import { placeName } from 'web/lib/politics/official-markets'
import { track } from 'web/lib/service/analytics'
import { LiveContracts } from './live-contracts'
import { MarketRows, OddsRows, oddsItems } from './odds-rows'
import { BetTarget, useQuickBet } from './quick-bet'

// The odd-year elections as a map: one tile per state, the states voting
// that year in their leading party's colour (by the state's top race:
// governor, then a U.S. Senate seat, then the legislature), next to a line
// per state with each of its races. Pointing at a state or its line marks
// both; clicking a race (or a state's tile) bets on it, here on the page. Races that aren't one state's (the Speaker vote, a mayor, House
// specials) and elections abroad follow as one line each.

type Race = {
  contract: Contract
  state: string
  office: string
  rank: number
  cycle: number
  dem: number
  rep: number
}

const CELL = 30
const GAP = 3

// A race's bet: on the party it shows leading (the dialog switches to the
// other side or answer).
function raceBet(race: Race): BetTarget {
  const demLeads = race.dem >= race.rep
  const answer = isMultiCpmm(race.contract)
    ? race.contract.answers.find((a) =>
        demLeads ? isDemocraticAnswer(a.text) : isRepublicanAnswer(a.text)
      )
    : undefined
  return { contract: race.contract, answerId: answer?.id }
}

const electionDay = (cycle: number) =>
  TIMELINE.find((e) => e.key === String(cycle))?.time

export function OffYearMap(props: {
  contracts: Contract[]
  world: Contract[]
}) {
  return (
    <LiveContracts contracts={props.contracts}>
      {(contracts) => <OffYear contracts={contracts} world={props.world} />}
    </LiveContracts>
  )
}

function OffYear(props: { contracts: Contract[]; world: Contract[] }) {
  const { contracts, world } = props
  const races: Race[] = []
  const also: Contract[] = []
  for (const contract of contracts) {
    const race = offYearRace(contract.question)
    const probs = settledPartyProbs(contract)
    if (race && probs && probs.dem + probs.rep > 0)
      races.push({ contract, ...race, dem: probs.dem, rep: probs.rep })
    else also.push(contract)
  }
  // Every year something's on the ballot, the Speaker vote's included, so
  // no market is left without a tab.
  const years = uniq([
    ...races.map((r) => r.cycle),
    ...also.flatMap((c) => {
      const y = yearIn(c.question)
      return y ? [y] : []
    }),
  ]).sort((a, b) => a - b)
  const [picked, setPicked] = useState<number>()
  const year =
    picked !== undefined && years.includes(picked) ? picked : years[0]
  const [hovered, setHovered] = useState<string>()
  const atlas = useAtlasTiles()

  const byState = groupBy(
    races.filter((r) => r.cycle === year),
    (r) => r.state
  )
  const states = sortBy(Object.keys(byState), (st) => placeName(st))
  const lead = (st: string) => sortBy(byState[st], (r) => r.rank)[0]
  // The year's other races (the Speaker vote and a mayor in 2027), and any
  // that name no year.
  const alsoThisYear = also.filter((c) => {
    const y = yearIn(c.question)
    return !y || y === year
  })
  const { open, dialog } = useQuickBet('election off-year')
  const pick = (y: number) => {
    track('election off-year year', { year: y })
    setPicked(y)
  }

  return (
    <div className="flex flex-col gap-4">
      {years.length > 1 && (
        <div
          role="tablist"
          aria-label="Year"
          className="bg-canvas-50 flex w-fit gap-0.5 rounded-lg p-0.5"
        >
          {years.map((y) => {
            const day = electionDay(y)
            return (
              <button
                key={y}
                role="tab"
                aria-selected={y === year}
                tabIndex={y === year ? 0 : -1}
                onClick={() => pick(y)}
                onKeyDown={(e) => {
                  const i = years.indexOf(y)
                  const next =
                    e.key === 'ArrowRight'
                      ? years[(i + 1) % years.length]
                      : e.key === 'ArrowLeft'
                      ? years[(i - 1 + years.length) % years.length]
                      : undefined
                  if (next === undefined) return
                  e.preventDefault()
                  pick(next)
                  const tabs = e.currentTarget.parentElement?.children
                  ;(
                    tabs?.[years.indexOf(next)] as HTMLElement | undefined
                  )?.focus()
                }}
                className={clsx(
                  'rounded-md px-3 py-1 text-sm',
                  y === year
                    ? 'bg-canvas-0 text-ink-1000 font-semibold shadow-sm'
                    : 'text-ink-600 hover:text-ink-900'
                )}
              >
                {y}
                {day && (
                  <span className="text-ink-500 ml-1.5 text-xs font-normal">
                    {new Date(day).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      timeZone: 'UTC',
                    })}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {states.length > 0 && (
        <div
          className={clsx(
            'grid items-start gap-4 md:gap-6',
            atlas !== null && 'md:grid-cols-[minmax(0,320px)_1fr]'
          )}
        >
          <TileMap
            atlas={atlas}
            colorOf={(st) => {
              const r = byState[st] && lead(st)
              return r ? partyProbsToColor(r.dem, r.rep) : undefined
            }}
            hovered={hovered}
            onHover={setHovered}
            onPick={(st) => byState[st] && open(raceBet(lead(st)))}
          />
          <ul className="flex flex-col">
            {states.map((st) => (
              <li
                key={st}
                onPointerEnter={() => setHovered(st)}
                onPointerLeave={() => setHovered(undefined)}
                className={clsx(
                  'border-ink-200 -mx-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border-b px-2 py-2 last:border-b-0',
                  hovered === st && 'bg-canvas-50'
                )}
              >
                <span className="text-ink-1000 w-28 shrink-0 text-sm font-semibold">
                  {placeName(st)}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {sortBy(byState[st], (r) => r.rank).map((r) => (
                    <RaceChip
                      key={r.contract.id}
                      race={r}
                      onBet={() => open(raceBet(r))}
                    />
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {alsoThisYear.length > 0 && (
        <OddsRows
          items={oddsItems(alsoThisYear)}
          trackingName="election off-year also"
        />
      )}

      {world.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="text-ink-900 text-sm font-semibold">
            Around the world
          </h3>
          <MarketRows contracts={world} trackingName="election world" />
        </div>
      )}
      {dialog}
    </div>
  )
}

function RaceChip(props: { race: Race; onBet: () => void }) {
  const { race, onBet } = props
  const demLeads = race.dem >= race.rep
  const color = partyProbsToColor(race.dem, race.rep)
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={`Bet: ${placeName(race.state)} ${race.office}, ${
        demLeads ? 'Democrats' : 'Republicans'
      } ${formatOdds(demLeads ? race.dem : race.rep)}`}
      onClick={onBet}
      className="border-ink-200 hover:border-ink-400 hover:bg-canvas-50 bg-canvas-0 inline-flex items-center gap-1.5 rounded-md border py-0.5 pl-1 pr-2 text-xs"
    >
      <span
        className="h-3 w-3 shrink-0 rounded-sm"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span className="text-ink-700">{race.office}</span>
      <span className="text-ink-1000 font-semibold tabular-nums">
        {demLeads ? 'D' : 'R'} {formatOdds(demLeads ? race.dem : race.rep)}
      </span>
    </button>
  )
}

function TileMap(props: {
  // Undefined while loading; null if the atlas failed (the lines still work).
  atlas: Atlas['tiles'] | undefined | null
  colorOf: (state: string) => string | undefined
  hovered: string | undefined
  onHover: (state: string | undefined) => void
  // A voting state's tile opens a bet on its top race (the state's line
  // has the same as buttons, for keyboards).
  onPick: (state: string) => void
}) {
  const { atlas, colorOf, hovered, onHover, onPick } = props
  if (atlas === null) return null
  if (!atlas)
    return (
      <div
        className="bg-canvas-50 aspect-[11/8] w-full rounded-lg"
        aria-hidden
      />
    )
  const cols = Math.max(...atlas.map((t) => t.col)) + 1
  const rows = Math.max(...atlas.map((t) => t.row)) + 1
  const width = cols * (CELL + GAP) - GAP
  const height = rows * (CELL + GAP) - GAP
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="text-ink-900 w-full max-w-[320px]"
      role="img"
      aria-label="States with elections this year"
    >
      {atlas.map((t) => {
        const color = colorOf(t.state)
        const x = t.col * (CELL + GAP)
        const y = t.row * (CELL + GAP)
        return (
          <g
            key={t.state}
            onPointerEnter={() => color && onHover(t.state)}
            onPointerLeave={() => color && onHover(undefined)}
            onClick={() => color && onPick(t.state)}
            className={clsx(color && 'cursor-pointer')}
          >
            <rect
              x={x}
              y={y}
              width={CELL}
              height={CELL}
              rx={4}
              className={clsx(!color && 'fill-ink-100')}
              style={color ? { fill: color } : undefined}
              stroke={hovered === t.state ? 'currentColor' : 'none'}
              strokeWidth={2}
            />
            <text
              x={x + CELL / 2}
              y={y + CELL / 2}
              dominantBaseline="central"
              textAnchor="middle"
              fontSize={10}
              fontWeight={color ? 600 : 400}
              className={clsx('pointer-events-none', !color && 'fill-ink-400')}
              style={color ? { fill: labelInk(color) } : undefined}
            >
              {t.state}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function useAtlasTiles() {
  const [tiles, setTiles] = useState<Atlas['tiles'] | null>()
  useEffect(() => {
    let live = true
    loadAtlas()
      .then((a) => live && setTiles(a.tiles.filter((t) => t.state !== 'DC')))
      .catch(() => live && setTiles(null))
    return () => {
      live = false
    }
  }, [])
  return tiles
}
