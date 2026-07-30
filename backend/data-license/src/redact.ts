// ---------------------------------------------------------------------------
// redact.ts — the correctness-critical core. Turns a raw DB row into a
// deliverable row: pseudonymizes every user id (columns AND nested json),
// strips denormalized identity, scrubs comment text, and drops/blanks comments
// by deleted accounts.
//
// The "did we miss a field" risk lives here; the validator's leak scan is the
// backstop, but the intent is that this function leaves ZERO raw user ids.
// ---------------------------------------------------------------------------

import {
  TableName,
  TABLES,
  TXN_USER_ENDPOINT_TYPE,
  TXN_DATA_USER_ID_ARRAYS,
  TXN_DATA_USER_ID_SCALARS,
  TXN_INNER_STRIP,
  ANSWER_USER_ID_FIELDS,
  ANSWER_STRIP_FIELDS,
} from './scope'
import { Pseudonymizer } from './pseudonymize'
import {
  HOUSE_LIQUIDITY_PROVIDER_ID,
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'

export interface RedactStats {
  rowsIn: number
  rowsOut: number
  emailsScrubbed: number
  phonesScrubbed: number
  mentionsGenericized: number
  commentsRemovedDeletedAccount: number
  commentsRedactedDeletedAccount: number
  // raw user ids found embedded in strings (URLs, free text) and pseudonymized
  // by the backstop sweep — see sweepRawUserIds.
  rawIdsSwept: number
}

export function newStats(): RedactStats {
  return {
    rowsIn: 0,
    rowsOut: 0,
    emailsScrubbed: 0,
    phonesScrubbed: 0,
    mentionsGenericized: 0,
    commentsRemovedDeletedAccount: 0,
    commentsRedactedDeletedAccount: 0,
    rawIdsSwept: 0,
  }
}

export interface RedactContext {
  ps: Pseudonymizer
  stats: RedactStats
  deletedUserIds: Set<string>
  deletedAccountMode: 'remove' | 'redact'
  // Every user id in existence — input to the raw-id sweep below (and the same
  // set the validator scans against, so redaction and validation agree).
  knownUserIds: Set<string>
  // The delivered contract ids. txn payloads can reference contracts OUTSIDE
  // the row-level scope filter (referredContractId, loan distributions) — those
  // references are scrubbed against this set so out-of-scope (unlisted/deleted)
  // market ids never ship.
  scopedContractIds: Set<string>
}

// A DB row. `data` is the parsed jsonb blob (may be absent for answers).
export type Row = Record<string, any> & { data?: any }

// --- text scrub ------------------------------------------------------------

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
// Conservative: 7+ digits with common separators. Phone scrubbing is
// false-positive-prone (can hit long numeric content); counts are logged so
// the dry run can be eyeballed.
const PHONE_RE = /\+?\d(?:[\d\s().-]{5,})\d/g
const HANDLE_RE = /@[A-Za-z0-9_]{2,}/g

function scrubPlainText(text: string, stats: RedactStats): string {
  let out = text.replace(EMAIL_RE, () => {
    stats.emailsScrubbed++
    return '[email removed]'
  })
  out = out.replace(PHONE_RE, (m) => {
    // avoid nuking short/formatted things that are clearly not phones
    const digits = m.replace(/\D/g, '')
    if (digits.length < 7) return m
    stats.phonesScrubbed++
    return '[phone removed]'
  })
  out = out.replace(HANDLE_RE, () => {
    stats.mentionsGenericized++
    return '@user'
  })
  return out
}

// Walk a tiptap/prosemirror JSONContent tree in place.
//  - mention nodes: pseudonymize attrs.id, genericize the visible label to @user
//    (mirrors parseMentions dfs in common/src/util/parse.ts:43)
//  - text nodes: optional email/phone/handle scrub
function walkRichText(
  node: any,
  ctx: RedactContext,
  opts: { scrubText: boolean }
): void {
  if (!node || typeof node !== 'object') return

  if (node.type === 'mention' && node.attrs) {
    if (node.attrs.id) {
      node.attrs.id = ctx.ps.map(String(node.attrs.id))
    }
    if ('label' in node.attrs) {
      node.attrs.label = 'user'
      ctx.stats.mentionsGenericized++
    }
  }

  if (opts.scrubText && typeof node.text === 'string') {
    node.text = scrubPlainText(node.text, ctx.stats)
  }

  if (Array.isArray(node.content)) {
    for (const child of node.content) walkRichText(child, ctx, opts)
  }
}

// --- field helpers ---------------------------------------------------------

function mapDataFields(data: any, fields: string[], ps: Pseudonymizer): void {
  if (!data) return
  for (const f of fields) {
    if (data[f] != null) data[f] = ps.map(String(data[f]))
  }
}

function stripDataFields(data: any, fields: string[]): void {
  if (!data) return
  for (const f of fields) delete data[f]
}

function mapColumns(row: Row, cols: string[], ps: Pseudonymizer): void {
  for (const c of cols) {
    if (row[c] != null) row[c] = ps.map(String(row[c]))
  }
}

// Apply the declarative catalog (columns + top-level data fields + strips).
function applyCatalog(table: TableName, row: Row, ps: Pseudonymizer): void {
  const spec = TABLES[table]
  for (const c of spec.stripColumns) delete row[c]
  mapColumns(row, spec.userIdColumns, ps)
  if (spec.hasDataBlob && row.data) {
    mapDataFields(row.data, spec.userIdDataFields, ps)
    stripDataFields(row.data, spec.stripDataFields)
  }
}

// The house account's uids (prod + dev) — used to normalize txn endpoints.
const HOUSE_IDS = new Set([
  HOUSE_LIQUIDITY_PROVIDER_ID,
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
])

// --- per-table transforms --------------------------------------------------
// Each returns the redacted row, or null if the row should be dropped.

export function redactContract(row: Row, ctx: RedactContext): Row {
  applyCatalog('contracts', row, ctx.ps)
  const data = row.data
  if (data) {
    // denormalized answers[] each carry their own user ids (contract.ts:204 /
    // answer.ts) — and legacy DPM-era answers embedded the answerer's full
    // display identity (username/name/avatarUrl), which we strip.
    if (Array.isArray(data.answers)) {
      for (const a of data.answers) {
        if (!a || typeof a !== 'object') continue
        for (const f of ANSWER_USER_ID_FIELDS) {
          if (a[f] != null) a[f] = ctx.ps.map(String(a[f]))
        }
        for (const f of ANSWER_STRIP_FIELDS) delete a[f]
      }
    }
    // description rich text may embed @mention ids (must be pseudonymized).
    // Text scrub is comment-only per spec, so mention-id replacement only here.
    if (data.description) walkRichText(data.description, ctx, { scrubText: false })
  }
  return row
}

export function redactAnswer(row: Row, ctx: RedactContext): Row {
  applyCatalog('answers', row, ctx.ps)
  return row
}

export function redactBet(row: Row, ctx: RedactContext): Row {
  applyCatalog('contract_bets', row, ctx.ps)
  return row
}

export function redactLiquidity(row: Row, ctx: RedactContext): Row {
  applyCatalog('contract_liquidity', row, ctx.ps)
  return row
}

export function redactComment(row: Row, ctx: RedactContext): Row | null {
  const authorId = row.user_id ?? row.data?.userId
  const authorDeleted = authorId && ctx.deletedUserIds.has(String(authorId))

  if (authorDeleted && ctx.deletedAccountMode === 'remove') {
    ctx.stats.commentsRemovedDeletedAccount++
    return null
  }

  applyCatalog('contract_comments', row, ctx.ps)

  if (authorDeleted && ctx.deletedAccountMode === 'redact') {
    ctx.stats.commentsRedactedDeletedAccount++
    if (row.data) {
      row.data.content = { type: 'doc', content: [] }
      delete row.data.text
    }
    return row
  }

  // scrub the comment body (rich text) + deprecated flat text field
  if (row.data?.content) walkRichText(row.data.content, ctx, { scrubText: true })
  if (typeof row.data?.text === 'string') {
    row.data.text = scrubPlainText(row.data.text, ctx.stats)
  }
  return row
}

export function redactTxn(row: Row, ctx: RedactContext): Row {
  // from_id / to_id are user ids ONLY when the matching *_type is USER.
  if (row.from_type === TXN_USER_ENDPOINT_TYPE && row.from_id != null) {
    row.from_id = ctx.ps.map(String(row.from_id))
  }
  if (row.to_type === TXN_USER_ENDPOINT_TYPE && row.to_id != null) {
    row.to_id = ctx.ps.map(String(row.to_id))
  }
  // BANK endpoints carry the house account's uid (@ManifoldMarkets — a real
  // row in users, so it would trip the leak scan). The endpoint type already
  // says everything the id does; normalize to the literal 'BANK' rather than
  // carving an exception into the scan. A few corrupt legacy rows also put the
  // house uid under a CONTRACT-typed endpoint (dev: 4 CONTRACT_RESOLUTION_PAYOUTs),
  // so any remaining raw house uid is normalized too. (USER-typed house
  // endpoints were already pseudonymized above, so this only hits raw values.)
  if (row.from_id != null && (row.from_type === 'BANK' || HOUSE_IDS.has(row.from_id))) {
    row.from_id = 'BANK'
  }
  if (row.to_id != null && (row.to_type === 'BANK' || HOUSE_IDS.has(row.to_id))) {
    row.to_id = 'BANK'
  }
  // Legacy txns duplicated the whole txn into the blob: raw fromId/toId plus a
  // description string with real display names. All dupes of delivered columns
  // — strip via the catalog (scope.ts txns.stripDataFields).
  applyCatalog('txns', row, ctx.ps)
  // nested user ids live under data.data (txn.ts:100-101, :145-149)
  const inner = row.data?.data
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    // Free text (managram messages) and external payment/merch metadata —
    // stripped, not scrubbed (see scope.ts TXN_INNER_STRIP for the why).
    for (const f of TXN_INNER_STRIP) delete inner[f]
    for (const f of TXN_DATA_USER_ID_SCALARS) {
      if (inner[f] != null) inner[f] = ctx.ps.map(String(inner[f]))
    }
    for (const f of TXN_DATA_USER_ID_ARRAYS) {
      if (Array.isArray(inner[f])) {
        inner[f] = inner[f].map((id: any) => ctx.ps.map(String(id)))
      }
    }
    // Payload contract references can point outside the delivered scope (the
    // row-level filter only gates the 3 primary reference legs). Out-of-scope
    // ids must not ship — an unlisted market is reachable by id.
    if (
      inner.referredContractId != null &&
      !ctx.scopedContractIds.has(String(inner.referredContractId))
    ) {
      delete inner.referredContractId
    }
    // loan distributions: [{amount, answerId, contractId}, …] — null the ids of
    // out-of-scope entries but keep the amounts, so they still sum to the txn.
    if (Array.isArray(inner.distributions)) {
      for (const d of inner.distributions) {
        if (
          d && typeof d === 'object' &&
          d.contractId != null &&
          !ctx.scopedContractIds.has(String(d.contractId))
        ) {
          d.contractId = null
          d.answerId = null
        }
      }
    }
  }
  return row
}

