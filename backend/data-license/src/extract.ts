// ---------------------------------------------------------------------------
// extract.ts — snapshot-scoped extraction.
//
// The in-scope contract ids are materialized once into a TEMP table
// (_scope_contracts), so every child query is an index join against it instead
// of a 185k-element ANY($ids) array. All queries run inside the caller's single
// REPEATABLE READ snapshot, so the six tables are mutually consistent.
//
// The per-table SELECTs are returned as SQL for the caller to run through a
// server-side cursor (pg-query-stream) — nothing here buffers a table.
// ---------------------------------------------------------------------------

import { Snapshot } from './db'
import { CONTRACT_FILTER_SQL, TableName } from './scope'

export const SCOPE_TABLE = '_scope_contracts'

/** Materialize the in-scope contract ids into an indexed temp table. */
export async function setupScopeTable(t: Snapshot, limit?: number): Promise<number> {
  await t.none(
    `CREATE TEMP TABLE ${SCOPE_TABLE} (id text PRIMARY KEY) ON COMMIT DROP`
  )
  await t.none(
    `INSERT INTO ${SCOPE_TABLE} (id)
       SELECT id FROM contracts WHERE ${CONTRACT_FILTER_SQL}` +
      (limit ? ` ORDER BY id LIMIT $1` : ``),
    limit ? [limit] : []
  )
  await t.none(`ANALYZE ${SCOPE_TABLE}`)
  const { count } = await t.one<{ count: string }>(
    `SELECT count(*)::text AS count FROM ${SCOPE_TABLE}`
  )
  return Number(count)
}

export async function loadDeletedUserIds(t: Snapshot): Promise<Set<string>> {
  // users is excluded from OUTPUT but is a legitimate filter input.
  // deleted flag lives in the data blob (common/src/user.ts:123).
  const rows = await t.any<{ id: string }>(
    `SELECT id FROM users WHERE (data->>'userDeleted')::boolean = true`
  )
  return new Set(rows.map((r) => r.id))
}

/**
 * Every user id in existence — the leak scan checks output tokens against this
 * so a MISSED field (a user id we forgot to pseudonymize) is caught, not just
 * ids we deliberately mapped. Memory: one Set of ~all user id strings.
 */
export async function loadAllUserIds(t: Snapshot): Promise<Set<string>> {
  const rows = await t.any<{ id: string }>(`SELECT id FROM users`)
  return new Set(rows.map((r) => r.id))
}

export async function loadDeliveredContractIds(t: Snapshot): Promise<Set<string>> {
  const rows = await t.any<{ id: string }>(`SELECT id FROM ${SCOPE_TABLE}`)
  return new Set(rows.map((r) => r.id))
}

/**
 * Pick the busiest resolved binary (cpmm-1) markets in scope, for the
 * probability-path reconstruction spot check. Returns [] if none qualify
 * (e.g. a tiny subset with no resolved binaries).
 *
 * Several, not one: prod has markets with genuine holes in their source bet
 * series, and a one-market gate would abort the whole delivery on one of them
 * (see reconstruct.ts).
 */
export async function pickProbeContracts(
  t: Snapshot,
  n: number
): Promise<{ id: string; resolution: string }[]> {
  return t.any<{ id: string; resolution: string }>(
    `SELECT c.id, c.data->>'resolution' AS resolution
       FROM contracts c JOIN ${SCOPE_TABLE} s ON c.id = s.id
      WHERE c.data->>'outcomeType' = 'BINARY'
        AND c.data->>'mechanism' = 'cpmm-1'
        AND c.data->>'resolution' IN ('YES','NO')
      ORDER BY COALESCE((c.data->>'uniqueBettorCount')::int, 0) DESC
      LIMIT $1`,
    [n]
  )
}

/** The cursor SELECT for one table, filtered transitively via the scope table. */
export function streamSql(table: TableName): string {
  if (table === 'contracts') {
    return `SELECT c.* FROM contracts c JOIN ${SCOPE_TABLE} s ON c.id = s.id`
  }
  if (table === 'txns') {
    // The FULL ledger ("full financial transaction ledger" per the tear sheet),
    // MINUS rows referencing an out-of-scope contract — a contract is
    // referenced 3 ways (scope.ts / the txns findings), and each reference must
    // be in scope or absent, so unlisted/deleted markets stay invisible.
    // Platform-wide rows (transfers, bonuses, purchases, loans, prizes — no
    // contract reference at all) pass all three legs and now ship. The
    // data->contractId leg is unindexed => a scan of txns, which is
    // unavoidable. NB: under SUBSET_LIMIT the non-contract rows still ship in
    // full — subset dry runs shrink markets, not the platform ledger.
    return `SELECT t.* FROM txns t
              WHERE (t.from_type != 'CONTRACT'
                     OR EXISTS (SELECT 1 FROM ${SCOPE_TABLE} s WHERE s.id = t.from_id))
                AND (t.to_type != 'CONTRACT'
                     OR EXISTS (SELECT 1 FROM ${SCOPE_TABLE} s WHERE s.id = t.to_id))
                AND ((t.data->'data'->>'contractId') IS NULL
                     OR EXISTS (SELECT 1 FROM ${SCOPE_TABLE} s WHERE s.id = t.data->'data'->>'contractId'))`
  }
  if (table === 'bot_accounts') {
    // users is excluded from output; this ships ONLY the ids of bot-flagged
    // accounts, which redact.ts pseudonymizes like every other user id.
    // ORDER BY for a deterministic single part.
    //
    // The flag is a native COLUMN (`users.is_bot`), NOT a `data` key — the
    // User type calls it `isBot` (common/src/user.ts:126) and the mapping
    // happens in SQL (`is_bot as "isBot"`, common/src/supabase/users.ts:63;
    // written as a column in backend/shared/src/supabase/users.ts:105).
    // Reading `data->>'isBot'` matches ZERO rows in prod and silently ships an
    // empty table — verified against the clone, 2026-07-29.
    // The hardcoded BOT_USERNAMES fallback (common/src/api/user-types.ts:39)
    // needs no union: all 116 of those accounts already have is_bot = true.
    return `SELECT id AS user_id FROM users WHERE is_bot = true ORDER BY id`
  }
  // answers / contract_comments / contract_bets / contract_liquidity
  return `SELECT c.* FROM ${table} c JOIN ${SCOPE_TABLE} s ON c.contract_id = s.id`
}
