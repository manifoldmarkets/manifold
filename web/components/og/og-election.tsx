import Logo from 'web/public/logo.svg'
import { DATA } from 'web/components/usa-map/usa-map-data'

export type OgElectionProps = {
  // Compact per-state shading from getSenateOgFills: "AL:9d3336,AK:r,...".
  fills?: string
  // Republican % (0-100) in the Senate-control market, from
  // getSenateControlRepPct. Drives the headline and the party bar.
  rep?: string
}

// These mirror the interactive map's constants (usa-map.tsx / usa-state.tsx /
// state-election-map.tsx), which can't be imported here without dragging
// client components and hooks into the edge bundle.
const DEM_COLOR = '#5671ba'
const REP_COLOR = '#c25555'
const DEFAULT_STATE_FILL = '#e7dfe6'
const PATTERN_SIZE = 8
const CROSSHATCH = {
  d: { background: '#4a5fa8', line: '#262c45' }, // both seats Dem, not up
  r: { background: '#9d3336', line: '#3e1316' }, // both seats Rep, not up
  p: { background: '#73496f', line: '#321f2d' }, // split delegation, not up
}

const HEX_TOKEN = /^[0-9a-fA-F]{6}$/

function parseFills(fills: string | undefined): Record<string, string> {
  const result: Record<string, string> = {}
  if (!fills) return result
  for (const token of fills.split(',')) {
    const [state, value] = token.split(':')
    if (!state || !value || !DATA[state]) continue
    if (HEX_TOKEN.test(value)) {
      result[state] = `#${value}`
    } else if (value in CROSSHATCH) {
      result[state] = `url(#hatch-${value})`
    }
  }
  return result
}

function crosshatchPattern(key: keyof typeof CROSSHATCH) {
  const { background, line } = CROSSHATCH[key]
  return (
    `<pattern id="hatch-${key}" patternUnits="userSpaceOnUse" width="${PATTERN_SIZE}" height="${PATTERN_SIZE}">` +
    `<rect width="${PATTERN_SIZE}" height="${PATTERN_SIZE}" fill="${background}"/>` +
    `<line x1="0" y1="0" x2="${PATTERN_SIZE}" y2="${PATTERN_SIZE}" stroke="${line}" stroke-width="2"/>` +
    `<line x1="${PATTERN_SIZE}" y1="0" x2="0" y2="${PATTERN_SIZE}" stroke="${line}" stroke-width="2"/>` +
    `</pattern>`
  )
}

// The USA map as a standalone SVG, embedded as a data-URI <img> — satori can't
// lay out raw <svg> children, but resvg rasterizes embedded SVG images
// (patterns included) faithfully.
function buildMapDataUri(fills: Record<string, string>) {
  const defs = (Object.keys(CROSSHATCH) as (keyof typeof CROSSHATCH)[])
    .map(crosshatchPattern)
    .join('')
  const paths = Object.entries(DATA)
    .map(
      ([state, { dimensions }]) =>
        `<path d="${dimensions}" fill="${
          fills[state] ?? DEFAULT_STATE_FILL
        }" stroke="#ffffff" stroke-width="1"/>`
    )
    .join('')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 959 593">` +
    `<defs>${defs}</defs>${paths}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

// Leads with the market's actual story ("Republicans 71% to keep the Senate")
// rather than restating the question. Republicans hold the chamber going into
// 2026, hence keep/flip phrasing; within a few points it's called a coin flip.
function Headline(props: { repPct: number | undefined }) {
  const { repPct } = props
  if (repPct === undefined) {
    return (
      <div className="mt-1 flex text-3xl text-gray-900">
        Who wins the Senate in 2026?
      </div>
    )
  }
  if (repPct >= 47 && repPct <= 53) {
    return (
      <div className="mt-1 flex text-3xl text-gray-900">
        The Senate is a coin flip
      </div>
    )
  }
  const repLeads = repPct > 53
  return (
    <div className="mt-1 flex flex-row text-3xl text-gray-900">
      <span style={{ color: repLeads ? REP_COLOR : DEM_COLOR }}>
        {repLeads ? `Republicans ${repPct}%` : `Democrats ${100 - repPct}%`}
      </span>
      <span>
        {repLeads ? '\u00A0to keep the Senate' : '\u00A0to flip the Senate'}
      </span>
    </div>
  )
}

function parseRepPct(rep: string | undefined) {
  if (rep === undefined || !/^\d{1,3}$/.test(rep)) return undefined
  const pct = parseInt(rep)
  return pct <= 100 ? pct : undefined
}

export function OgElection(props: OgElectionProps) {
  const mapSrc = buildMapDataUri(parseFills(props.fills))
  const repPct = parseRepPct(props.rep)

  return (
    <div className="flex h-full w-full flex-col bg-white px-6 py-3">
      <div className="flex w-full flex-row items-center justify-between">
        <div className="flex flex-row items-center">
          <Logo className="h-9 w-9" stroke="#4338ca" />
          <span
            className="text-2xl font-thin uppercase text-indigo-700"
            style={{ fontFamily: 'var(--font-main), Figtree-light' }}
          >
            Manifold
          </span>
        </div>
        <span className="flex text-sm text-gray-500">
          2026 Midterms · live odds
        </span>
      </div>

      <Headline repPct={repPct} />

      {repPct !== undefined && (
        <div className="mt-2 flex h-3 w-full flex-row overflow-hidden rounded-full">
          <div
            className="flex h-full"
            style={{ width: `${100 - repPct}%`, backgroundColor: DEM_COLOR }}
          />
          <div
            className="flex h-full"
            style={{ width: `${repPct}%`, backgroundColor: REP_COLOR }}
          />
        </div>
      )}

      <div className="flex w-full flex-1 items-center justify-center">
        <img src={mapSrc} width={310} height={192} alt="" />
      </div>
    </div>
  )
}
