// One-off: apply backend/supabase/migrations/2026080601_drop_user_bans_ended_by_fkey.sql
// to prod. The unban-users scheduler job has crashed hourly since 2026-01-17
// because user_bans_ended_by_fkey rejects its ended_by = 'system' sentinel.
// Idempotent; safe to re-run.
import { runScript } from 'run-script'
import { getLocalEnv } from 'shared/init-admin'

runScript(async ({ pg }) => {
  const env = getLocalEnv()
  console.log(`resolved env: ${env}`)
  if (env !== 'PROD') {
    throw new Error(
      `expected PROD but getLocalEnv() resolved ${env} — check activeProjects casing in firebase-tools.json`
    )
  }

  await pg.tx(async (tx) => {
    await tx.none(
      `alter table user_bans drop constraint if exists user_bans_ended_by_fkey`
    )
    const result = await tx.result(
      `update user_bans
       set ended_by = 'system', ended_at = now()
       where ended_at is null
         and end_time is not null
         and end_time <= now()`
    )
    console.log(`closed ${result.rowCount} expired temp bans`)
  })

  const fk = await pg.oneOrNone(
    `select 1 from pg_constraint where conname = 'user_bans_ended_by_fkey'`
  )
  const stuck = await pg.one<{ n: number }>(
    `select count(*)::int as n from user_bans
     where ended_at is null and end_time is not null and end_time <= now()`
  )
  console.log(
    `verify: constraint still present = ${!!fk}, remaining stuck rows = ${
      stuck.n
    }`
  )
})
