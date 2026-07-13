import Logo from 'web/public/logo.svg'
import { DATA } from 'web/components/usa-map/usa-map-data'

export type OgElectionProps = {
  // Compact per-state shading from getSenateOgFills: "AL:9d3336,AK:r,...".
  fills?: string
}

// These mirror the interactive map's constants (usa-map.tsx / usa-state.tsx),
// which can't be imported here without dragging client components and hooks
// into the edge bundle.
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

export function OgElection(props: OgElectionProps) {
  const mapSrc = buildMapDataUri(parseFills(props.fills))

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

      <div className="mt-1 flex text-2xl text-gray-900">
        Which party will win the Senate?
      </div>

      <div className="flex w-full flex-1 items-center justify-center">
        <img src={mapSrc} width={340} height={210} alt="" />
      </div>
    </div>
  )
}
