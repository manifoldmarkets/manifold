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
  CANCEL_STAMP_BROKEN_FROM,
  CANCEL_STAMP_FIXED_AT,
  CANCEL_STAMP_SAME_MS,
  FILL_AFTER_CANCEL_SLACK_MS,
} from './scope'
import { Pseudonymizer } from './pseudonymize'
import {
  IdentityCounts,
  IdentityContext,
  PROSE_ATTRS,
  NameIndex,
  mapProse,
  mapWords,
  newIdentityCounts,
  rewriteBareNames,
  rewriteIdentityInString,
  rewriteNameHandlePairs,
  rewriteUserHandles,
} from './identity'
import { scrubPhones } from './phone'
import {
  HOUSE_LIQUIDITY_PROVIDER_ID,
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'

export interface RedactStats extends IdentityCounts {
  rowsIn: number
  rowsOut: number
  emailsScrubbed: number
  phonesScrubbed: number
  mentionsGenericized: number
  commentsRemovedDeletedAccount: number
  commentsRedactedDeletedAccount: number
  // moderator-deleted or hidden comments blanked (BLANK_MODERATED_COMMENTS)
  commentsBlankedModerated: number
  // raw user ids found embedded in strings (URLs, free text) and pseudonymized
  // by the backstop sweep — see sweepRawUserIds.
  rawIdsSwept: number
  // cancelled limit orders, and those whose updated_time is not their cancel
  // time (contract_bets.cancel_time_reliable = false), by reason. The window
  // count includes orders placed before the window opened (preWindow): they
  // may have been cancelled within a second of placement or during it.
  cancelledOrders: number
  cancelTimeUnreliable: number
  cancelTimeUnreliableWindow: number
  cancelTimeUnreliablePreWindow: number
  cancelTimeUnreliableFillAfter: number
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
    commentsBlankedModerated: 0,
    rawIdsSwept: 0,
    cancelledOrders: 0,
    cancelTimeUnreliable: 0,
    cancelTimeUnreliableWindow: 0,
    cancelTimeUnreliablePreWindow: 0,
    cancelTimeUnreliableFillAfter: 0,
    ...newIdentityCounts(),
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
  // Current and historical usernames + handle-like display names, with prose
  // rarity (identity.ts). Absent = no username rewriting (unit tests of other
  // rules only; index.ts always sets it).
  names?: NameIndex
  // BARE_USERNAME_REWRITE: replace rare handle-like words that match a user
  bareUsernames: boolean
  // BLANK_MODERATED_COMMENTS: blank deleted/hidden comments' text (default on)
  blankModeratedComments: boolean
  // SCRUB_DESCRIPTIONS: email/phone scrub on market descriptions, and @handles
  // of Manifold users rewritten (default on)
  scrubDescriptions: boolean
}

// A DB row. `data` is the parsed jsonb blob (may be absent for answers).
export type Row = Record<string, any> & { data?: any }

// --- text scrub ------------------------------------------------------------

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
// a dashed handle (nanoid suffix) is consumed whole, so no '@user-x' remains
const HANDLE_RE = /@[A-Za-z0-9_][A-Za-z0-9_-]*[A-Za-z0-9_]/g

// `handles` replaces the default @handle rule (every @handle becomes @user):
// descriptions pass rewriteUserHandles, which touches only Manifold users.
export function scrubPlainText(
  text: string,
  stats: RedactStats,
  handles?: (s: string) => string
): string {
  let out = text.replace(EMAIL_RE, () => {
    stats.emailsScrubbed++
    return '[email removed]'
  })
  // phone-shaped and validated only; dates and numbers stay (phone.ts)
  out = scrubPhones(out, '[phone removed]', () => stats.phonesScrubbed++)
  if (handles) return handles(out)
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
  opts: { scrubText: boolean; handles?: (s: string) => string }
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
    node.text = scrubPlainText(node.text, ctx.stats, opts.handles)
  }
  // a link preview's fetched title/description, an image's alt text
  if (opts.scrubText && node.attrs && typeof node.attrs === 'object') {
    for (const a of PROSE_ATTRS) {
      if (typeof node.attrs[a] === 'string') {
        node.attrs[a] = scrubPlainText(node.attrs[a], ctx.stats, opts.handles)
      }
    }
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
    // SCRUB_DESCRIPTIONS adds the email/phone scrub, and rewrites @handles of
    // Manifold users only: a description's @quillgazette is a source, not a user.
    if (data.description) {
      const idCtx = identityContext(ctx)
      const handles = (s: string) => (idCtx ? rewriteUserHandles(s, idCtx) : s)
      walkRichText(data.description, ctx, {
        scrubText: ctx.scrubDescriptions,
        handles,
      })
      if (ctx.scrubDescriptions && typeof data.description === 'string') {
        data.description = scrubPlainText(data.description, ctx.stats, handles)
      }
    }
    // Slugs are kept as they are, so a rare handle in the question survives
    // in the slug; counted for review.
    if (ctx.names && typeof row.slug === 'string') {
      let named = false
      mapWords(row.slug.replace(/-/g, ' '), (w) => {
        if (ctx.names?.isRare(w.toLowerCase())) named = true
        return undefined
      })
      if (named) ctx.stats.slugsWithRareHandle++
    }
  }
  return row
}

