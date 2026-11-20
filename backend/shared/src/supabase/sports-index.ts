import { SupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import {
  buildSportsIndex,
  SPORTS_DEFAULT_GROUP_ID,
  SportsIndex,
  SportsTopic,
  SportsTopicLink,
} from 'common/sports-schedule'

// ─── Sports from the topic tree ───────────────────────────────────────────────

// Mods rearrange topics rarely, and every schedule request needs the tree.
const SPORTS_INDEX_TTL_MS = 5 * 60 * 1000
const MAX_TOPIC_DEPTH = 6
let sportsIndexCache: { at: number; index: SportsIndex } | undefined

/**
 * The sports index for a page: cached for a few minutes, and if the topic
 * tree can't be read, the last one, or else the curated sports alone. Pass
 * `curatedFallback: false` to get an error instead of that partial list.
 */
export async function getSportsIndex(
  pg: SupabaseDirectClient,
  now = Date.now(),
  opts: { curatedFallback?: boolean } = {}
): Promise<SportsIndex> {
  if (sportsIndexCache && now - sportsIndexCache.at < SPORTS_INDEX_TTL_MS)
    return sportsIndexCache.index
  try {
    const index = await loadSportsIndex(pg)
    sportsIndexCache = { at: now, index }
    return index
  } catch (e) {
    // The curated sports alone still make a working page.
    log.error('[sports-index] could not load the sports topics', {
      error: e instanceof Error ? e.message : String(e),
    })
    if (sportsIndexCache) return sportsIndexCache.index
    if (opts.curatedFallback === false) throw e
    return buildSportsIndex([], [])
  }
}

/** The sports index from the topic tree as it is now. Throws if it can't be read. */
export async function loadSportsIndex(
  pg: SupabaseDirectClient
): Promise<SportsIndex> {
  const rows = await pg.manyOrNone<{
    parent_id: string
    child_id: string
    slug: string
    name: string
    total_members: number | null
  }>(
    `with recursive tree(parent_id, child_id, depth) as (
       select gg.top_id, gg.bottom_id, 1
       from group_groups gg
       join groups g on g.id = gg.bottom_id and g.privacy_status = 'public'
       where gg.top_id = $1
       union
       select gg.top_id, gg.bottom_id, t.depth + 1
       from tree t
       join group_groups gg on gg.top_id = t.child_id
       join groups g on g.id = gg.bottom_id and g.privacy_status = 'public'
       where t.depth < ${MAX_TOPIC_DEPTH}
     )
     select distinct t.parent_id, t.child_id, g.slug, g.name, g.total_members
     from tree t join groups g on g.id = t.child_id`,
    [SPORTS_DEFAULT_GROUP_ID]
  )
  const topics = new Map<string, SportsTopic>()
  const links: SportsTopicLink[] = []
  for (const r of rows) {
    links.push({ parentId: r.parent_id, childId: r.child_id })
    topics.set(r.child_id, {
      id: r.child_id,
      slug: r.slug,
      name: r.name,
      totalMembers: Number(r.total_members ?? 0),
    })
  }
  return buildSportsIndex([...topics.values()], links)
}
