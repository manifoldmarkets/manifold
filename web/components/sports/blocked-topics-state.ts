import { uniq } from 'lodash'
import { RaceWeekend } from 'common/race-weekends'
import { ScheduleGame, SportInfo, SportsSubtopic } from 'common/sports-schedule'

/** Whether a sports page leaves out a market with these topic slugs. */
export type HidesBlocked = (
  groupSlugs: readonly string[] | undefined
) => boolean

// Sports itself, and the stray generic Sports topic: every sports page is in
// them.
const SPORTS_SLUGS = ['sports-default', 'sports']

/**
 * The topics a sports page is about: Sports, the page's own topic (the
 * sport's main topic, or the open topic), and every topic above it
 * (Basketball above the NBA). Blocking one of them doesn't empty the page; a
 * blocked topic under it (Premier League under Soccer) still stays off.
 */
export function ownTopicSlugs(
  sport: Pick<SportInfo, 'slug' | 'groupIds'> | 'all' | undefined,
  topic: Pick<SportsSubtopic, 'id' | 'slug'> | undefined,
  topics:
    | readonly Pick<SportsSubtopic, 'id' | 'slug' | 'groupIds'>[]
    | undefined
): string[] {
  const subtopicIds = new Set((topics ?? []).map((t) => t.id))
  // A sport's topics are its main topic and the ones it claims, which are
  // other topics under Sports.
  const mainId =
    sport && sport !== 'all'
      ? sport.groupIds.find((id) => !subtopicIds.has(id))
      : undefined
  const pageIds = [mainId, topic?.id].filter((id): id is string => !!id)
  // A topic covers itself and the topics under it.
  const above = (topics ?? [])
    .filter((t) => t.groupIds.some((id) => pageIds.includes(id)))
    .map((t) => t.slug)
  return uniq([
    ...SPORTS_SLUGS,
    ...(sport && sport !== 'all' && sport.slug ? [sport.slug] : []),
    ...(topic ? [topic.slug] : []),
    ...above,
  ])
}

/**
 * A page's filter for the topics the visitor blocked: a market in one of them
 * stays off the page, unless that topic is one the page is about.
 */
export function blockedTopicFilter(
  blocked: readonly string[] | undefined,
  ownSlugs: readonly string[]
): HidesBlocked {
  const own = new Set(ownSlugs)
  const hidden = new Set((blocked ?? []).filter((s) => !own.has(s)))
  return (groupSlugs) =>
    hidden.size > 0 && !!groupSlugs?.some((s) => hidden.has(s))
}

/**
 * The games and F1 weekends a page lists, without blocked topics'. A weekend
 * goes by its markets' topics (from an older API, by its sport's topic).
 */
export function unblockedSchedule<
  G extends Pick<ScheduleGame, 'groupSlugs'>,
  W extends Pick<RaceWeekend, 'sport' | 'groupSlugs'>
>(
  games: readonly G[],
  weekends: readonly W[],
  hides: HidesBlocked,
  sportsByKey: Record<string, Pick<SportInfo, 'slug'>>
): { games: G[]; weekends: W[] } {
  return {
    games: games.filter((g) => !hides(g.groupSlugs)),
    weekends: weekends.filter((w) => {
      const slug = sportsByKey[w.sport]?.slug
      return !hides(w.groupSlugs ?? (slug ? [slug] : []))
    }),
  }
}

/**
 * Whether a page should load more of its feed because the visitor's blocks
 * hide everything loaded so far: there's more, and the last try at this
 * length (`stuckAt`) didn't fail.
 */
export function shouldLoadPastBlocked(state: {
  shown: number
  loaded: number
  hasMore: boolean
  stuckAt: number | undefined
}) {
  const { shown, loaded, hasMore, stuckAt } = state
  return shown === 0 && loaded > 0 && hasMore && stuckAt !== loaded
}

/**
 * How many games and F1 weekends a feed shows: those not finished (a live
 * update can finish one the server sent as on).
 */
export function shownCount(
  games: readonly Pick<ScheduleGame, 'status'>[],
  weekends: readonly Pick<RaceWeekend, 'status'>[]
) {
  return (
    games.filter((g) => g.status !== 'finished').length +
    weekends.filter((w) => w.status !== 'finished').length
  )
}