export function redactBotAccount(row: Row, ctx: RedactContext): Row {
  applyCatalog('bot_accounts', row, ctx.ps)
  return row
}

// --- raw-id sweep (backstop) -----------------------------------------------
// Field-level rules only reach ids that sit in a KNOWN place. Prod also carries
// ids embedded in free text — most commonly a manifold.markets URL pasted into
// a market description or comment (`/leagues/24/silicon/.../<uid>`), which
// appears both as link text and in the mark's href. Those are real user ids in
// delivered content, so the leak scan fails the run (it did, on the first 2000
// contracts of prod).
//
// This pass tokenizes every string in the delivered row the same way the
// validator does and rewrites any token that IS a real user id into that user's
// pseudonym — same mapping as everywhere else, so links stay internally
// consistent and joinable. Object KEYS are swept too (legacy blobs keyed by
// uid). Field-level redaction stays the source of truth; this only closes the
// class of leak that no field list can enumerate.
const ID_TOKEN_RE = /[A-Za-z0-9_-]{20,40}/g
const MIN_ID_LEN = 20

function sweepString(s: string, ctx: RedactContext): string {
  if (s.length < MIN_ID_LEN) return s
  ID_TOKEN_RE.lastIndex = 0
  return s.replace(ID_TOKEN_RE, (tok) => {
    if (!ctx.knownUserIds.has(tok)) return tok
    ctx.stats.rawIdsSwept++
    return ctx.ps.map(tok)
  })
}

