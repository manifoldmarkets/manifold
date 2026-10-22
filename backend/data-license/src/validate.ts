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
//   5. Zero real usernames (identity.ts): none in a storage path, a
//      manifold.markets link's user segment or its query string (incl. the
//      base64 ?r= referral), no creatorName/Username/AvatarUrl preview param on
//      any URL, and — when the bare-username rewrite is on — no rare
//      handle-like username left as a word in prose. Checked against current
//      AND historical usernames, on the fully decoded row. Self-tested at
//      startup with one planted value of each shape.
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
import {
  NameIndex,
  countBareNames,
  countNameHandlePairs,
  countUserHandles,
  emptyLeaks,
  findIdentityLeaks,
  mapProse,
  textNodes,
} from './identity'
import { Pseudonymizer } from './pseudonymize'

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
  namePathLeaks: number
  nameQueryLeaks: number
  previewParamLeaks: number
  // rare handles left in prose: gated when the rewrite is on, else reported
  bareNameHits: number
  bareNameWarnings: number
  // a display name next to its own owner's (@handle)
  namePairLeaks: number
  // an @handle of a Manifold user left in a comment, or in a description
  // when descriptions are scrubbed
  atHandleLeaks: number
}

export interface ScanArgs {
  deliveredContractIds: Set<string>
  allUserIds: Set<string>
  forbiddenStrings: string[] // pre-lowercased in config.ts
  // username scan (check 5); absent = skipped
  names?: NameIndex
  ps?: Pseudonymizer
  failOnBareNames?: boolean
  // descriptions get the @handle rule (SCRUB_DESCRIPTIONS)
  scrubDescriptions?: boolean
}

export function emptyCounts(): ScanCounts {
  return {
    rowCount: 0,
    riViolations: 0,
    rawIdLeaks: 0,
    forbiddenHits: 0,
    unknownKeys: 0,
    unknownKeyNames: [],
    namePathLeaks: 0,
    nameQueryLeaks: 0,
    previewParamLeaks: 0,
    bareNameHits: 0,
    bareNameWarnings: 0,
    namePairLeaks: 0,
    atHandleLeaks: 0,
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
  a.namePathLeaks += b.namePathLeaks
  a.nameQueryLeaks += b.nameQueryLeaks
  a.previewParamLeaks += b.previewParamLeaks
  a.bareNameHits += b.bareNameHits
  a.bareNameWarnings += b.bareNameWarnings
  a.namePairLeaks += b.namePairLeaks
  a.atHandleLeaks += b.atHandleLeaks
}

export function chunkFailed(c: ScanCounts): boolean {
  return (
    c.riViolations > 0 ||
    c.rawIdLeaks > 0 ||
    c.forbiddenHits > 0 ||
    c.unknownKeys > 0 ||
    c.namePathLeaks > 0 ||
    c.nameQueryLeaks > 0 ||
    c.previewParamLeaks > 0 ||
    c.bareNameHits > 0 ||
    c.namePairLeaks > 0 ||
    c.atHandleLeaks > 0
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
      if (!counts.unknownKeyNames.includes(name))
        counts.unknownKeyNames.push(name)
    }
  }
}

function forEachString(node: unknown, fn: (s: string) => void): void {
  if (typeof node === 'string') fn(node)
  else if (Array.isArray(node)) for (const v of node) forEachString(v, fn)
  else if (node && typeof node === 'object' && !(node instanceof Date)) {
    for (const v of Object.values(node)) forEachString(v, fn)
  }
}

/**
 * Plant a real username in every shape the name scan must catch (and a rare
 * handle in prose, if any handle is rare) and return the shapes it missed. A
 * scan that can't fail is worse than none: index.ts aborts on any miss.
 */
