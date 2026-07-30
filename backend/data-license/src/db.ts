// ---------------------------------------------------------------------------
// db.ts — a dedicated pg-promise connection for the export.
//
// IMPORTANT: we do NOT reuse backend/shared's createSupabaseDirectClient(). Its
// pool sets idle_in_transaction_session_timeout=60s and query_timeout=1h
// (shared/src/supabase/init.ts) which would kill a long export transaction or a
// multi-GB scan. Here those timeouts are disabled and every read happens inside
// ONE REPEATABLE READ snapshot, so the six tables are mutually consistent.
//
// Why REPEATABLE READ and not READ ONLY DEFERRABLE (which avoids serialization
// anomalies): the export materializes the in-scope contract ids into a TEMP
// table, and Postgres forbids CREATE (even CREATE TEMP) in a READ ONLY
// transaction. REPEATABLE READ still fixes one MVCC snapshot at the first query;
// we only ever write to the temp table, so there is nothing to serialize against.
// ---------------------------------------------------------------------------

import pgPromise, { IDatabase, ITask } from 'pg-promise'

const pgp = pgPromise()

export type Db = IDatabase<unknown>
export type Snapshot = ITask<unknown>

export function connect(): Db {
  // Treat empty strings as unset (a sourced .env exports "" for blank keys).
  const env = (name: string) => {
    const v = process.env[name]
    return v && v.length ? v : undefined
  }
  // Explicit host (PITR clone / local) wins; otherwise derive it from the
  // instance id exactly like shared/supabase/init.ts (db.${id}.supabase.co).
  const instanceId = env('SUPABASE_INSTANCE_ID')
  const host = env('SUPABASE_HOST') ?? (instanceId ? `db.${instanceId}.supabase.co` : undefined)
  const password = env('SUPABASE_PASSWORD')
  if (!host || !password) {
    throw new Error(
      'set SUPABASE_HOST (or SUPABASE_INSTANCE_ID) and SUPABASE_PASSWORD for the export source'
    )
  }
  const port = Number(env('SUPABASE_PORT') ?? '5432')
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`SUPABASE_PORT must be a positive integer, got: ${process.env.SUPABASE_PORT}`)
  }
  return pgp({
    host,
    port,
    database: 'postgres',
    user: 'postgres',
    password,
    // Encryption-only TLS: Supabase's cert chain isn't in the default trust
    // store, so peer verification is off. Accepted risk — the host is a fixed
    // db.<ref>.supabase.co we configure ourselves, and only reads flow here.
    ssl: host === '127.0.0.1' ? undefined : { rejectUnauthorized: false },
    // everything runs inside one transaction on one connection.
    max: 1,
    keepAlive: true,
    // export-safe: never let the server kill our long snapshot / big scans.
    statement_timeout: 0 as any,
    query_timeout: 0 as any,
    idle_in_transaction_session_timeout: 0 as any,
  })
}

/**
 * Run `fn` inside a single read-only REPEATABLE READ transaction so that all
 * six tables are read from one consistent MVCC snapshot. Returns the snapshot's
 * capture time for the manifest.
 */
export async function withSnapshot<T>(
  db: Db,
  fn: (t: Snapshot, snapshotTime: string) => Promise<T>
): Promise<T> {
  const mode = new pgp.txMode.TransactionMode({
    tiLevel: pgp.txMode.isolationLevel.repeatableRead,
  })
  return db.tx({ mode }, async (t) => {
    await t.none('SET LOCAL idle_in_transaction_session_timeout = 0')
    await t.none('SET LOCAL statement_timeout = 0')
    // now() returns the transaction start time — stable for the whole snapshot.
    const { now } = await t.one<{ now: string }>('SELECT now()::text as now')
    return fn(t, now)
  })
}

export function shutdown(): void {
  pgp.end()
}