export function redactAnswer(row: Row, ctx: RedactContext): Row {
  applyCatalog('answers', row, ctx.ps)
  return row
}

const toMs = (v: unknown): number =>
  v instanceof Date
    ? v.getTime()
    : typeof v === 'string'
    ? Date.parse(v)
    : Number(v)

const BROKEN_FROM_MS = Date.parse(CANCEL_STAMP_BROKEN_FROM)
const FIXED_AT_MS = Date.parse(CANCEL_STAMP_FIXED_AT)

/**
 * Is updated_time this cancelled order's cancellation time? null for rows that
 * aren't cancelled orders. false when the order was placed before the trigger
 * fix and was never restamped (updated ≈ created: cancelled while the trigger
 * was broken, see scope.ts), or when a fill lands after updated_time.
 */
export function cancelTimeReliable(
  row: Row,
  stats?: RedactStats
): boolean | null {
  const cancelled = row.is_cancelled ?? row.data?.isCancelled
  if (cancelled !== true) return null
  if (stats) stats.cancelledOrders++
  const created = toMs(row.created_time)
  const updated = toMs(row.updated_time)
  let lastFill = -Infinity
  for (const f of Array.isArray(row.data?.fills) ? row.data.fills : []) {
    const t = Number(f?.timestamp)
    if (Number.isFinite(t) && t > lastFill) lastFill = t
  }
  const fillAfter =
    Number.isFinite(updated) && lastFill > updated + FILL_AFTER_CANCEL_SLACK_MS
  const neverRestamped =
    !Number.isFinite(created) ||
    !Number.isFinite(updated) ||
    (created < FIXED_AT_MS &&
      Math.abs(updated - created) < CANCEL_STAMP_SAME_MS)
  if (!fillAfter && !neverRestamped) return true
  if (stats) {
    stats.cancelTimeUnreliable++
    if (neverRestamped) {
      stats.cancelTimeUnreliableWindow++
      if (created < BROKEN_FROM_MS) stats.cancelTimeUnreliablePreWindow++
    }
    if (fillAfter) stats.cancelTimeUnreliableFillAfter++
  }
  return false
}

export function redactBet(row: Row, ctx: RedactContext): Row {
  applyCatalog('contract_bets', row, ctx.ps)
  row.cancel_time_reliable = cancelTimeReliable(row, ctx.stats)
  return row
}

export function redactLiquidity(row: Row, ctx: RedactContext): Row {
  applyCatalog('contract_liquidity', row, ctx.ps)
  return row
}

/**
 * Does a comment's text reach the delivery? The rules redactComment applies:
 * deleted-account comments are removed or blanked, and moderated ones are
 * blanked when BLANK_MODERATED_COMMENTS is on.
 */
