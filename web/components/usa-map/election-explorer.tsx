import { useEffect, useId, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import Image from 'next/image'
import { Contract } from 'common/contract'
import { formatPercent } from 'common/util/format'
import { MapContractsDictionary } from 'web/public/data/elections-data'
import { Modal } from 'web/components/layout/modal'
import { PartyPanel } from 'web/components/us-elections/contracts/party-panel/party-panel'
import { StateBinaryPartyPanel } from 'web/components/us-elections/contracts/party-panel/binary-party-panel'
import { BetDialog } from 'web/components/bet/bet-dialog'
import { DistrictBetButtons } from './district-bet-buttons'
import { DATA } from './usa-map-data'
import {
  DEM_COLOR,
  REP_COLOR,
  isCandidateLabelledAnswer,
} from './state-election-map'
import {
  Atlas,
  buildRaces,
  districtId,
  electionOdds,
  ElectionMode,
  leadingParty,
  OTHER_COLOR,
  Race,
  raceColor,
  raceTier,
  seatSummary,
  Tier,
  TIERS,
} from './election-map-model'
import styles from './election-explorer.module.css'

type Props = {
  senate: MapContractsDictionary
  governor: MapContractsDictionary
  senateCandidates: MapContractsDictionary
  governorCandidates: MapContractsDictionary
  house: Contract | null
  additionalHouse?: MapContractsDictionary
  houseControl: Contract | null
  senateControl: Contract | null
}
const MODES: ElectionMode[] = ['house', 'senate', 'governor']
const modeName = (mode: ElectionMode) => mode[0].toUpperCase() + mode.slice(1)
const pct = (p: number) => formatPercent(p)

export function ElectionExplorer(props: Props) {
  const [mode, setMode] = useState<ElectionMode>('senate')
  const [view, setView] = useState<'map' | 'cartogram'>('map')
  const [labels, setLabels] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Tier>()
  const [selected, setSelected] = useState<string>()
  const [hovered, setHovered] = useState<string>()
  const [sources, setSources] = useState(false)
  const [atlas, setAtlas] = useState<Atlas>()
  const [mapError, setMapError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const selectionOrigin = useRef<HTMLElement | SVGElement | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [camera, setCamera] = useState({ x: 0, y: 0, k: 1 })
  const drag = useRef<{
    x: number
    y: number
    px: number
    py: number
    moved: boolean
  }>()
  const patternId = `unpriced-${useId().replace(/:/g, '')}`
  const races = useMemo(
    () =>
      buildRaces(
        mode,
        mode === 'senate' ? props.senate : props.governor,
        props.house,
        props.additionalHouse
      ),
    [mode, props.senate, props.governor, props.house, props.additionalHouse]
  )
  const raceById = useMemo(() => new Map(races.map((r) => [r.id, r])), [races])
  const summary = seatSummary(races, mode)
  const selectedRace = selected ? raceById.get(selected) : undefined
  const hoverRace = hovered ? raceById.get(hovered) : undefined
  const matches = (race: Race) =>
    (!filter || raceTier(race) === filter) &&
    (!query.trim() ||
      `${race.label} ${race.shortLabel} ${race.matchup ?? ''}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()))
  const filtered = races.filter(matches)

  useEffect(() => {
    const abort = new AbortController()
    setMapError(false)
    fetch('/data/election-atlas.json', { signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw new Error('Map unavailable')
        return r.json()
      })
      .then(setAtlas)
      .catch((e) => {
        if (e.name !== 'AbortError') setMapError(true)
      })
    return () => abort.abort()
  }, [attempt])
  useEffect(() => {
    if (selected) closeRef.current?.focus({ preventScroll: true })
  }, [selected])
  useEffect(() => {
    if (!selected) return
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) {
        setSelected(undefined)
        selectionOrigin.current?.focus({ preventScroll: true })
      }
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [selected])

  const closeDetails = () => {
    setSelected(undefined)
    selectionOrigin.current?.focus({ preventScroll: true })
  }
  const choose = (id: string, element: HTMLElement | SVGElement) => {
    selectionOrigin.current = element
    setSelected(id)
    setHovered(undefined)
  }
  const resetView = () => setCamera({ x: 0, y: 0, k: 1 })
  const zoom = (factor: number) =>
    setCamera((c) => {
      const k = Math.max(1, Math.min(6, c.k * factor))
      return k === 1
        ? { x: 0, y: 0, k }
        : {
            x: 480 - ((480 - c.x) * k) / c.k,
            y: 300 - ((300 - c.y) * k) / c.k,
            k,
          }
    })
  const changeMode = (next: ElectionMode) => {
    setMode(next)
    setSelected(undefined)
    setHovered(undefined)
    setFilter(undefined)
    setQuery('')
    resetView()
  }

  const shapeProps = (id: string) => {
    const race = raceById.get(id)
    return {
      fill: race ? raceColor(race) ?? `url(#${patternId})` : undefined,
      className: clsx(
        styles.shape,
        !race && styles.noRace,
        selected === id && styles.selected
      ),
      opacity: race && !matches(race) ? 0.15 : 1,
      role: race ? 'button' : undefined,
      tabIndex: race && matches(race) ? 0 : -1,
      'aria-label': race
        ? `${race.label}, ${
            race.odds
              ? `${pct(Math.max(...Object.values(race.odds)))} ${
                  leadingParty(race.odds) ?? 'tied'
                }`
              : 'unpriced'
          }`
        : `${DATA[id]?.name ?? id}: no race in 2026`,
      'aria-pressed': race ? selected === id : undefined,
      onPointerEnter: (e: React.PointerEvent<SVGElement>) => {
        if (e.pointerType === 'mouse' && race) setHovered(id)
      },
      onPointerLeave: () => setHovered(undefined),
      onClick: (e: React.MouseEvent<SVGElement>) => {
        if (race && !drag.current?.moved) choose(id, e.currentTarget)
      },
      onKeyDown: (e: React.KeyboardEvent<SVGElement>) => {
        if (race && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          choose(id, e.currentTarget)
        }
      },
    }
  }
  const hex = atlas?.hex
  const hexScale = hex ? Math.min(900 / hex.width, 530 / hex.height) : 1
  const hexPath = (x: number, y: number, r: number) =>
    Array.from({ length: 6 }, (_, i) => {
      const angle = (Math.PI / 3) * i - Math.PI / 2
      return `${i ? 'L' : 'M'}${x + Math.cos(angle) * r},${
        y + Math.sin(angle) * r
      }`
    }).join(' ') + 'Z'
  const candidate =
    selectedRace && mode !== 'house'
      ? (mode === 'senate' ? props.senateCandidates : props.governorCandidates)[
          selectedRace.state
        ]
      : null

  return (
    <section className={styles.explorer} aria-label="2026 election explorer">
      <header className={styles.header}>
        <div className={styles.tabs} role="tablist" aria-label="Election type">
          {MODES.map((m, i) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              tabIndex={mode === m ? 0 : -1}
              onClick={() => changeMode(m)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                  e.preventDefault()
                  const next = (i + (e.key === 'ArrowRight' ? 1 : 2)) % 3
                  changeMode(MODES[next])
                  ;(
                    e.currentTarget.parentElement?.children[
                      next
                    ] as HTMLButtonElement
                  )?.focus()
                }
              }}
            >
              {modeName(m)}
            </button>
          ))}
        </div>
        <div className={styles.controls}>
          <ControlCard label="House" contract={props.houseControl} />
          <ControlCard label="Senate" contract={props.senateControl} />
        </div>
      </header>
      <div className={styles.meta}>
        <span>
          <span className={styles.liveDot} /> Manifold market odds
        </span>
        <button onClick={() => setSources(true)}>How to read the map ↗</button>
      </div>

      <div className={styles.balance}>
        <div className={styles.balanceLabels}>
          <span style={{ color: DEM_COLOR }}>
            <b>{summary.leaders.dem}</b> <span>Democratic</span>
          </span>
          <span className={styles.threshold}>
            {mode === 'house'
              ? '218 for a majority'
              : mode === 'senate'
              ? '51 D / 50 R for control'
              : `${races.length} governorships`}
          </span>
          <span style={{ color: REP_COLOR }}>
            <span>Republican</span> <b>{summary.leaders.rep}</b>
          </span>
        </div>
        <div
          className={styles.balanceTrack}
          aria-label="Seats by market likelihood"
        >
          {TIERS.filter((t) => summary.counts[t.id] > 0).map((t) => (
            <button
              key={t.id}
              title={`${summary.counts[t.id]} ${t.label}${
                mode === 'senate' && t.id.startsWith('safe')
                  ? ' (includes seats not on the ballot)'
                  : ''
              }`}
              aria-label={`Filter ${summary.counts[t.id]} ${t.label}`}
              aria-pressed={filter === t.id}
              style={{ flex: summary.counts[t.id], background: t.color }}
              onClick={() => setFilter(filter === t.id ? undefined : t.id)}
            >
              {summary.counts[t.id] / summary.total > 0.055 &&
                summary.counts[t.id]}
            </button>
          ))}
          {mode !== 'governor' && (
            <span
              className={styles.majorityLine}
              style={{ left: `${(mode === 'house' ? 218 / 435 : 0.5) * 100}%` }}
            />
          )}
        </div>
        <div className={styles.coverage}>
          <span>
            {races.length - summary.leaders.unpriced} of {races.length} races
            priced{mode === 'senate' && ' · 65 seats not on the ballot'}
          </span>
          <span>
            {summary.leaders.unpriced > 0 &&
              `${summary.leaders.unpriced} unpriced`}
            {summary.leaders.other > 0 && ` · ${summary.leaders.other} other`}
            {summary.leaders.tied > 0 && ` · ${summary.leaders.tied} tied`}
          </span>
        </div>
      </div>
      <div className={styles.toolbar}>
        <div className={styles.segment} aria-label="Map view">
          {(['map', 'cartogram'] as const).map((v) => (
            <button
              key={v}
              aria-pressed={view === v}
              onClick={() => {
                setView(v)
                resetView()
                setHovered(undefined)
              }}
            >
              {v === 'map' ? 'Map' : 'Cartogram'}
            </button>
          ))}
        </div>
        <button
          className={clsx(styles.toolButton, labels && styles.activeTool)}
          aria-pressed={labels}
          onClick={() => setLabels(!labels)}
        >
          State labels
        </button>
        <label className={styles.search}>
          <span aria-hidden>⌕</span>
          <input
            aria-label="Find a state or district"
            placeholder="Find a state or district"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button aria-label="Clear search" onClick={() => setQuery('')}>
              ×
            </button>
          )}
        </label>
      </div>
      {(filter || query) && (
        <div className={styles.filterNotice} role="status">
          {filtered.length} matching races
          {filter && ` · ${TIERS.find((t) => t.id === filter)?.label}`}
          <button
            onClick={() => {
              setQuery('')
              setFilter(undefined)
            }}
          >
            Clear filters ×
          </button>
        </div>
      )}
      {query && (
        <div className={styles.results}>
          {filtered.slice(0, 8).map((r) => (
            <button key={r.id} onClick={(e) => choose(r.id, e.currentTarget)}>
              {r.label} <RaceQuote race={r} />
            </button>
          ))}
          {filtered.length === 0 && (
            <span>No matching races. Try a state name or TX-15.</span>
          )}
        </div>
      )}

      <div className={styles.stage}>
        {!atlas ? (
          <div className={styles.mapLoading} role="status">
            {mapError ? (
              <>
                The map couldn’t load.{' '}
                <button onClick={() => setAttempt((a) => a + 1)}>
                  Try again
                </button>
              </>
            ) : (
              'Loading election map…'
            )}
          </div>
        ) : (
          <svg
            viewBox="0 0 960 600"
            aria-label={`${modeName(mode)} ${
              view === 'map' ? 'geographic map' : 'equal-seat cartogram'
            }`}
            className={styles.map}
            style={{ touchAction: camera.k > 1 ? 'none' : 'pan-y' }}
            onPointerDown={(e) => {
              drag.current = {
                x: e.clientX,
                y: e.clientY,
                px: camera.x,
                py: camera.y,
                moved: false,
              }
            }}
            onPointerMove={(e) => {
              if (!drag.current || !e.buttons || camera.k === 1) return
              const d = drag.current
              const ratio = 960 / e.currentTarget.getBoundingClientRect().width
              if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) {
                d.moved = true
                e.currentTarget.setPointerCapture(e.pointerId)
              }
              if (d.moved) {
                setHovered(undefined)
                setCamera((c) => ({
                  ...c,
                  x: Math.max(
                    960 * (1 - c.k),
                    Math.min(0, d.px + (e.clientX - d.x) * ratio)
                  ),
                  y: Math.max(
                    600 * (1 - c.k),
                    Math.min(0, d.py + (e.clientY - d.y) * ratio)
                  ),
                }))
              }
            }}
            onPointerUp={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId))
                e.currentTarget.releasePointerCapture(e.pointerId)
            }}
            onPointerCancel={() => {
              drag.current = undefined
            }}
          >
            <defs>
              <pattern
                id={patternId}
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(35)"
              >
                <rect width="6" height="6" className={styles.hatchBase} />
                <path d="M0 0V6" className={styles.hatchLine} strokeWidth="2" />
              </pattern>
            </defs>
            <g
              transform={`translate(${camera.x} ${camera.y}) scale(${camera.k})`}
            >
              {view === 'map' ? (
                <>
                  {mode === 'house' ? (
                    <>
                      {atlas.districts.map((d) => (
                        <path
                          key={districtId(d.state, d.district)}
                          d={d.path}
                          {...shapeProps(districtId(d.state, d.district))}
                        />
                      ))}
                      {atlas.states.map((s) => (
                        <path
                          key={s.state}
                          d={s.path}
                          className={styles.stateOutline}
                        />
                      ))}
                    </>
                  ) : (
                    atlas.states.map((s) => (
                      <path key={s.state} d={s.path} {...shapeProps(s.state)} />
                    ))
                  )}
                  {labels &&
                    atlas.states
                      .filter(
                        (s) =>
                          !['DC', 'RI', 'DE', 'CT', 'MA', 'MD', 'NJ'].includes(
                            s.state
                          )
                      )
                      .map((s) => (
                        <text
                          key={s.state}
                          x={s.center[0]}
                          y={s.center[1]}
                          className={styles.stateLabel}
                        >
                          {s.state}
                        </text>
                      ))}
                  {labels &&
                    ['MA', 'RI', 'CT', 'NJ', 'DE', 'MD'].map((state, i) => {
                      const s = atlas.states.find((s) => s.state === state)!
                      return (
                        <g key={state}>
                          <path
                            d={`M${s.center[0]} ${s.center[1]}L916 ${
                              245 + i * 29
                            }`}
                            className={styles.labelLine}
                          />
                          <text
                            x="930"
                            y={249 + i * 29}
                            className={styles.stateLabel}
                          >
                            {state}
                          </text>
                        </g>
                      )
                    })}
                </>
              ) : mode === 'house' && hex ? (
                <g
                  transform={`translate(${
                    (960 - hex.width * hexScale) / 2
                  } 35) scale(${hexScale})`}
                >
                  {hex.hexes.map((h) => (
                    <path
                      key={districtId(h.state, h.district)}
                      d={hexPath(h.x, h.y, hex.size * 0.92)}
                      {...shapeProps(districtId(h.state, h.district))}
                    />
                  ))}
                  {labels &&
                    atlas.states
                      .filter((s) => s.state !== 'DC')
                      .map((s) => {
                        const seats = hex.hexes.filter(
                          (h) => h.state === s.state
                        )
                        const top = seats.reduce((a, b) => (a.y < b.y ? a : b))
                        return (
                          <text
                            key={s.state}
                            x={top.x}
                            y={top.y - 14}
                            className={styles.hexLabel}
                          >
                            {s.state}
                          </text>
                        )
                      })}
                </g>
              ) : (
                <g transform="translate(76 20)">
                  {atlas.tiles
                    .filter((t) => t.state !== 'DC')
                    .map((t) => (
                      <g key={t.state}>
                        <rect
                          x={t.col * 73}
                          y={t.row * 70}
                          width="65"
                          height="62"
                          rx="6"
                          {...shapeProps(t.state)}
                        />
                        <text
                          x={t.col * 73 + 32.5}
                          y={t.row * 70 + 36}
                          className={styles.tileLabel}
                        >
                          {t.state}
                        </text>
                      </g>
                    ))}
                </g>
              )}
            </g>
          </svg>
        )}
        <div className={styles.zoomControls}>
          <button
            aria-label="Zoom in"
            disabled={camera.k >= 6}
            onClick={() => zoom(1.5)}
          >
            +
          </button>
          <button
            aria-label="Zoom out"
            disabled={camera.k <= 1}
            onClick={() => zoom(1 / 1.5)}
          >
            −
          </button>
          <button
            aria-label="Reset map view"
            title="Reset view"
            onClick={resetView}
          >
            ↺
          </button>
        </div>
        {hoverRace && !selected && (
          <div className={styles.hoverCard}>
            <strong>{hoverRace.label}</strong>
            <RaceQuote race={hoverRace} />
            <span>Click to explore this race</span>
          </div>
        )}
      </div>
      <div className={styles.legend}>
        <div className={styles.ramp}>
          <div>
            <span>Republican</span>
            <span>50 / 50</span>
            <span>Democratic</span>
          </div>
          <div className={styles.gradient} />
        </div>
        <div className={styles.legendKeys}>
          <span>
            <i style={{ background: OTHER_COLOR }} />
            Other leads
          </span>
          <span>
            <i className={styles.hatchSwatch} />
            Unpriced
          </span>
          <span>
            <i className={styles.noRaceSwatch} />
            No race
          </span>
        </div>
      </div>
      <p className={styles.hint}>
        {view === 'cartogram'
          ? `Each ${
              mode === 'house'
                ? 'hexagon is one House seat'
                : 'tile is one state'
            }. `
          : ''}
        Select a race to explore the odds. Zoom in to drag the map.
      </p>

      {selectedRace && (
        <section
          className={styles.details}
          aria-label={`${selectedRace.label} details`}
        >
          <div className={styles.detailHeading}>
            <div>
              <span className={styles.eyebrow}>
                {modeName(mode)} · {selectedRace.shortLabel}
              </span>
              <h3>{selectedRace.label}</h3>
            </div>
            <button
              ref={closeRef}
              aria-label="Close race details"
              onClick={closeDetails}
            >
              ×
            </button>
          </div>
          <div className={styles.detailSummary}>
            <span
              style={{
                color: TIERS.find((t) => t.id === raceTier(selectedRace))
                  ?.color,
              }}
            >
              {TIERS.find((t) => t.id === raceTier(selectedRace))?.label}
            </span>
            <RaceQuote race={selectedRace} />
          </div>
          {selectedRace.odds && (
            <div className={styles.raceBar}>
              {(['dem', 'rep', 'other'] as const).map((p, i) => (
                <span
                  key={p}
                  style={{
                    width: `${selectedRace.odds![p] * 100}%`,
                    background: [DEM_COLOR, REP_COLOR, OTHER_COLOR][i],
                  }}
                />
              ))}
            </div>
          )}
          {!selectedRace.contract ? (
            <p className={styles.empty}>
              No Manifold market is linked to this race yet. It is excluded from
              priced seat estimates.
            </p>
          ) : selectedRace.answerId &&
            selectedRace.contract.mechanism === 'cpmm-multi-1' &&
            selectedRace.contract.outcomeType === 'MULTIPLE_CHOICE' ? (
            <>
              <DistrictBetButtons
                contract={selectedRace.contract}
                answer={
                  selectedRace.contract.answers.find(
                    (a) => a.id === selectedRace.answerId
                  )!
                }
                label={selectedRace.label}
                matchup={selectedRace.matchup}
              />
            </>
          ) : (
            <RaceMarket contract={selectedRace.contract} />
          )}
          {candidate &&
            candidate.id !== selectedRace.contract?.id &&
            !(
              selectedRace.contract?.mechanism === 'cpmm-multi-1' &&
              selectedRace.contract.answers.some((a) =>
                isCandidateLabelledAnswer(a.text)
              )
            ) && (
              <div className={styles.candidates}>
                <span className={styles.eyebrow}>Candidate market</span>
                <RaceMarket contract={candidate} />
              </div>
            )}
        </section>
      )}

      <Modal
        open={sources}
        setOpen={setSources}
        ariaLabel="How to read the election map"
      >
        <div className={styles.sources}>
          <h2>How to read the map</h2>
          <p>
            Colors show the chance of winning implied by Manifold markets, not
            vote share. Darker colors mean a stronger favorite. Teal means an
            independent or other outcome leads; hatching means no usable market
            odds.
          </p>
          <p>
            The seat bar counts each seat once for its leading outcome. Exact
            ties and unpriced races stay separate. Senate totals include 34
            Democratic-caucus and 31 Republican seats not on the ballot.
            Republicans control a 50–50 Senate through the Vice President’s
            tie-breaking vote.
          </p>
          <p>
            Safe: 90% or higher. Likely: 75–90%. Lean: 60–75%. Toss-up: neither
            side reaches 60%. Select a segment to filter races.
          </p>
          <p>
            House coverage combines the curated competitive-district market with
            reviewed state-wide district and individual winner markets. Unlinked
            districts are unpriced, including safe seats; that does not mean
            there is no market anywhere on Manifold. Chamber-control odds are
            separate markets, not derived from the seat totals.
          </p>
          <p>
            Map geometry and cartogram coordinates:{' '}
            <a
              href="https://drops.mts.now/midterms/"
              target="_blank"
              rel="noreferrer"
            >
              Theo Jaffee / MTS
            </a>
            , September 24, 2026 dataset, based on Census geography and
            redistricting research. Missouri uses its 2022 map pending
            litigation. Boundaries are a snapshot.
          </p>
          <p>
            Prices update through Manifold’s subscriptions. Community markets
            may be thinly traded; an unchanged price is not a new forecast.
            Outcomes are normalized within each race for map colors.
          </p>
          <button className={styles.dismiss} onClick={() => setSources(false)}>
            Got it
          </button>
        </div>
      </Modal>
    </section>
  )
}

