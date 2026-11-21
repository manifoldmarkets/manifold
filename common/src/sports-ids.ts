import { BdlLeagueKey, isBdlLeagueKey } from './bdl/leagues'

// F1 session and title markets retain the existing helpers and namespaces in f1-markets.ts.
type PairLeague = 'atp' | 'wta' | 'mma'
type SingleEventLeague = Exclude<BdlLeagueKey, PairLeague | 'f1'>

const isPairLeague = (league: BdlLeagueKey): league is PairLeague =>
  league === 'atp' || league === 'wta' || league === 'mma'

const isProviderId = (id: number) => Number.isSafeInteger(id) && id > 0
const isSlug = (value: string) => /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value)

function parseProviderId(raw: string): number | null {
  const value = Number(raw)
  return isProviderId(value) && raw === String(value) ? value : null
}

export function bdlEventId(
  league: SingleEventLeague,
  id: number,
  suffix?: string
) {
  if (!isProviderId(id) || (suffix !== undefined && !isSlug(suffix)))
    throw new Error('Invalid BDL event ID or suffix')
  return `bdl:${league}:${id}${suffix === undefined ? '' : ':' + suffix}`
}

export function bdlHeadToHeadEventId(
  league: PairLeague,
  id: number,
  firstEntrant: number,
  secondEntrant: number
) {
  if (
    ![id, firstEntrant, secondEntrant].every(isProviderId) ||
    firstEntrant === secondEntrant
  )
    throw new Error('Invalid BDL event or entrant pair')
  return `bdl:${league}:${id}:${Math.min(
    firstEntrant,
    secondEntrant
  )}-${Math.max(firstEntrant, secondEntrant)}`
}

type ParsedBdlEventId =
  | { league: SingleEventLeague; id: number; suffix?: string }
  | { league: PairLeague; id: number; entrantIds: readonly [number, number] }

export function parseBdlEventId(
  value: string | null | undefined
): ParsedBdlEventId | null {
  if (!value) return null
  const [prefix, league, rawId, suffix, ...extra] = value.split(':')
  if (
    prefix !== 'bdl' ||
    !isBdlLeagueKey(league) ||
    league === 'f1' ||
    extra.length
  )
    return null
  const id = parseProviderId(rawId)
  if (id === null) return null
  if (isPairLeague(league)) {
    const pair = suffix?.split('-')
    if (!pair || pair.length !== 2) return null
    const low = parseProviderId(pair[0])
    const high = parseProviderId(pair[1])
    if (low === null || high === null || low >= high) return null
    return { league, id, entrantIds: [low, high] }
  }
  if (suffix === undefined) return { league, id }
  return isSlug(suffix) ? { league, id, suffix } : null
}

export function fixtureEventId(league: BdlLeagueKey, id: string) {
  if (!isSlug(id)) throw new Error('Invalid fixture ID')
  return `fixture:${league}:${id}`
}

export function parseFixtureEventId(value: string | null | undefined) {
  if (!value) return null
  const [prefix, league, id, ...extra] = value.split(':')
  return prefix === 'fixture' &&
    isBdlLeagueKey(league) &&
    !!id &&
    isSlug(id) &&
    !extra.length
    ? { league, id }
    : null
}