export function commentTextShips(
  row: Row,
  deletedUserIds: Set<string>,
  blankModeratedComments: boolean
): boolean {
  const authorId = row.user_id ?? row.data?.userId
  if (authorId && deletedUserIds.has(String(authorId))) return false
  return !(blankModeratedComments && (row.data?.deleted || row.data?.hidden))
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

  // Moderator-deleted or hidden: same blanking, keeping the row and its
  // deleted/hidden flags so threads survive and moderation stays visible.
  if (ctx.blankModeratedComments && (row.data?.deleted || row.data?.hidden)) {
    ctx.stats.commentsBlankedModerated++
    row.data.content = { type: 'doc', content: [] }
    delete row.data.text
    return row
  }

  // scrub the comment body (rich text) + deprecated flat text field
  if (row.data?.content)
    walkRichText(row.data.content, ctx, { scrubText: true })
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
  // BANK endpoints carry the house account's uid (the house account — a real
  // row in users, so it would trip the leak scan). The endpoint type already
  // says everything the id does; normalize to the literal 'BANK' rather than
  // carving an exception into the scan. A few corrupt legacy rows also put the
  // house uid under a CONTRACT-typed endpoint (dev: 4 CONTRACT_RESOLUTION_PAYOUTs),
  // so any remaining raw house uid is normalized too. (USER-typed house
  // endpoints were already pseudonymized above, so this only hits raw values.)
  if (
    row.from_id != null &&
    (row.from_type === 'BANK' || HOUSE_IDS.has(row.from_id))
  ) {
    row.from_id = 'BANK'
  }
  if (
    row.to_id != null &&
    (row.to_type === 'BANK' || HOUSE_IDS.has(row.to_id))
  ) {
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
          d &&
          typeof d === 'object' &&
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

// Usernames in paths, links and preview/referral params (identity.ts), then
// raw ids. Values only: object keys never carry a URL.
function sweepValue(
  s: string,
  ctx: RedactContext,
  idCtx?: IdentityContext
): string {
  return sweepString(idCtx ? rewriteIdentityInString(s, idCtx) : s, ctx)
}

function sweepStrings(
  node: any,
  ctx: RedactContext,
  idCtx?: IdentityContext
): any {
  if (typeof node === 'string') return sweepValue(node, ctx, idCtx)
  if (!node || typeof node !== 'object') return node
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++)
      node[i] = sweepStrings(node[i], ctx, idCtx)
    return node
  }
  for (const [k, v] of Object.entries(node)) {
    const swept = sweepStrings(v, ctx, idCtx)
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

export function identityContext(
  ctx: RedactContext
): IdentityContext | undefined {
  return ctx.names
    ? {
        ps: ctx.ps,
        names: ctx.names,
        knownUserIds: ctx.knownUserIds,
        counts: ctx.stats,
      }
    : undefined
}

type Redactor = (row: Row, ctx: RedactContext) => Row | null

// Every table's output goes through the sweeps — an id or a username hidden in
// a string is not a contracts-only problem (comments are free text by
// definition). Bare-word replacement runs on prose fields only (mapProse), so
// enum and id values are never mistaken for handles.
function withSweep(table: TableName, fn: Redactor): Redactor {
  return (row, ctx) => {
    const idCtx = identityContext(ctx)
    // "Ostrander Quill (@OstranderQuill42)" first, on the raw row: the comment scrub below
    // turns the handle into @user, after which the pair can't be recognized.
    if (idCtx) mapProse(table, row, (s) => rewriteNameHandlePairs(s, idCtx))
    const fielded = fn(row, ctx)
    if (!fielded) return fielded
    const out =
      ctx.knownUserIds.size || idCtx
        ? sweepStrings(fielded, ctx, idCtx)
        : fielded
    // after the sweep, so a handle inside a path counts as a path rewrite
    if (idCtx && ctx.bareUsernames) {
      mapProse(table, out, (s) => rewriteBareNames(s, idCtx))
    }
    return out
  }
}

export const REDACTORS: Record<TableName, Redactor> = {
  contracts: withSweep('contracts', redactContract),
  answers: withSweep('answers', redactAnswer),
  contract_comments: withSweep('contract_comments', redactComment),
  contract_bets: withSweep('contract_bets', redactBet),
  contract_liquidity: withSweep('contract_liquidity', redactLiquidity),
  txns: withSweep('txns', redactTxn),
  bot_accounts: withSweep('bot_accounts', redactBotAccount),
}