export function nameScanSelfTest(args: ScanArgs): string[] {
  const names = args.names
  if (!names) return []
  const keys = [...names.usernames.keys()].filter((k) => names.usernames.get(k))
  // a handle-like username can't collide with a route; any plain one will do
  const u =
    keys.find((k) => names.handles.has(k)) ??
    keys.find((k) => /^[a-z0-9_]+$/.test(k))
  if (!u) return ['(no username to plant)']
  const ref = Buffer.from(u).toString('base64').replace(/=/g, '')
  type Shape = [string, string, keyof ScanCounts, Row?, TableName?]
  const shapes: Shape[] = [
    [
      'storage path',
      `https://firebasestorage.googleapis.com/v0/b/x/o/contract-images%2F${u}%2Fa.jpg?alt=media`,
      'namePathLeaks',
    ],
    ['market link', `see manifold.markets/${u}/some-market.`, 'namePathLeaks'],
    // a contract mention's label, a relative href
    ['relative path', `/${u}/some-market`, 'namePathLeaks'],
    [
      'referral param',
      `https://manifold.markets/news?r=${ref}`,
      'nameQueryLeaks',
    ],
    [
      'preview param',
      'https://manifold.markets/api/og/market?question=q&creatorName=PlantedName',
      'previewParamLeaks',
    ],
  ]
  const rare = [...names.handles.keys()].find((k) => names.isRare(k))
  if (rare) shapes.push(['bare handle', `ask ${rare} about it`, 'bareNameHits'])
  const owner = names.usernames.get(u)
  const display = [...names.displayNames].find(
    ([, owners]) => owner && owners.has(owner)
  )?.[0]
  if (display) {
    shapes.push(['name and handle', `${display} (@${u})`, 'namePairLeaks'])
  }
  shapes.push([
    'comment @handle',
    '',
    'atHandleLeaks',
    { comment_id: 'selftest', data: { text: `thanks @${u}` } },
    'contract_comments',
  ])
  if (args.scrubDescriptions) {
    shapes.push([
      'description @handle',
      '',
      'atHandleLeaks',
      { id: 'selftest', data: { description: `ask @${u}` } },
    ])
  }
  const forced = { ...args, failOnBareNames: true }
  return shapes
    .filter(([, text, field, row, table]) => {
      const planted = row ?? { id: 'selftest', data: { question: text } }
      return !scanBatch(table ?? 'contracts', [planted], forced)[field]
    })
    .map(([shape]) => shape)
}

/** Scan a redacted, about-to-be-written batch. `data` is still a JS object here
 *  (pg returns int8 as string, so JSON.stringify is safe — no BigInt). */
export function scanBatch(
  table: TableName,
  rows: Row[],
  args: ScanArgs
): ScanCounts {
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
      if (cid != null && !args.deliveredContractIds.has(String(cid)))
        counts.riViolations++
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
      for (const tok of tokens)
        if (args.allUserIds.has(tok)) counts.rawIdLeaks++
    }
    // check 5, string by string: a site-relative path is only a path when it
    // is the whole value.
    if (args.names && args.ps) {
      const { names, ps } = args
      const leaks = emptyLeaks()
      forEachString(row, (s) => findIdentityLeaks(s, names, ps, leaks))
      counts.namePathLeaks += leaks.namePathLeaks
      counts.nameQueryLeaks += leaks.nameQueryLeaks
      counts.previewParamLeaks += leaks.previewParamLeaks
      const bare = countBareNames(table, row, args.names, args.ps)
      if (args.failOnBareNames) counts.bareNameHits += bare
      else counts.bareNameWarnings += bare
      mapProse(table, row, (s) => {
        counts.namePairLeaks += countNameHandlePairs(s, names)
        return s
      })
      const handleTexts =
        table === 'contract_comments'
          ? textNodes(row.data?.content, textNodes(row.data?.text))
          : table === 'contracts' && args.scrubDescriptions
          ? textNodes(row.data?.description)
          : []
      for (const s of handleTexts)
        counts.atHandleLeaks += countUserHandles(s, names)
    }
  }
  return counts
}
