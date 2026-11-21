import { getDisplayProbability } from 'common/calculate'
import { BinaryContract, Contract } from 'common/contract'

// The Republican side of a chamber-control market (YES = Republicans hold the
// chamber), as a rounded percent for an OG stat row. Undefined when the market
// is missing or not binary — the card drops that row.
export function getControlRepPct(
  contract: Contract | null
): string | undefined {
  if (!contract || contract.mechanism !== 'cpmm-1') return undefined
  const prob = getDisplayProbability(contract as BinaryContract)
  if (!Number.isFinite(prob)) return undefined
  return Math.round(prob * 100).toString()
}

// "Oct 6, 2026, 9:30 PM ET": when the share card's odds were read. Formatted
// where the odds are read (getStaticProps), not in the edge image route, so the
// card shows the snapshot time rather than the crawl time.
export function formatOgAsOf(ms: number): string {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms))
  // Recent ICU puts a narrow no-break space before "PM"; keep plain spaces so
  // the edge route's strict query check accepts it.
  return `${formatted.replace(/\s+/g, ' ')} ET`
}

// Everything the /api/og/election card needs. The old card also carried a
// ~700-character per-state `fills` string for a fallback map layout that never
// rendered while the control markets exist; dropping it keeps the og:image URL
// short.
export function getElectionOgProps(props: {
  houseControlContract: Contract | null
  senateControlContract: Contract | null
  asOf: string
}) {
  return {
    houseRep: getControlRepPct(props.houseControlContract),
    senateRep: getControlRepPct(props.senateControlContract),
    asOf: props.asOf,
  }
}
