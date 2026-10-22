// The explorer's shareable state: `?office=house|senate|governor|measures`
// and `&race=<Race.id>` (House "NY-14", at-large "AK-0"; Senate and
// Governor use the state code, e.g. "ME"). Other pages link to these URLs,
// so keep the parameter names and formats stable.

import { DATA } from './usa-map-data'

export type ExplorerMode = 'house' | 'senate' | 'governor' | 'measures'
export const EXPLORER_MODES: ExplorerMode[] = [
  'house',
  'senate',
  'governor',
  'measures',
]
export const DEFAULT_MODE: ExplorerMode = 'senate'

type QueryValue = string | string[] | undefined
const first = (value: QueryValue) => (Array.isArray(value) ? value[0] : value)

// Accepts "ny-14", "NY14", "NY 14", "AK-AL" and "me"; returns "NY-14",
// "AK-0" or "ME", or undefined for anything else.
export function normalizeRaceId(raw: QueryValue): string | undefined {
  const value = first(raw)
    ?.trim()
    .toUpperCase()
    .replace(/[\s–—‑_]+/g, '-')
  if (!value) return undefined
  const district = /^([A-Z]{2})-?(\d{1,2}|AL)$/.exec(value)
  if (district)
    return `${district[1]}-${district[2] === 'AL' ? 0 : Number(district[2])}`
  return /^[A-Z]{2}$/.test(value) ? value : undefined
}

export const isDistrictId = (race: string) => race.includes('-')

// Whether a normalized race id exists on that tab: a real district for the
// House, any state for the statewide tabs (states without a 2026 race open
// their officeholders), never DC.
export function isKnownRace(mode: ExplorerMode, race: string) {
  if (mode !== 'house')
    return !isDistrictId(race) && !!DATA[race] && race !== 'DC'
  const [state, number] = race.split('-')
  const data = DATA[state]
  if (!data || state === 'DC') return false
  const seats = data.electoralVotes - 2
  const district = Number(number)
  return seats === 1 ? district === 0 : district >= 1 && district <= seats
}

export function parseExplorerQuery(query: Record<string, QueryValue>): {
  mode?: ExplorerMode
  race?: string
} {
  const office = first(query.office)?.trim().toLowerCase()
  const race = normalizeRaceId(query.race)
  // Without an office, a district implies House and a state its Senate race.
  const mode =
    EXPLORER_MODES.find((m) => m === office) ??
    (race ? (isDistrictId(race) ? 'house' : DEFAULT_MODE) : undefined)
  // A district only belongs on the House tab, a state on the others.
  const fits = !!race && !!mode && (mode === 'house') === isDistrictId(race)
  return { mode, race: fits ? race : undefined }
}

// The query string for this state, keeping unrelated parameters (referral,
// campaign tags) in place. The default view needs no parameters at all.
export function explorerSearch(
  currentSearch: string,
  mode: ExplorerMode,
  race?: string
): string {
  const params = new URLSearchParams(currentSearch)
  params.delete('office')
  params.delete('race')
  if (mode !== DEFAULT_MODE || race) params.set('office', mode)
  if (race) params.set('race', race)
  const search = params.toString()
  return search ? `?${search}` : ''
}

// For a page-level Share button: its own query (e.g. the sharer's referral)
// plus the explorer's current tab and race, read from the live URL.
export function shareSearch(baseSearch: string, locationSearch: string) {
  const params = new URLSearchParams(locationSearch)
  const { mode, race } = parseExplorerQuery({
    office: params.get('office') ?? undefined,
    race: params.get('race') ?? undefined,
  })
  return mode ? explorerSearch(baseSearch, mode, race) : baseSearch
}
