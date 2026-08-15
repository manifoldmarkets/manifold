import { createSupabaseDirectClient } from 'shared/supabase/init'

export async function resetPgStats() {
  const pg = createSupabaseDirectClient()
  // .any, not .none: pg_stat_statements_reset() returns a row, and
  // pg-promise's none() rejects on any returned row — this crashed the
  // daily run (and fired the job-crash alert) every day.
  await pg.any(`select pg_stat_statements_reset()`)
}
