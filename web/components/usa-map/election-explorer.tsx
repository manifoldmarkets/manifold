import { useEffect, useId, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import Image from 'next/image'
import {
  MapIcon,
  ViewGridIcon,
  SearchIcon,
  AnnotationIcon,
} from '@heroicons/react/outline'
import { CongressHouse } from 'web/public/custom-components/congress_house'
import { CongressSenate } from 'web/public/custom-components/congress_senate'
import { Governor } from 'web/public/custom-components/governor'
import { ElectionBalance } from './election-balance'
import { Contract, contractPath } from 'common/contract'
import { formatPercent } from 'common/util/format'
import { MapContractsDictionary } from 'web/public/data/elections-data'
import { Modal } from 'web/components/layout/modal'
import { PartyPanel } from 'web/components/us-elections/contracts/party-panel/party-panel'
import { StateBinaryPartyPanel } from 'web/components/us-elections/contracts/party-panel/binary-party-panel'
import { BetDialog } from 'web/components/bet/bet-dialog'
import { DistrictBetButtons } from './district-bet-buttons'
import { RaceDetailsPanel } from './race-details-panel'
import {
  getHeldOffice,
  getIncumbentGroups,
  HELD_COLORS,
} from './election-incumbents'
import { DATA } from './usa-map-data'
import {
  DEM_COLOR,
  REP_COLOR,
  isCandidateLabelledAnswer,
  isColorLight,
} from './state-election-map'
import {
  Atlas,
  buildRaces,
  districtId,
  electionOdds,
  ElectionMode,
  leadingParty,
  matchesRaceQuery,
  matchesStateQuery,
  OTHER_COLOR,
  COMPLEMENT_COLOR,
  outcomeLabel,
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
  const [labels, setLabels] = useState(true)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Tier>()
  const [selected, setSelected] = useState<string>()
  const [hovered, setHovered] = useState<string>()
  const [sources, setSources] = useState(false)
  const [atlas, setAtlas] = useState<Atlas>()
  const [mapError, setMapError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const selectionOrigin = useRef<HTMLElement | SVGElement | null>(null)
  const explorerRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [searchOpen, setSearchOpen] = useState(false)
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
  const selectedNoRace =
    mode !== 'house' && selected && !selectedRace ? DATA[selected] : undefined
  const hoveredNoRace =
    mode !== 'house' && hovered && !hoverRace ? DATA[hovered] : undefined
  const matches = (race: Race) =>
    (!filter || raceTier(race) === filter) && matchesRaceQuery(race, query)
  const filtered = races.filter(matches)
  const noElectionMatches =
    mode === 'house' || filter || !query.trim()
      ? []
      : Object.entries(DATA).filter(
          ([state]) =>
            state !== 'DC' &&
            !raceById.has(state) &&
            matchesStateQuery(state, query)
        )

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus()
  }, [searchOpen])

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
    setSearchOpen(false)
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
    const noElection = mode !== 'house' && !race && !!DATA[id] && id !== 'DC'
    const selectable = !!race || noElection
    const held = noElection ? getHeldOffice(mode, id) : undefined
    return {
      fill: race
        ? raceColor(race) ?? `url(#${patternId})`
        : held
        ? `url(#${patternId}-${held.control})`
        : undefined,
      className: clsx(
        styles.shape,
        !race && !held && styles.noRace,
        selected === id && styles.selected
      ),
      opacity: race && !matches(race) ? 0.15 : 1,
      role: selectable ? 'button' : undefined,
      tabIndex: (race && matches(race)) || noElection ? 0 : -1,
      'aria-label': race
        ? `${race.label}, ${
            race.odds
              ? `${pct(Math.max(...Object.values(race.odds)))} ${
                  leadingParty(race.odds)
                    ? outcomeLabel(leadingParty(race.odds)!)
                    : 'tied'
                }`
              : 'unpriced'
          }`
        : `${DATA[id]?.name ?? id}: no ${modeName(mode)} election in 2026${
            held
              ? `. ${held.members
                  .map((m) => `${m.name}, ${m.party}`)
                  .join('; ')}`
              : ''
          }`,
      'aria-pressed': selectable ? selected === id : undefined,
      onPointerEnter: (e: React.PointerEvent<SVGElement>) => {
        if (e.pointerType === 'mouse' && selectable) setHovered(id)
      },
      onPointerLeave: () => setHovered(undefined),
      onClick: (e: React.MouseEvent<SVGElement>) => {
        if (selectable && !drag.current?.moved) choose(id, e.currentTarget)
      },
      onKeyDown: (e: React.KeyboardEvent<SVGElement>) => {
        if (selectable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          choose(id, e.currentTarget)
        }
      },
    }
  }
  const labelColor = (state: string) => {
    if (getHeldOffice(mode, state)) return '#fff'
    const race = raceById.get(state)
    const color = race && raceColor(race)
    return color ? (isColorLight(color) ? '#1e293b' : '#fff') : undefined
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
    <div className={styles.layout}>
      <div className={styles.controls} aria-label="Chamber control">
        <ControlCard label="Senate" contract={props.senateControl} />
        <ControlCard label="House" contract={props.houseControl} />
      </div>
      <section
        ref={explorerRef}
        className={styles.explorer}
        aria-label="2026 election explorer"
      >
        <header className={styles.header}>
          <ElectionBalance
            summary={summary}
            mode={mode}
            filter={filter}
            onFilter={(tier) => {
              setFilter(filter === tier ? undefined : tier)
              setSelected(undefined)
            }}
          />
          <div className={styles.toolbar}>
            <label className={styles.mobileMode}>
              <ChamberIcon mode={mode} />
              <select
                aria-label="Election type"
                value={mode}
                onChange={(e) => changeMode(e.target.value as ElectionMode)}
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {modeName(m)}
                  </option>
                ))}
              </select>
            </label>
            <div
              className={styles.tabs}
              role="tablist"
              aria-label="Election type"
            >
              {MODES.map((m, i) => (
                <button
                  key={m}
                  role="tab"
                  aria-label={modeName(m)}
                  title={modeName(m)}
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
                  <ChamberIcon mode={m} />
                  <span>{modeName(m)}</span>
                </button>
              ))}
            </div>

            <button
              className={styles.viewToggle}
              aria-label={`Switch to ${
                view === 'map' ? 'cartogram' : 'geographic map'
              }`}
              title={`Switch to ${
                view === 'map' ? 'cartogram' : 'geographic map'
              }`}
              onClick={() => {
                setView(view === 'map' ? 'cartogram' : 'map')
                resetView()
                setHovered(undefined)
              }}
            >
              {view === 'map' ? (
                <MapIcon aria-hidden />
              ) : (
                <ViewGridIcon aria-hidden />
              )}
              <span>{view === 'map' ? 'Map' : 'Cartogram'}</span>
            </button>
            <button
              className={clsx(styles.toolButton, labels && styles.activeTool)}
              aria-label="State labels"
              title="State labels"
              aria-pressed={labels}
              onClick={() => setLabels(!labels)}
            >
              <AnnotationIcon aria-hidden />
              <span>Labels</span>
            </button>
            <div className={styles.searchSlot}>
              <button
                className={clsx(
                  styles.searchToggle,
                  (searchOpen || query) && styles.activeTool
                )}
                aria-label="Search races"
                aria-expanded={searchOpen}
                title="Search races"
                onClick={() => setSearchOpen(!searchOpen)}
              >
                <SearchIcon aria-hidden />
              </button>
              <label className={styles.search} data-open={searchOpen}>
                <SearchIcon aria-hidden />
                <input
                  ref={searchRef}
                  aria-label="Find a state or district"
                  placeholder="Find a race"
                  value={query}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setSearchOpen(false)
                      e.currentTarget
                        .closest('div')
                        ?.querySelector('button')
                        ?.focus()
                    }
                  }}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setSelected(undefined)
                  }}
                />
                {query && (
                  <button
                    aria-label="Clear search"
                    onClick={() => setQuery('')}
                  >
                    ×
                  </button>
                )}
              </label>
            </div>
            <div
              className={styles.zoomControls}
              role="group"
              aria-label="Map zoom controls"
            >
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
          </div>
        </header>
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
        {(summary.leaders.notDem > 0 || summary.leaders.notRep > 0) && (
          <p className={styles.note}>
            {[
              summary.leaders.notDem > 0 &&
                `${summary.leaders.notDem} races favor a non-Democratic winner`,
              summary.leaders.notRep > 0 &&
                `${summary.leaders.notRep} races favor a non-Republican winner`,
            ]
              .filter(Boolean)
              .join(' · ')}
            . These outcomes are counted separately from party wins.
          </p>
        )}
        {(filter || query) && (
          <div className={styles.filterNotice} role="status">
            {filtered.length} matching races
            {filter && ` · ${TIERS.find((t) => t.id === filter)?.label}`}
            {noElectionMatches.length > 0 &&
              ` · ${noElectionMatches.length} with no election`}
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
        {query.trim() && (
          <div
            className={styles.results}
            role="region"
            aria-label="Race search results"
          >
            {filtered.map((r) => (
              <button key={r.id} onClick={(e) => choose(r.id, e.currentTarget)}>
                {r.label} <RaceQuote race={r} />
              </button>
            ))}
            {noElectionMatches.map(([state, data]) => (
              <button
                key={state}
                onClick={(e) => choose(state, e.currentTarget)}
              >
                {data.name} <span>No {modeName(mode)} election</span>
              </button>
            ))}
            {filtered.length === 0 && noElectionMatches.length === 0 && (
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
              data-mode={mode}
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
                const bounds = e.currentTarget.getBoundingClientRect()
                const ratio =
                  1 / Math.min(bounds.width / 960, bounds.height / 600)
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
                {Object.entries(HELD_COLORS).map(([party, colors]) => (
                  <pattern
                    key={party}
                    id={`${patternId}-${party}`}
                    width="8"
                    height="8"
                    patternUnits="userSpaceOnUse"
                  >
                    <rect width="8" height="8" fill={colors.background} />
                    <path
                      d="M0 0L8 8M8 0L0 8"
                      stroke={colors.hatch}
                      strokeWidth="2"
                    />
                  </pattern>
                ))}
                <pattern
                  id={patternId}
                  width="6"
                  height="6"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(35)"
                >
                  <rect width="6" height="6" className={styles.hatchBase} />
                  <path
                    d="M0 0V6"
                    className={styles.hatchLine}
                    strokeWidth="2"
                  />
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
                        <path
                          key={s.state}
                          d={s.path}
                          {...shapeProps(s.state)}
                        />
                      ))
                    )}
                    {labels &&
                      atlas.states
                        .filter(
                          (s) =>
                            ![
                              'DC',
                              'RI',
                              'DE',
                              'CT',
                              'MA',
                              'MD',
                              'NJ',
                            ].includes(s.state)
                        )
                        .map((s) => (
                          <text
                            key={s.state}
                            x={s.center[0]}
                            y={s.center[1]}
                            className={styles.stateLabel}
                            style={{ fill: labelColor(s.state) }}
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
                          const top = seats.reduce((a, b) =>
                            a.y < b.y ? a : b
                          )
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
                            style={{ fill: labelColor(t.state) }}
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
          {(hoverRace || hoveredNoRace) && !selected && (
            <div className={styles.hoverCard}>
              <strong>{hoverRace?.label ?? hoveredNoRace?.name}</strong>
              {hoverRace ? (
                <>
                  <RaceQuote race={hoverRace} />
                  <IncumbentDetails
                    mode={mode}
                    state={hoverRace.state}
                    district={hoverRace.district}
                  />
                  <span>Click to explore this race</span>
                </>
              ) : (
                <>
                  <span>No {modeName(mode)} election in 2026</span>
                  <IncumbentDetails mode={mode} state={hovered!} />
                </>
              )}
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
            {(summary.leaders.notDem > 0 || summary.leaders.notRep > 0) && (
              <span>
                <i style={{ background: COMPLEMENT_COLOR }} />
                Any other winner
              </span>
            )}
            <span>
              <i className={styles.hatchSwatch} />
              Unpriced
            </span>
            {mode !== 'house' && (
              <span>
                <i className={styles.noRaceSwatch} />
                Not on ballot · current party
              </span>
            )}
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
          Select a race to explore the odds. Zoom in to drag the map.{' '}
          <button onClick={() => setSources(true)}>More info</button>
        </p>

        {selectedNoRace && (
          <RaceDetailsPanel
            title={selectedNoRace.name}
            eyebrow={`2026 · ${modeName(mode)}`}
            label={`${selectedNoRace.name} election details`}
            closeRef={closeRef}
            onClose={closeDetails}
          >
            <p className={styles.empty}>
              No {mode === 'governor' ? 'gubernatorial' : 'Senate'} election in
              2026. This office is not on the ballot here.
            </p>
            <IncumbentDetails mode={mode} state={selected!} />
            <button
              className={styles.exploreState}
              onClick={() => {
                const name = selectedNoRace.name
                changeMode('house')
                setQuery(name)
              }}
            >
              Explore {selectedNoRace.name} House districts →
            </button>
          </RaceDetailsPanel>
        )}

        {selectedRace && (
          <RaceDetailsPanel
            title={selectedRace.label}
            chartLink={
              selectedRace.contract && (
                <MarketDetailsLink contract={selectedRace.contract} />
              )
            }
            eyebrow={`${modeName(mode)} · ${selectedRace.shortLabel}`}
            label={`${selectedRace.label} details`}
            closeRef={closeRef}
            onClose={closeDetails}
          >
            <div className={styles.detailSummary}>
              <span
                style={{
                  color: TIERS.find((t) => t.id === raceTier(selectedRace))
                    ?.color,
                }}
              >
                {TIERS.find((t) => t.id === raceTier(selectedRace))?.label}
              </span>
              {selectedRace.odds && <RaceQuote race={selectedRace} />}
            </div>
            {selectedRace.odds && (
              <div className={styles.raceBar}>
                {(['dem', 'rep', 'other', 'notDem', 'notRep'] as const).map(
                  (p, i) => (
                    <span
                      key={p}
                      style={{
                        width: `${(selectedRace.odds![p] ?? 0) * 100}%`,
                        background: [
                          DEM_COLOR,
                          REP_COLOR,
                          OTHER_COLOR,
                          COMPLEMENT_COLOR,
                          COMPLEMENT_COLOR,
                        ][i],
                      }}
                    />
                  )
                )}
              </div>
            )}
            <IncumbentDetails
              mode={mode}
              state={selectedRace.state}
              district={selectedRace.district}
            />
            {!selectedRace.contract ? (
              <p className={styles.empty}>
                No Manifold market is linked to this race yet. It is excluded
                from priced seat estimates.
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
                  <div className={styles.candidateHeading}>
                    <span className={styles.eyebrow}>Candidate market</span>
                    <MarketDetailsLink contract={candidate} />
                  </div>
                  <RaceMarket contract={candidate} />
                </div>
              )}
          </RaceDetailsPanel>
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
              independent or other outcome leads; gray hatching means no usable
              market odds. A gray “any other winner” quote is the NO side of a
              party-win question, including all other parties. It is counted
              separately from Democratic and Republican wins.
            </p>
            <p>
              Colored crosshatching marks offices not on the 2026 ballot and
              shows their current party, not election odds. Purple indicates a
              split Senate delegation. Select or hover over a state to see its
              sitting officeholders; Senate control colors group independents
              with their caucus.
            </p>
            <p>
              Held Senate seats are hatched at the ends of the balance bar; safe
              forecasts are separate. All 435 House seats are up in 2026, so an
              unpriced race is not a locked-in seat.
            </p>
            <p>
              Officeholders were checked on October 3, 2026 against the{' '}
              <a
                href="https://clerk.house.gov/xml/lists/MemberData.xml"
                target="_blank"
                rel="noopener noreferrer"
              >
                House Clerk
              </a>
              ,{' '}
              <a
                href="https://www.senate.gov/senators/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Senate
              </a>{' '}
              and{' '}
              <a
                href="https://www.nga.org/governors/"
                target="_blank"
                rel="noopener noreferrer"
              >
                National Governors Association
              </a>
              . House incumbents refer to current district numbers in the 119th
              Congress; 2026 boundaries may differ. Incumbents are not
              necessarily candidates for reelection.
            </p>
            <p>
              Candidate markets price the listed people. Their party colors come
              from the answer labels; check the market description for how other
              winners or replacement candidates are handled.
            </p>
            <p>
              The seat bar counts each seat once for its leading outcome. Exact
              ties and unpriced races stay separate. Senate totals include 34
              Democratic-caucus and 31 Republican seats not on the ballot.
              Republicans control a 50–50 Senate through the Vice President’s
              tie-breaking vote.
            </p>
            <p>
              Safe: 90% or higher. Likely: 75–90%. Lean: 60–75%. Toss-up:
              neither side reaches 60%. Select a segment to filter races.
            </p>
            <p>
              House coverage combines the curated competitive-district market
              with reviewed state-wide district and individual winner markets.
              Unlinked districts are unpriced, including safe seats; that does
              not mean there is no market anywhere on Manifold. Chamber-control
              odds are separate markets, not derived from the seat totals.
            </p>
            <p>
              District boundaries reflect a September 24, 2026 snapshot based on
              Census geography and redistricting research. Missouri uses its
              2022 map pending litigation.
            </p>
            <p>
              Prices update through Manifold’s subscriptions. Community markets
              may be thinly traded; an unchanged price is not a new forecast.
              Outcomes are normalized within each race for map colors.
            </p>
            <p className={styles.sourceCredit}>
              Map data:{' '}
              <a
                href="https://drops.mts.now/midterms/"
                target="_blank"
                rel="noreferrer"
              >
                MTS
              </a>
            </p>
            <button
              className={styles.dismiss}
              onClick={() => setSources(false)}
            >
              Got it
            </button>
          </div>
        </Modal>
      </section>
    </div>
  )
}

function ChamberIcon({ mode }: { mode: ElectionMode }) {
  return (
    <span className={styles.tabIcon} aria-hidden>
      {mode === 'house' ? (
        <CongressHouse height={6} />
      ) : mode === 'senate' ? (
        <CongressSenate height={6} />
      ) : (
        <Governor height={6} />
      )}
    </span>
  )
}

function IncumbentDetails({
  mode,
  state,
  district,
}: {
  mode: ElectionMode
  state: string
  district?: number
}) {
  const groups = getIncumbentGroups(mode, state, district)
  return (
    <>
      {groups.map((group) => (
        <div key={group.label} className={styles.incumbents}>
          <span className={styles.eyebrow}>{group.label}</span>
          {group.members.length === 0 && <span>Vacant</span>}
          {group.members.map((member) => (
            <span key={member.name}>
              <i
                style={{
                  background:
                    member.party === 'Democrat'
                      ? DEM_COLOR
                      : member.party === 'Republican'
                      ? REP_COLOR
                      : OTHER_COLOR,
                }}
              />
              {member.name}{' '}
              <small>
                ({member.party === 'Independent' ? 'I' : member.party[0]})
              </small>
            </span>
          ))}
        </div>
      ))}
    </>
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
        : `${outcomeLabel(party)} ${pct(race.odds[party] ?? 0)}`}
    </span>
  )
}

function RaceMarket({ contract }: { contract: Contract }) {
  return (
    <>
      {contract.mechanism === 'cpmm-multi-1' ? (
        <PartyPanel contract={contract} maxAnswers={5} />
      ) : contract.mechanism === 'cpmm-1' &&
        contract.outcomeType === 'BINARY' ? (
        <StateBinaryPartyPanel contract={contract} />
      ) : null}
    </>
  )
}

function MarketDetailsLink({ contract }: { contract: Contract }) {
  return (
    <a
      className={styles.chartLink}
      href={contractPath(contract)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Read description and comments: ${contract.question} (opens in a new tab)`}
    >
      chart →
    </a>
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
  const odds = electionOdds(contract, true)
  const rep = odds && odds.rep > odds.dem
  const tradable =
    contract?.mechanism === 'cpmm-1' &&
    contract.outcomeType === 'BINARY' &&
    !contract.isResolved &&
    (contract.closeTime == null || contract.closeTime > Date.now())
  const content = (
    <>
      <span className={styles.controlIcon}>
        <Image
          src={`/politics-party/${rep ? 'republican' : 'democrat'}_symbol.png`}
          alt={rep ? 'Republican elephant' : 'Democratic donkey'}
          width={32}
          height={32}
        />
      </span>
      <span className={styles.controlLeader}>
        <strong style={{ color: rep ? REP_COLOR : DEM_COLOR }}>
          {odds ? pct(rep ? odds.rep : odds.dem) : '—'}
        </strong>
      </span>
      <span className={styles.controlParty}>
        {odds ? (rep ? 'Republican' : 'Democratic') : 'Unavailable'}
      </span>
    </>
  )
  return (
    <>
      <div className={styles.controlCard}>
        <div className={styles.controlTop}>
          <span>{label} control</span>
          {contract && (
            <a
              className={styles.chartLink}
              href={contractPath(contract)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${label} control chart, description and comments (opens in a new tab)`}
            >
              chart →
            </a>
          )}
        </div>
        <button
          className={styles.controlMain}
          aria-label={`Bet on ${label} control`}
          aria-haspopup="dialog"
          disabled={!tradable}
          onClick={() => setOutcome(rep ? 'YES' : 'NO')}
        >
          {content}
        </button>
        <div className={styles.controlBar}>
          {odds && (
            <>
              <i
                style={{ width: `${odds.dem * 100}%`, background: DEM_COLOR }}
              />
              <i
                style={{ width: `${odds.rep * 100}%`, background: REP_COLOR }}
              />
            </>
          )}
        </div>
        {odds && (
          <div className={styles.controlBets}>
            <button
              disabled={!tradable}
              aria-haspopup="dialog"
              aria-label={`Bet Democratic ${label} control`}
              onClick={() => setOutcome('NO')}
              style={{ color: DEM_COLOR }}
            >
              <span>Dem</span> <strong>{pct(odds.dem)}</strong>
            </button>
            <button
              disabled={!tradable}
              aria-haspopup="dialog"
              aria-label={`Bet Republican ${label} control`}
              onClick={() => setOutcome('YES')}
              style={{ color: REP_COLOR }}
            >
              <span>Rep</span> <strong>{pct(odds.rep)}</strong>
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
