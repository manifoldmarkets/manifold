import { uniq } from 'lodash'
import { SportInfo, SportsSubtopic } from 'common/sports-schedule'

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
