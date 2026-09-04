import { SupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'

// Shared guard for the oracle backfill scripts. Published history is
// append-only and a backfill stamps day boundaries, so on a feed that already
// backs an unresolved market it would add a second point to every day rather
// than fill a hole — and those markets have already priced funding and
// liquidations against the history as it stands. Every backfill header says
// "NOT for a live feed"; this makes the script check rather than trust the
// operator to have read it. `--force` is the deliberate override for a
// rerun someone has actually decided on.
export const assertBackfillTarget = async (
  pg: SupabaseDirectClient,
  feedId: string,
  argv: readonly string[] = process.argv
) => {
  const rows = await pg.manyOrNone<{ slug: string }>(
    `select data->>'slug' as slug from contracts
     where mechanism = 'perp'
       and resolution_time is null
       and data->>'oracleFeedId' = $1`,
    [feedId]
  )
  if (rows.length === 0) return
  const slugs = rows.map((row) => row.slug).join(', ')
  if (argv.includes('--force')) {
    log.warn(
      `--force: backfilling ${feedId} although it backs live market(s) ${slugs}; ` +
        `day-boundary points will be appended next to the live job's stamps`
    )
    return
  }
  throw new Error(
    `refusing to backfill ${feedId}: it backs live market(s) ${slugs}. ` +
      `Published history is append-only and those markets have priced against ` +
      `it; pass --force only for a rerun that has been deliberately decided.`
  )
}