function sweepRawUserIds(node: any, ctx: RedactContext): any {
  if (typeof node === 'string') return sweepString(node, ctx)
  if (!node || typeof node !== 'object') return node
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) node[i] = sweepRawUserIds(node[i], ctx)
    return node
  }
  for (const [k, v] of Object.entries(node)) {
    const swept = sweepRawUserIds(v, ctx)
    const newKey = sweepString(k, ctx)
    if (newKey !== k) {
      delete node[k]
      node[newKey] = swept
    } else {
      node[k] = swept
    }
  }
  return node
}

type Redactor = (row: Row, ctx: RedactContext) => Row | null

// Every table's output goes through the sweep — an id hidden in a string is not
// a contracts-only problem (comments are free text by definition).
function withSweep(fn: Redactor): Redactor {
  return (row, ctx) => {
    const out = fn(row, ctx)
    return out && ctx.knownUserIds.size ? sweepRawUserIds(out, ctx) : out
  }
}

export const REDACTORS: Record<TableName, Redactor> = {
  contracts: withSweep(redactContract),
  answers: withSweep(redactAnswer),
  contract_comments: withSweep(redactComment),
  contract_bets: withSweep(redactBet),
  contract_liquidity: withSweep(redactLiquidity),
  txns: withSweep(redactTxn),
  bot_accounts: withSweep(redactBotAccount),
}