function RaceQuote({ race }: { race: Race }) {
  const party = leadingParty(race.odds)
  return (
    <span
      className={styles.quote}
      style={{
        color:
          party === 'dem'
            ? DEM_COLOR
            : party === 'rep'
            ? REP_COLOR
            : party === 'other'
            ? OTHER_COLOR
            : undefined,
      }}
    >
      {!race.odds
        ? 'Unpriced'
        : !party
        ? 'Tied'
        : `${party === 'dem' ? 'D' : party === 'rep' ? 'R' : 'Other'} ${pct(
            race.odds[party]
          )}`}
    </span>
  )
}

function RaceMarket({ contract }: { contract: Contract }) {
  return (
    <>
      {contract.mechanism === 'cpmm-multi-1' ? (
        <PartyPanel contract={contract} maxAnswers={5} />
      ) : contract.mechanism === 'cpmm-1' ? (
        <StateBinaryPartyPanel contract={contract} />
      ) : null}
    </>
  )
}

function ControlCard({
  label,
  contract,
}: {
  label: string
  contract: Contract | null
}) {
  const [outcome, setOutcome] = useState<'YES' | 'NO'>()
  const odds = electionOdds(contract)
  const rep = odds && odds.rep > odds.dem
  const tradable =
    contract?.mechanism === 'cpmm-1' &&
    contract.outcomeType === 'BINARY' &&
    !contract.isResolved &&
    (contract.closeTime == null || contract.closeTime > Date.now())
  const content = (
    <>
      <span>
        {label}
        <small>control</small>
      </span>
      <span className={styles.controlLeader}>
        <Image
          src={`/politics-party/${rep ? 'republican' : 'democrat'}_symbol.png`}
          alt={rep ? 'Republican elephant' : 'Democratic donkey'}
          width={28}
          height={28}
        />
        <strong style={{ color: rep ? REP_COLOR : DEM_COLOR }}>
          {odds ? pct(rep ? odds.rep : odds.dem) : '—'}
        </strong>
      </span>
      <div className={styles.controlBar}>
        {odds && (
          <>
            <i style={{ width: `${odds.dem * 100}%`, background: DEM_COLOR }} />
            <i style={{ width: `${odds.rep * 100}%`, background: REP_COLOR }} />
          </>
        )}
      </div>
    </>
  )
  return (
    <>
      <div className={styles.controlCard}>
        <button
          className={styles.controlMain}
          aria-label={`Bet on ${label} control`}
          aria-haspopup="dialog"
          disabled={!tradable}
          onClick={() => setOutcome(rep ? 'YES' : 'NO')}
        >
          {content}
        </button>
        {odds && (
          <div className={styles.controlBets}>
            <button
              disabled={!tradable}
              aria-haspopup="dialog"
              aria-label={`Bet Democratic ${label} control`}
              onClick={() => setOutcome('NO')}
              style={{ color: DEM_COLOR }}
            >
              D {pct(odds.dem)}
            </button>
            <button
              disabled={!tradable}
              aria-haspopup="dialog"
              aria-label={`Bet Republican ${label} control`}
              onClick={() => setOutcome('YES')}
              style={{ color: REP_COLOR }}
            >
              R {pct(odds.rep)}
            </button>
          </div>
        )}
      </div>
      {outcome &&
        contract?.mechanism === 'cpmm-1' &&
        contract.outcomeType === 'BINARY' && (
          <BetDialog
            contract={contract}
            open
            setOpen={(open) => !open && setOutcome(undefined)}
            initialOutcome={outcome}
            trackingLocation="election map control"
            questionPseudonym={`${label} control`}
            binaryPseudonym={{
              YES: { pseudonymName: 'Republican', pseudonymColor: 'sienna' },
              NO: { pseudonymName: 'Democratic', pseudonymColor: 'azure' },
            }}
          />
        )}
    </>
  )
}
