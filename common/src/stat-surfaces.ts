import { groupBy, mapValues, minBy, uniq } from 'lodash'

// Pages whose funnels /stats breaks out: how many signed-in users reach each
// one, how many get there from its pill on the home page, and how many of
// them trade there.
export const STAT_SURFACES = ['sports', 'midterms', 'perps'] as const
export type StatSurface = (typeof STAT_SURFACES)[number]

type StatSurfaceDefinition = {
  label: string
  // Path prefixes of the surface's pages. web/lib/service/analytics.ts tags
  // every event fired on them with `surface`.
  paths: string[]
  // `topic` of the home pill's 'select search topic' event
  // (web/components/search.tsx).
  pillTopic: string
  // Page-view events the pages logged before events carried `surface`, so
  // days from before the tag existed still count visitors.
  legacyViewEvents: string[]
  legacyViewEventPrefixes: string[]
}

export const STAT_SURFACE_DEFINITIONS: Record<
  StatSurface,
  StatSurfaceDefinition
> = {
  sports: {
    label: 'Sports',
    paths: ['/sports'],
    pillTopic: 'sports',
    legacyViewEvents: ['view /sports', 'view world cup dashboard'],
    legacyViewEventPrefixes: ['view /sports/'],
  },
  midterms: {
    label: 'Midterms',
    paths: ['/election'],
    pillTopic: 'midterms-2026',
    legacyViewEvents: ['view us midterms page 2026'],
    legacyViewEventPrefixes: [],
  },
  perps: {
    label: 'Perps',
    paths: ['/perps'],
    pillTopic: 'perps',
    legacyViewEvents: ['view perps page'],
    legacyViewEventPrefixes: [],
  },
}

export const isStatSurface = (value: unknown): value is StatSurface =>
  STAT_SURFACES.includes(value as StatSurface)

export const getStatSurface = (pathname: string): StatSurface | undefined =>
  STAT_SURFACES.find((surface) =>
    STAT_SURFACE_DEFINITIONS[surface].paths.some(
      (path) => pathname === path || pathname.startsWith(path + '/')
    )
  )

// Bets become contract interactions rather than user_events rows, so the web
// client logs one of these alongside each trade placed on a surface page.
export const SURFACE_TRADE_EVENT = 'surface trade'
// The tracked events that count as a trade.
export const SURFACE_TRADE_SOURCE_EVENTS = ['bet', 'perp trade']

const PILL_EVENT = 'select search topic'

export type SurfaceFunnelDay = {
  // Signed-in users who clicked the surface's pill on the home page.
  pillUsers: number
  // Signed-in users who opened one of the surface's pages.
  visitors: number
  // Visitors who traded anywhere on the site that day, here or elsewhere.
  tradedAnywhere: number
  // Visitors who traded on one of the surface's pages. The three trade counts
  // are null for days before trades were tagged with their page.
  tradedHere: number | null
  trades: number | null
  // Pill clickers who traded on the surface after clicking.
  pillTraded: number | null
}

export type SurfaceFunnels = Record<StatSurface, SurfaceFunnelDay>

// One user_events row, as the stats job reads it.
export type SurfaceEventRow = {
  userId: string
  tsMs: number
  name: string
  topic: string | null
  surface: string | null
}

type ClassifiedEvent = {
  kind: 'pill' | 'view' | 'trade'
  surface: StatSurface
  userId: string
  tsMs: number
}

const legacyViewSurface = (name: string) =>
  STAT_SURFACES.find((surface) => {
    const def = STAT_SURFACE_DEFINITIONS[surface]
    return (
      def.legacyViewEvents.includes(name) ||
      def.legacyViewEventPrefixes.some((prefix) => name.startsWith(prefix))
    )
  })

