import Logo from 'web/public/logo.svg'
import { DATA } from 'web/components/usa-map/usa-map-data'

export type OgElectionProps = {
  // Compact per-state shading from getSenateOgFills: "AL:9d3336,AK:r,...".
  // Only rendered in the fallback (map) layout when no stat rows are available.
  fills?: string
  // Republican % (0-100) in the House- and Senate-control markets, from
  // getControlRepPct (YES = Republicans, as in BalanceOfPowerPanel).
  houseRep?: string
  senateRep?: string
  // Democratic / Republican % (0-100) in the 2028 presidency party market,
  // from getWhiteHouse2028Probs. May not sum to 100 (other parties).
  whDem?: string
  whRep?: string
}

// These mirror the interactive map's constants (usa-map.tsx / usa-state.tsx /
// state-election-map.tsx), which can't be imported here without dragging
// client components and hooks into the edge bundle.
const DEM_COLOR = '#5671ba'
const REP_COLOR = '#c25555'
const OTHER_COLOR = '#d1d5db'
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

function parsePct(pct: string | undefined) {
  if (pct === undefined || !/^\d{1,3}$/.test(pct)) return undefined
  const parsed = parseInt(pct)
  return parsed <= 100 ? parsed : undefined
}

// One headline stat: a party-colored sentence quoting the leader's exact odds
// ("Democrats 64% to flip the House") over the page's two-tone odds bar. The
// gray remainder on the bar is probability on neither major party.
function StatRow(props: {
  demPct: number
  repPct: number
  repLeadsText: string
  demLeadsText: string
}) {
  const { demPct, repPct, repLeadsText, demLeadsText } = props
  const repLeads = repPct >= demPct
  return (
    <div className="flex w-full flex-col">
      <div className="flex flex-row text-2xl text-gray-900">
        <span style={{ color: repLeads ? REP_COLOR : DEM_COLOR }}>
          {repLeads ? `Republicans ${repPct}%` : `Democrats ${demPct}%`}
        </span>
        <span>{'\u00A0' + (repLeads ? repLeadsText : demLeadsText)}</span>
      </div>
      <div
        className="mt-2 flex h-2.5 w-full flex-row overflow-hidden rounded-full"
        style={{ backgroundColor: OTHER_COLOR }}
      >
        <div
          className="flex h-full"
          style={{ width: `${demPct}%`, backgroundColor: DEM_COLOR }}
        />
        <div
          className="ml-auto flex h-full"
          style={{ width: `${repPct}%`, backgroundColor: REP_COLOR }}
        />
      </div>
    </div>
  )
}

export function OgElection(props: OgElectionProps) {
  const houseRep = parsePct(props.houseRep)
  const senateRep = parsePct(props.senateRep)
  const whDem = parsePct(props.whDem)
  const whRep = parsePct(props.whRep)

  // House first (usually the closer, more informative race), then Senate, then
  // the 2028 White House. Republicans hold all three going into 2026, hence
  // keep/flip phrasing for the chambers; ties read as the incumbent side.
  const rows = [
    houseRep !== undefined && (
      <StatRow
        key="house"
        demPct={100 - houseRep}
        repPct={houseRep}
        repLeadsText="to keep the House"
        demLeadsText="to flip the House"
      />
    ),
    senateRep !== undefined && (
      <StatRow
        key="senate"
        demPct={100 - senateRep}
        repPct={senateRep}
        repLeadsText="to keep the Senate"
        demLeadsText="to flip the Senate"
      />
    ),
    whDem !== undefined && whRep !== undefined && (
      <StatRow
        key="wh"
        demPct={whDem}
        repPct={whRep}
        repLeadsText="to win the White House in 2028"
        demLeadsText="to win the White House in 2028"
      />
    ),
  ].filter(Boolean)

  return (
    <div className="flex h-full w-full flex-col bg-white px-8 py-4">
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
        <span className="flex text-sm text-gray-500">Live election odds</span>
      </div>

      {rows.length > 0 ? (
        <div className="flex w-full flex-1 flex-col justify-around">{rows}</div>
      ) : (
        // Fallback when no control markets are readable: the question plus the
        // live-shaded Senate map. A real div, not a fragment — satori drops
        // fragment children out of flex layout.
        <div className="flex w-full flex-1 flex-col">
          <div className="mt-1 flex text-3xl text-gray-900">
            Who wins the Senate in 2026?
          </div>
          <div className="flex w-full flex-1 items-center justify-center">
            <img
              src={buildMapDataUri(parseFills(props.fills))}
              width={310}
              height={192}
              alt=""
            />
          </div>
        </div>
      )}
    </div>
  )
}
