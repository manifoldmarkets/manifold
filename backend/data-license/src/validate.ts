// ---------------------------------------------------------------------------
// validate.ts — the pre-upload gate, run per chunk on the redacted rows that
// are about to be written (so every byte written is scanned, with no file
// re-read). NOTHING uploads unless the chunk passes.
//
// Checks:
//   1. Referential integrity: every child contract_id exists in delivered contracts.
//   2. Zero raw user ids: no token matching a REAL user id (from the full users
//      set) appears anywhere in the row — catches a missed field, not just ids
//      we deliberately mapped. (Self-tested at startup with a planted id, so a
//      regex/logic regression here fails the run instead of silently passing.)
//   3. Forbidden strings: the client name (runtime denylist) appears nowhere
//      (case-insensitive).
//   4. Unknown-key gate: every `data` key must be in the vetted allowlist
//      (scope.ts). An unvetted legacy key aborts instead of leaking silently.
//
// The probability-path reconstruction spot check lives in reconstruct.ts and
// gates the run in index.ts after all tables stream.
// ---------------------------------------------------------------------------

import {
  TABLES,
  TableName,
  TXN_OUTER_ALLOWED,
  TXN_INNER_ALLOWED,
  TXN_DATA_USER_ID_SCALARS,
  TXN_DATA_USER_ID_ARRAYS,
  ANSWER_ALLOWED_FIELDS,
  ANSWER_USER_ID_FIELDS,
} from './scope'
import { Row } from './redact'

// User ids are 28-char Firebase UIDs. The window is deliberately wider so
// shorter/longer id schemes are still tokenized; the startup self-test
// (index.ts) plants a real id and asserts this scan catches it.
const ID_TOKEN_RE = /[A-Za-z0-9_-]{20,40}/g

export interface ScanCounts {
  rowCount: number
  riViolations: number
  rawIdLeaks: number
  forbiddenHits: number
  unknownKeys: number
  unknownKeyNames: string[]
}

export interface ScanArgs {
  deliveredContractIds: Set<string>
  allUserIds: Set<string>
  forbiddenStrings: string[] // pre-lowercased in config.ts
}

export function emptyCounts(): ScanCounts {
  return {
    rowCount: 0,
    riViolations: 0,
    rawIdLeaks: 0,
    forbiddenHits: 0,
    unknownKeys: 0,
    unknownKeyNames: [],
  }
}

export function addCounts(a: ScanCounts, b: ScanCounts): void {
  a.rowCount += b.rowCount
  a.riViolations += b.riViolations
  a.rawIdLeaks += b.rawIdLeaks
  a.forbiddenHits += b.forbiddenHits
  a.unknownKeys += b.unknownKeys
  for (const n of b.unknownKeyNames) {
    if (!a.unknownKeyNames.includes(n)) a.unknownKeyNames.push(n)
  }
}

export function chunkFailed(c: ScanCounts): boolean {
  return (
    c.riViolations > 0 ||
    c.rawIdLeaks > 0 ||
    c.forbiddenHits > 0 ||
    c.unknownKeys > 0
  )
}

// Union of the vetted key sets per table (allowed + pseudonymized-in-place;
// stripped keys are gone by the time we scan).
const ALLOWED_KEYS: Partial<Record<TableName, Set<string>>> = {}
for (const spec of Object.values(TABLES)) {
  if (spec.allowedDataFields) {
    ALLOWED_KEYS[spec.name] = new Set([
      ...spec.allowedDataFields,
      ...spec.userIdDataFields,
    ])
  }
}
const TXN_OUTER_SET = new Set(TXN_OUTER_ALLOWED)
const TXN_INNER_SET = new Set([
  ...TXN_INNER_ALLOWED,
  ...TXN_DATA_USER_ID_SCALARS,
  ...TXN_DATA_USER_ID_ARRAYS,
])
const ANSWER_SET = new Set([...ANSWER_ALLOWED_FIELDS, ...ANSWER_USER_ID_FIELDS])

function checkKeys(
  obj: any,
  allowed: Set<string>,
  label: string,
  counts: ScanCounts
): void {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return
  for (const k of Object.keys(obj)) {
    if (!allowed.has(k)) {
      counts.unknownKeys++
      const name = `${label}.${k}`
      if (!counts.unknownKeyNames.includes(name)) counts.unknownKeyNames.push(name)
    }
  }
}

/** Scan a redacted, about-to-be-written batch. `data` is still a JS object here
 *  (pg returns int8 as string, so JSON.stringify is safe — no BigInt). */
export function scanBatch(table: TableName, rows: Row[], args: ScanArgs): ScanCounts {
  const spec = TABLES[table]
  // txns association is indirect; contracts has no parent — RI only for children.
  const cidCol =
    table !== 'contracts' && table !== 'txns' ? spec.contractIdColumn : null
  const allowed = ALLOWED_KEYS[table]

  const counts = emptyCounts()
  counts.rowCount = rows.length

  for (const row of rows) {
    if (cidCol) {
      const cid = row[cidCol]
      if (cid != null && !args.deliveredContractIds.has(String(cid))) counts.riViolations++
    }
    // unknown-key gate (check 4)
    if (allowed) {
      checkKeys(row.data, allowed, `${table}.data`, counts)
      if (table === 'contracts' && Array.isArray(row.data?.answers)) {
        for (const a of row.data.answers) {
          checkKeys(a, ANSWER_SET, `${table}.data.answers[]`, counts)
        }
      }
    } else if (table === 'txns') {
      checkKeys(row.data, TXN_OUTER_SET, 'txns.data', counts)
      checkKeys(row.data?.data, TXN_INNER_SET, 'txns.data.data', counts)
    }
    const blob = JSON.stringify(row)
    if (args.forbiddenStrings.length) {
      const lower = blob.toLowerCase()
      for (const needle of args.forbiddenStrings) {
        if (needle && lower.includes(needle)) counts.forbiddenHits++
      }
    }
    const tokens = blob.match(ID_TOKEN_RE)
    if (tokens) {
      for (const tok of tokens) if (args.allUserIds.has(tok)) counts.rawIdLeaks++
    }
  }
  return counts
}