export const classifySurfaceEvent = (
  row: SurfaceEventRow
): ClassifiedEvent | undefined => {
  const { userId, tsMs, name } = row
  // Pills live on the home page, so the topic says which surface they lead to.
  if (name === PILL_EVENT) {
    const surface = STAT_SURFACES.find(
      (s) => STAT_SURFACE_DEFINITIONS[s].pillTopic === row.topic
    )
    return surface && { kind: 'pill', surface, userId, tsMs }
  }
  const tagged = isStatSurface(row.surface) ? row.surface : undefined
  if (name === SURFACE_TRADE_EVENT)
    return tagged && { kind: 'trade', surface: tagged, userId, tsMs }
  if (!name.startsWith('view ')) return undefined
  const surface = tagged ?? legacyViewSurface(name)
  return surface && { kind: 'view', surface, userId, tsMs }
}

// Users the funnels count as visitors of any surface: the ids to look up
// trades for before calling computeSurfaceFunnels.
export const getSurfaceVisitorIds = (rows: SurfaceEventRow[]) =>
  uniq(
    rows
      .map(classifySurfaceEvent)
      .filter((e) => e && e.kind !== 'pill')
      .map((e) => e!.userId)
  )

// One day of funnels. `tradedAnywhereIds` holds the visitors who placed any
// trade that day. A day with no trade events at all predates trade tagging,
// so its trade counts are null rather than zero.
export const computeSurfaceFunnels = (
  rows: SurfaceEventRow[],
  tradedAnywhereIds: Set<string>
): SurfaceFunnels => {
  const events = rows
    .map(classifySurfaceEvent)
    .filter((e): e is ClassifiedEvent => !!e)
  const tracked = events.some((e) => e.kind === 'trade')
  const bySurface = groupBy(events, (e) => e.surface)

  const funnelFor = (surface: StatSurface): SurfaceFunnelDay => {
    const surfaceEvents = bySurface[surface] ?? []
    const trades = surfaceEvents.filter((e) => e.kind === 'trade')
    // A trade on the page is a visit even if its page view never landed.
    const visitorIds = uniq(
      surfaceEvents.filter((e) => e.kind !== 'pill').map((e) => e.userId)
    )
    const traderIds = new Set(trades.map((e) => e.userId))
    const firstPillMs = mapValues(
      groupBy(
        surfaceEvents.filter((e) => e.kind === 'pill'),
        (e) => e.userId
      ),
      (pills) => minBy(pills, (e) => e.tsMs)!.tsMs
    )
    const pillTraded = Object.entries(firstPillMs).filter(([userId, ms]) =>
      trades.some((t) => t.userId === userId && t.tsMs >= ms)
    ).length

    return {
      pillUsers: Object.keys(firstPillMs).length,
      visitors: visitorIds.length,
      tradedAnywhere: visitorIds.filter((id) => tradedAnywhereIds.has(id))
        .length,
      tradedHere: tracked ? traderIds.size : null,
      trades: tracked ? trades.length : null,
      pillTraded: tracked ? pillTraded : null,
    }
  }

  return {
    sports: funnelFor('sports'),
    midterms: funnelFor('midterms'),
    perps: funnelFor('perps'),
  }
}

const countOrNull = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null

// Reads a daily_stats.surface_funnels value. Each surface is read on its own
// and dropped if missing or malformed, so adding a surface later leaves the
// older rows readable for the rest.
export const parseSurfaceFunnels = (
  json: unknown
): Partial<SurfaceFunnels> | undefined => {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return undefined
  const record = json as Record<string, unknown>
  const parsed: Partial<SurfaceFunnels> = {}
  for (const surface of STAT_SURFACES) {
    const day = record[surface]
    if (!day || typeof day !== 'object' || Array.isArray(day)) continue
    const d = day as Record<string, unknown>
    const pillUsers = countOrNull(d.pillUsers)
    const visitors = countOrNull(d.visitors)
    const tradedAnywhere = countOrNull(d.tradedAnywhere)
    if (pillUsers === null || visitors === null || tradedAnywhere === null)
      continue
    parsed[surface] = {
      pillUsers,
      visitors,
      tradedAnywhere,
      tradedHere: countOrNull(d.tradedHere),
      trades: countOrNull(d.trades),
      pillTraded: countOrNull(d.pillTraded),
    }
  }
  return parsed
}
