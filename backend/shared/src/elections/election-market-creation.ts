// Reviewed, resumable creation of 2026 general-election markets.
//
// Everything here is pure or talks to an injected `ElectionApi`, so the CLI
// (backend/scripts/create-election-markets.ts) supplies real HTTP calls and the
// tests supply mocks. Nothing in this module writes to a database.
//
// Safety model:
// - Dry run is the default. Apply requires a reviewed manifest, an explicit
//   apply flag, the expected creator account and a maximum mana spend.
// - Each entry has a deterministic `idempotencyKey`. The create-market API uses
//   it as the new contract's id and rejects a second create with the same key,
//   so a key can be reconciled read-only with GET /v0/market/:id before any
//   retry. Ambiguous outcomes (timeouts, 5xx, network errors) stop the run.
// - Before each create the run re-searches for an equivalent market by race
//   identity (office/state/district/year/round), not by title equality.
// - State is persisted after every request; created entries are never created
//   again, even if the manifest later changes.

import { createHash } from 'crypto'
import { getAnte } from 'common/economy'
import { MAX_ANSWER_LENGTH } from 'common/answer'
import { MAX_QUESTION_LENGTH } from 'common/contract'
import { MAX_GROUPS_PER_MARKET } from 'common/group'
import { liquidityTiers } from 'common/tier'

// Same alphabet as common/util/random's nanoid, so the key passes
// createMarketProps' `randomStringRegex` validation.
const KEY_ALPHABET =
  'useandom26T198340PX75pxJACKVERYMINDBUSHWOLFGQZbfghjklqvwyzrict'
const KEY_LENGTH = 10
const MIN_ANSWER_PROB = 1
const MAX_ANSWER_PROB = 99

export type Office = 'senate' | 'governor' | 'house'
export type PartyCode = 'D' | 'R' | 'I' | 'L' | 'G' | 'other' | 'unknown'

export type CreatePayload = {
  question: string
  descriptionMarkdown: string
  outcomeType: 'MULTIPLE_CHOICE' | 'BINARY'
  answers?: string[]
  answerProbs?: number[]
  shouldAnswersSumToOne?: boolean
  addAnswersMode?: 'DISABLED' | 'ONLY_CREATOR' | 'ANYONE'
  initialProb?: number
  closeTime: number
  liquidityTier: number
  extraLiquidity?: number
  groupIds?: string[]
  visibility: 'public' | 'unlisted'
}

export type AnswerMeta = {
  label: string
  // What the answer means for dashboard aggregation. A candidate's party is
  // audited metadata, never inferred from the label text.
  kind: 'party' | 'candidate' | 'other'
  party: PartyCode
  candidate?: string
  partyEvidence?: string
}

export type RaceIdentity = {
  cycle: 2026
  office: Office
  state: string
  stateName: string
  district?: number // 0 = at-large
  election: 'regular' | 'special'
  round: string
  // Names that identify this race's candidates; used to recognise a market
  // created after the audit that names candidates instead of the office.
  candidateNames: string[]
}

export type ManifestEntry = {
  raceKey: string
  status: 'ready' | 'unresolved'
  unresolvedFields?: string[]
  identity: RaceIdentity
  proposition: 'ballot-party' | 'candidate'
  shapeRationale: string
  payload?: CreatePayload
  answerMeta?: AnswerMeta[]
  seed?: { basis: string; note: string }
  liquidityPlan?: { tier: number; rationale: string; alternatives?: string }
  // Markets the audit already reviewed and rejected for this race. They must
  // not block creation when the pre-create search finds them again.
  reviewedRejectedContractIds?: string[]
  searchTerms: string[]
  dashboard: {
    list: 'senate2026' | 'governors2026' | 'HOUSE_RACE_MARKETS'
    key: string // state code, or district id like "CA-29"
    preferOverPortfolio?: boolean
  }
  evidence?: Record<string, unknown>
}

export type Manifest = {
  manifestVersion: string
  series: string
  generatedAt: string
  review: {
    approved: boolean
    reviewedBy: string | null
    reviewedAt: string | null
    notes?: string
  }
  budget: {
    // Cap across ALL runs for this manifest series; set by the reviewer.
    approvedMaxTotalMana: number | null
  }
  entries: ManifestEntry[]
}

export type EntryState = {
  raceKey: string
  idempotencyKey: string
  payloadHash: string
  status:
    | 'in-flight'
    | 'created'
    | 'skipped-existing'
    | 'needs-review'
    | 'pending-reconciliation'
    | 'failed'
  contractId?: string
  slug?: string
  url?: string
  answers?: { id: string; text: string }[]
  costMana?: number
  reservedMana?: number
  existing?: { id: string; slug?: string; question: string; verdict: string }[]
  message?: string
  updatedAt: string
}

export type CreationState = {
  series: string
  manifestVersion: string
  entries: Record<string, EntryState>
}

export type MarketLike = {
  id: string
  slug?: string
  question: string
  url?: string
  creatorUsername?: string
  outcomeType?: string
  isResolved?: boolean
  resolution?: string
  closeTime?: number
  answers?: { id: string; text: string }[]
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: 'rejected' | 'ambiguous' | 'rate-limited',
    readonly status?: number,
    readonly retryAfterMs?: number
  ) {
    super(message)
  }
}

export type ElectionApi = {
  // Read-only. Resolves undefined on 404; throws ApiError otherwise.
  getMarket(id: string): Promise<MarketLike | undefined>
  searchMarkets(term: string): Promise<MarketLike[]>
  // Authenticated read of the API key's own account.
  me(): Promise<{ id: string; username: string; balance: number }>
  // The only write.
  createMarket(
    body: CreatePayload & { idempotencyKey: string }
  ): Promise<{ id: string; slug?: string; url?: string }>
}

// ---------------------------------------------------------------------------
// Keys, hashes, cost
// ---------------------------------------------------------------------------

export function idempotencyKeyFor(series: string, raceKey: string) {
  const digest = createHash('sha256').update(`${series}\n${raceKey}`).digest()
  let key = ''
  for (let i = 0; i < KEY_LENGTH; i++) key += KEY_ALPHABET[digest[i] & 61]
  return key
}

export function payloadHash(payload: CreatePayload | undefined) {
  return createHash('sha256')
    .update(JSON.stringify(payload ?? null))
    .digest('hex')
    .slice(0, 16)
}

// Mirrors backend/api/src/create-market.ts: an 'Other' answer is added only
// when answers sum to one and adding answers is enabled.
export function costOf(payload: CreatePayload) {
  const hasOther =
    payload.outcomeType === 'MULTIPLE_CHOICE' &&
    payload.shouldAnswersSumToOne === true &&
    (payload.addAnswersMode ?? 'DISABLED') !== 'DISABLED'
  const numAnswers =
    payload.outcomeType === 'MULTIPLE_CHOICE'
      ? (payload.answers?.length ?? 0) + (hasOther ? 1 : 0)
      : undefined
  const ante = getAnte(payload.outcomeType, numAnswers, payload.liquidityTier)
  const extraLiquidity = payload.extraLiquidity ?? 0
  return { ante, extraLiquidity, total: ante + extraLiquidity, numAnswers }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateEntry(entry: ManifestEntry, now = Date.now()) {
  const errors: string[] = []
  const e = (m: string) => errors.push(`${entry.raceKey}: ${m}`)
  if (!/^2026-(senate|governor|house)-[A-Z]{2}-/.test(entry.raceKey))
    e('raceKey must start with 2026-<office>-<ST>-')
  if (entry.status !== 'ready') return errors
  const p = entry.payload
  if (!p) return [...errors, `${entry.raceKey}: ready entry has no payload`]
  if (!p.question || p.question.length > MAX_QUESTION_LENGTH)
    e(`question must be 1-${MAX_QUESTION_LENGTH} characters`)
  if (!p.descriptionMarkdown || p.descriptionMarkdown.length < 200)
    e('description must state the resolution criteria')
  if (!(p.closeTime > now)) e('closeTime must be in the future')
  if (!liquidityTiers.includes(p.liquidityTier as never))
    e(`liquidityTier must be one of ${liquidityTiers.join(', ')}`)
  if (
    p.extraLiquidity !== undefined &&
    (!Number.isFinite(p.extraLiquidity) || !(p.extraLiquidity >= 1))
  )
    e('extraLiquidity must be ≥ 1 when set')
  if ((p.groupIds?.length ?? 0) > MAX_GROUPS_PER_MARKET)
    e(`at most ${MAX_GROUPS_PER_MARKET} topics`)
  if (p.visibility !== 'public')
    e('visibility must be public for dashboard use')
  if (p.outcomeType === 'MULTIPLE_CHOICE') {
    const answers = p.answers ?? []
    if (answers.length < 2) e('needs at least two answers')
    if (
      new Set(answers.map((a) => a.trim().toLowerCase())).size !==
      answers.length
    )
      e('duplicate answer labels')
    if (answers.some((a) => !a.trim() || a.length > MAX_ANSWER_LENGTH))
      e(`answer labels must be 1-${MAX_ANSWER_LENGTH} characters`)
    if (p.shouldAnswersSumToOne !== true)
      e('race markets must be mutually exclusive (shouldAnswersSumToOne)')
    if (p.addAnswersMode !== 'DISABLED')
      e('addAnswersMode must be DISABLED so the answer set is the audited one')
    const probs = p.answerProbs
    if (!probs || probs.length !== answers.length)
      e('answerProbs must give a seed for every answer')
    else {
      if (probs.some((x) => !(x >= MIN_ANSWER_PROB && x <= MAX_ANSWER_PROB)))
        e(
          `seed probabilities must be within ${MIN_ANSWER_PROB}-${MAX_ANSWER_PROB}%`
        )
      const sum = probs.reduce((a, b) => a + b, 0)
      if (Math.abs(sum - 100) > 1e-6)
        e(`seed probabilities sum to ${sum}, not 100`)
    }
    const meta = entry.answerMeta ?? []
    if (
      meta.length !== answers.length ||
      meta.some((m, i) => m.label !== answers[i])
    )
      e('answerMeta must list every answer label in order')
    if (
      entry.proposition === 'candidate' &&
      meta.some((m) => m.kind === 'party')
    )
      e('a candidate market cannot carry party-proposition answers')
  } else if (p.outcomeType === 'BINARY') {
    e('binary race markets are not produced by this manifest; use a multi')
  }
  if (!entry.searchTerms?.length)
    e('needs searchTerms for the duplicate recheck')
  if (!entry.seed?.basis) e('seed basis must be documented')
  return errors
}

export function validateManifest(manifest: Manifest, now = Date.now()) {
  const errors: string[] = []
  if (!manifest.series) errors.push('manifest.series is required')
  const seen = new Set<string>()
  for (const entry of manifest.entries) {
    if (seen.has(entry.raceKey))
      errors.push(`duplicate raceKey ${entry.raceKey}`)
    seen.add(entry.raceKey)
    errors.push(...validateEntry(entry, now))
  }
  return errors
}

export type ApplyOptions = {
  apply: boolean
  creatorUsername?: string
  maxTotalMana?: number
  retryUnconfirmed?: boolean
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  log?: (line: string) => void
  reconcileAttempts?: number
}

export function applyPreconditions(manifest: Manifest, opts: ApplyOptions) {
  const errors: string[] = []
  if (!opts.apply) errors.push('apply flag not set')
  if (
    !manifest.review.approved ||
    !manifest.review.reviewedBy ||
    !manifest.review.reviewedAt
  )
    errors.push('manifest.review must be approved with reviewer name and date')
  if (!opts.creatorUsername) errors.push('--creator-username is required')
  if (
    !Number.isFinite(opts.maxTotalMana) ||
    !(opts.maxTotalMana && opts.maxTotalMana > 0)
  )
    errors.push('--max-mana (this run) is required')
  const cap = manifest.budget.approvedMaxTotalMana
  if (!Number.isFinite(cap) || !(cap && cap > 0))
    errors.push(
      'manifest.budget.approvedMaxTotalMana must be set by the reviewer'
    )
  errors.push(...validateManifest(manifest, opts.now?.() ?? Date.now()))
  return errors
}

// ---------------------------------------------------------------------------
// Equivalence of an existing market to a planned race
// ---------------------------------------------------------------------------

const ORDINAL = (n: number) =>
  `${n}${
    n % 100 >= 11 && n % 100 <= 13
      ? 'th'
      : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  }`

const EXCLUDE =
  /\b(primar(y|ies)|nominee|nomination|margin|by more than|vote share|turnout|percent|%|if |conditional|county|debate|endorse|poll(s|ing)?\b|how many|seats)\b/i
const OFFICE_RE: Record<Office, RegExp> = {
  senate: /\bsenat/i,
  governor: /\bgovern|gubernator/i,
  house: /\bhouse\b|congress|\bdistrict\b|\bcd[- ]?\d|representative/i,
}

function mentionsDistrict(text: string, id: RaceIdentity) {
  if (id.office !== 'house' || id.district === undefined) return true
  if (id.district === 0) return /at[- ]large|\bAL\b/i.test(text)
  const n = id.district
  return new RegExp(
    `\\b${id.state}[- ]?0?${n}\\b|\\b${ORDINAL(
      n
    )}\\b|district\\s*#?\\s*${n}\\b|\\bcd[- ]?${n}\\b`,
    'i'
  ).test(text)
}

export type Verdict = 'equivalent' | 'ambiguous' | 'unrelated'

export function classifyExistingMarket(
  entry: ManifestEntry,
  m: MarketLike
): { verdict: Verdict; reason: string } {
  const id = entry.identity
  if (m.isResolved || m.resolution)
    return { verdict: 'unrelated', reason: 'already resolved' }
  if (entry.reviewedRejectedContractIds?.includes(m.id))
    return {
      verdict: 'unrelated',
      reason: 'reviewed and rejected in the audit',
    }
  const text = `${m.question} ${(m.answers ?? []).map((a) => a.text).join(' ')}`
  const statePresent =
    new RegExp(`\\b${id.stateName}\\b`, 'i').test(text) ||
    new RegExp(`\\b${id.state}[- ]?(\\d{1,2}|AL)\\b`).test(text)
  const names = id.candidateNames.filter((n) => {
    const last = n.trim().split(/\s+/).pop() ?? ''
    return last.length > 2 && new RegExp(`\\b${last}\\b`, 'i').test(text)
  })
  const office = OFFICE_RE[id.office].test(m.question)
  const year =
    /\b2026\b/.test(text) || /\bnovember\b|\bgeneral\b|\bmidterm/i.test(text)
  const otherYear =
    (m.question.match(/\b20\d\d\b/g) ?? []).some((y) => y !== '2026') &&
    !/\b2026\b/.test(m.question)
  if (!statePresent && names.length === 0)
    return {
      verdict: 'unrelated',
      reason: 'different state and no candidate names',
    }
  if (otherYear)
    return { verdict: 'unrelated', reason: 'different election year' }
  if (!office && names.length === 0)
    return { verdict: 'unrelated', reason: 'different office' }
  if (EXCLUDE.test(m.question))
    return {
      verdict: office && statePresent ? 'ambiguous' : 'unrelated',
      reason: 'primary/margin/conditional/derivative wording',
    }
  if (id.office === 'house' && !mentionsDistrict(text, id))
    return names.length
      ? {
          verdict: 'ambiguous',
          reason: 'names a candidate but not the district',
        }
      : { verdict: 'unrelated', reason: 'different district' }
  if (
    id.office === 'senate' &&
    (id.election === 'special') !== /special/i.test(text)
  )
    return {
      verdict: 'ambiguous',
      reason: 'regular/special election wording differs',
    }
  if (!year) return { verdict: 'ambiguous', reason: 'year/round not stated' }
  // Office, state, district and year match. Party-proposition markets are
  // equivalent to a planned party market; anything else needs a reviewer.
  const partyAnswers =
    (m.answers ?? []).length >= 2 &&
    (m.answers ?? []).every((a) =>
      /democrat|republican|other|independent|party|dfl/i.test(a.text)
    )
  const partyBinary =
    m.outcomeType === 'BINARY' &&
    /will (a|the) (democrat|republican)/i.test(m.question)
  if (
    entry.proposition === 'ballot-party' &&
    (partyAnswers || partyBinary) &&
    office &&
    statePresent
  )
    return {
      verdict: 'equivalent',
      reason: 'same office/state/district/year with party outcomes',
    }
  if (
    entry.proposition === 'candidate' &&
    office &&
    statePresent &&
    (m.answers ?? []).length >= 2 &&
    names.length >= 2
  )
    return {
      verdict: 'equivalent',
      reason: 'same race with the audited candidates as answers',
    }
  return {
    verdict: 'ambiguous',
    reason: 'same race, different proposition or answer set',
  }
}

// ---------------------------------------------------------------------------
// Plan (read-only) and apply
// ---------------------------------------------------------------------------

export type PlanItem = {
  raceKey: string
  action:
    | 'create'
    | 'already-created'
    | 'skip-existing'
    | 'needs-review'
    | 'unresolved'
    | 'pending-reconciliation'
    | 'failed-earlier'
  idempotencyKey: string
  cost?: ReturnType<typeof costOf>
  existing?: EntryState['existing']
  note?: string
}

export function emptyState(manifest: Manifest): CreationState {
  return {
    series: manifest.series,
    manifestVersion: manifest.manifestVersion,
    entries: {},
  }
}

export async function findExisting(
  entry: ManifestEntry,
  api: Pick<ElectionApi, 'searchMarkets'>
) {
  const found = new Map<string, MarketLike>()
  for (const term of entry.searchTerms) {
    for (const m of await api.searchMarkets(term)) found.set(m.id, m)
  }
  const verdicts = [...found.values()].map((m) => ({
    m,
    ...classifyExistingMarket(entry, m),
  }))
  return {
    equivalent: verdicts.filter((v) => v.verdict === 'equivalent'),
    ambiguous: verdicts.filter((v) => v.verdict === 'ambiguous'),
  }
}

// Offline plan: no network. Used by the dry run and as the apply skeleton.
export function planOffline(
  manifest: Manifest,
  state: CreationState
): PlanItem[] {
  return manifest.entries.map((entry) => {
    const key = idempotencyKeyFor(manifest.series, entry.raceKey)
    const prior = state.entries[entry.raceKey]
    if (entry.status !== 'ready')
      return {
        raceKey: entry.raceKey,
        action: 'unresolved',
        idempotencyKey: key,
        note: entry.unresolvedFields?.join('; '),
      }
    const cost = costOf(entry.payload!)
    if (prior?.status === 'created')
      return {
        raceKey: entry.raceKey,
        action: 'already-created',
        idempotencyKey: key,
        cost,
        note: prior.contractId,
      }
    if (prior?.status === 'skipped-existing')
      return {
        raceKey: entry.raceKey,
        action: 'skip-existing',
        idempotencyKey: key,
        existing: prior.existing,
      }
    if (
      prior?.status === 'pending-reconciliation' ||
      prior?.status === 'in-flight'
    )
      return {
        raceKey: entry.raceKey,
        action: 'pending-reconciliation',
        idempotencyKey: key,
        cost,
      }
    if (prior?.status === 'failed')
      return {
        raceKey: entry.raceKey,
        action: 'failed-earlier',
        idempotencyKey: key,
        cost,
        note: prior.message,
      }
    return {
      raceKey: entry.raceKey,
      action: 'create',
      idempotencyKey: key,
      cost,
    }
  })
}

export function spentSoFar(state: CreationState) {
  return Object.values(state.entries).reduce(
    (sum, e) =>
      sum +
      (e.status === 'created' ? e.costMana ?? 0 : 0) +
      (e.status === 'pending-reconciliation' || e.status === 'in-flight'
        ? e.reservedMana ?? 0
        : 0),
    0
  )
}

export type ApplyResult = {
  created: string[]
  skippedExisting: string[]
  needsReview: string[]
  failed: string[]
  pending: string[]
  stoppedReason?: string
  spentThisRun: number
}

export async function applyManifest(
  manifest: Manifest,
  state: CreationState,
  api: ElectionApi,
  opts: ApplyOptions,
  persist: (state: CreationState) => Promise<void> | void
): Promise<ApplyResult> {
  const now = opts.now ?? Date.now
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  const log = opts.log ?? (() => undefined)
  const problems = applyPreconditions(manifest, opts)
  if (problems.length)
    throw new Error(`Refusing to apply:\n- ${problems.join('\n- ')}`)
  if (state.series !== manifest.series)
    throw new Error(
      `State file belongs to series ${state.series}, not ${manifest.series}`
    )
  const me = await api.me()
  if (me.username !== opts.creatorUsername)
    throw new Error(
      `API key belongs to @${me.username}, not @${opts.creatorUsername}`
    )

  const result: ApplyResult = {
    created: [],
    skippedExisting: [],
    needsReview: [],
    failed: [],
    pending: [],
    spentThisRun: 0,
  }
  let balance = me.balance
  const cap = manifest.budget.approvedMaxTotalMana!
  const stamp = () => new Date(now()).toISOString()
  const save = async (
    raceKey: string,
    patch: Partial<EntryState> & Pick<EntryState, 'status'>
  ) => {
    const prior = state.entries[raceKey]
    state.entries[raceKey] = {
      ...(prior as EntryState),
      ...patch,
      raceKey,
      updatedAt: stamp(),
    } as EntryState
    await persist(state)
  }
  const fetchAnswers = async (id: string) => {
    for (let i = 0; i < (opts.reconcileAttempts ?? 4); i++) {
      try {
        const m = await api.getMarket(id)
        if (m) return m
      } catch (err) {
        log(`read of ${id} failed (${(err as Error).message}); retrying`)
      }
      await sleep(2000 * (i + 1))
    }
    return undefined
  }

  for (const entry of manifest.entries) {
    if (entry.status !== 'ready') continue
    const key = idempotencyKeyFor(manifest.series, entry.raceKey)
    const hash = payloadHash(entry.payload)
    const prior = state.entries[entry.raceKey]
    if (prior?.status === 'created' || prior?.status === 'skipped-existing') {
      if (prior.status === 'created' && prior.payloadHash !== hash)
        log(
          `${entry.raceKey}: already created as ${prior.contractId}; manifest payload changed since — NOT recreating`
        )
      continue
    }
    if (prior?.status === 'needs-review' || prior?.status === 'failed') {
      log(
        `${entry.raceKey}: ${prior.status} in an earlier run (${
          prior.message ?? ''
        }); clear it in the state file after review to retry`
      )
      continue
    }

    // 1) Read-only reconciliation of our reserved id, always first.
    let atKey: MarketLike | undefined
    try {
      atKey = await api.getMarket(key)
    } catch (err) {
      result.stoppedReason = `could not read reserved id ${key}: ${
        (err as Error).message
      }`
      break
    }
    if (atKey) {
      await save(entry.raceKey, {
        status: 'created',
        idempotencyKey: key,
        payloadHash: prior?.payloadHash ?? hash,
        contractId: atKey.id,
        slug: atKey.slug,
        url: atKey.url,
        answers: atKey.answers,
        costMana: prior?.reservedMana ?? costOf(entry.payload!).total,
        reservedMana: 0,
        message: 'reconciled read-only: market exists at the reserved id',
      })
      result.created.push(entry.raceKey)
      continue
    }
    if (
      (prior?.status === 'pending-reconciliation' ||
        prior?.status === 'in-flight') &&
      !opts.retryUnconfirmed
    ) {
      result.pending.push(entry.raceKey)
      log(
        `${entry.raceKey}: earlier create is unconfirmed and no market exists at ${key}; rerun with --retry-unconfirmed to re-send (the reserved id still blocks duplicates)`
      )
      continue
    }

    // 2) Budget, before any write.
    const cost = costOf(entry.payload!)
    // A retried unconfirmed entry already holds a reservation for itself.
    const spent = spentSoFar(state) - (prior?.reservedMana ?? 0)
    if (result.spentThisRun + cost.total > opts.maxTotalMana!) {
      result.stoppedReason = `run budget: ${result.spentThisRun} spent, next costs ${cost.total}, cap ${opts.maxTotalMana}`
      break
    }
    if (spent + cost.total > cap) {
      result.stoppedReason = `approved manifest budget: ${spent} committed, next costs ${cost.total}, cap ${cap}`
      break
    }
    if (balance < cost.total) {
      result.stoppedReason = `creator balance ${Math.floor(
        balance
      )} < next cost ${cost.total}`
      break
    }

    // 3) Re-check for an equivalent market created since the audit.
    let found
    try {
      found = await findExisting(entry, api)
    } catch (err) {
      result.stoppedReason = `duplicate search failed for ${entry.raceKey}: ${
        (err as Error).message
      }`
      break
    }
    const existing = [...found.equivalent, ...found.ambiguous].map((v) => ({
      id: v.m.id,
      slug: v.m.slug,
      question: v.m.question,
      verdict: `${v.verdict}: ${v.reason}`,
    }))
    if (found.equivalent.length) {
      await save(entry.raceKey, {
        status: 'skipped-existing',
        idempotencyKey: key,
        payloadHash: hash,
        existing,
      })
      result.skippedExisting.push(entry.raceKey)
      continue
    }
    if (found.ambiguous.length) {
      await save(entry.raceKey, {
        status: 'needs-review',
        idempotencyKey: key,
        payloadHash: hash,
        existing,
        message: 'possible existing market; review before creating',
      })
      result.needsReview.push(entry.raceKey)
      continue
    }

    // 4) The write. Mark in-flight first so a crash leaves a reconcilable trace.
    await save(entry.raceKey, {
      status: 'in-flight',
      idempotencyKey: key,
      payloadHash: hash,
      reservedMana: cost.total,
    })
    let createdId: string | undefined
    let ambiguous: string | undefined
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const res = await api.createMarket({
          ...entry.payload!,
          idempotencyKey: key,
        })
        createdId = res.id
        break
      } catch (err) {
        const ae =
          err instanceof ApiError
            ? err
            : new ApiError(String((err as Error)?.message ?? err), 'ambiguous')
        if (ae.kind === 'rate-limited') {
          await sleep(ae.retryAfterMs ?? 15_000 * (attempt + 1))
          continue
        }
        if (
          ae.kind === 'rejected' &&
          /already been created/i.test(ae.message)
        ) {
          ambiguous = 'server reports the reserved id already exists'
          break
        }
        if (ae.kind === 'rejected') {
          await save(entry.raceKey, {
            status: 'failed',
            reservedMana: 0,
            message: `${ae.status ?? ''} ${ae.message}`.trim(),
          })
          result.failed.push(entry.raceKey)
          if (ae.status === 403 || ae.status === 401)
            result.stoppedReason = `account/permission error: ${ae.message}`
          break
        }
        ambiguous = ae.message
        break
      }
    }
    if (result.stoppedReason) break
    if (state.entries[entry.raceKey].status === 'failed') continue
    if (!createdId && !ambiguous) {
      await save(entry.raceKey, {
        status: 'failed',
        reservedMana: 0,
        message: 'rate limited on every attempt',
      })
      result.failed.push(entry.raceKey)
      result.stoppedReason = 'rate limited'
      break
    }

    // 5) Read back (and, if ambiguous, reconcile) by the reserved id only.
    const market = await fetchAnswers(createdId ?? key)
    if (market) {
      await save(entry.raceKey, {
        status: 'created',
        contractId: market.id,
        slug: market.slug,
        url: market.url,
        answers: market.answers,
        costMana: cost.total,
        reservedMana: 0,
        message: ambiguous ? `reconciled after: ${ambiguous}` : undefined,
      })
      result.created.push(entry.raceKey)
      result.spentThisRun += cost.total
      balance -= cost.total
      continue
    }
    if (createdId) {
      // Created, but answer ids not readable yet; keep the id, don't re-create.
      await save(entry.raceKey, {
        status: 'created',
        contractId: createdId,
        costMana: cost.total,
        reservedMana: 0,
        message: 'created; answer ids not yet read back',
      })
      result.created.push(entry.raceKey)
      result.spentThisRun += cost.total
      balance -= cost.total
      continue
    }
    await save(entry.raceKey, {
      status: 'pending-reconciliation',
      message: `ambiguous create (${ambiguous}); no market at ${key} yet`,
    })
    result.pending.push(entry.raceKey)
    result.stoppedReason = `ambiguous create for ${entry.raceKey}; stopped so it can be reconciled read-only before any retry`
    break
  }
  return result
}

// ---------------------------------------------------------------------------
// HTTP client for the public API (the CLI's only network layer)
// ---------------------------------------------------------------------------

export const API_BASES = {
  prod: 'https://api.manifold.markets',
  dev: 'https://api.dev.manifold.markets',
} as const

type FetchLike = (
  url: string,
  init?: {
    method?: string
    headers?: Record<string, string>
    body?: string
    signal?: AbortSignal
  }
) => Promise<{
  ok: boolean
  status: number
  headers: { get(name: string): string | null }
  json(): Promise<any>
  text(): Promise<string>
}>

const toMarketLike = (m: any): MarketLike => ({
  id: m.id,
  slug: m.slug,
  question: m.question,
  url: m.url,
  creatorUsername: m.creatorUsername,
  outcomeType: m.outcomeType,
  isResolved: m.isResolved,
  resolution: m.resolution,
  closeTime: m.closeTime,
  answers: (m.answers ?? []).map((a: any) => ({ id: a.id, text: a.text })),
})

// `allowWrites: false` (every dry run) makes createMarket throw before any
// request is made, and no API key is attached to reads.
export function makeHttpApi(opts: {
  apiBase: string
  apiKey?: string
  allowWrites: boolean
  fetch?: FetchLike
  readTimeoutMs?: number
  createTimeoutMs?: number
}): ElectionApi {
  const f: FetchLike = opts.fetch ?? (globalThis.fetch as unknown as FetchLike)
  const url = (path: string) => `${opts.apiBase.replace(/\/$/, '')}/${path}`
  const timeout = (ms: number) => AbortSignal.timeout(ms)
  const classify = async (
    res: Awaited<ReturnType<FetchLike>>,
    what: string
  ) => {
    const body = await res.text().catch(() => '')
    const message = `${what}: HTTP ${res.status} ${body.slice(0, 300)}`
    if (res.status === 429) {
      const ra = Number(res.headers.get('retry-after'))
      return new ApiError(
        message,
        'rate-limited',
        429,
        Number.isFinite(ra) && ra > 0 ? ra * 1000 : undefined
      )
    }
    if (res.status >= 500) return new ApiError(message, 'ambiguous', res.status)
    return new ApiError(message, 'rejected', res.status)
  }
  const read = async (path: string, auth = false) => {
    const headers: Record<string, string> = {}
    if (auth) {
      if (!opts.apiKey)
        throw new Error('MANIFOLD_API_KEY is required for this read')
      headers.Authorization = `Key ${opts.apiKey}`
    }
    for (let attempt = 0; ; attempt++) {
      let res
      try {
        res = await f(url(path), {
          headers,
          signal: timeout(opts.readTimeoutMs ?? 20_000),
        })
      } catch (err) {
        if (attempt >= 3)
          throw new ApiError(
            `GET ${path}: ${(err as Error).message}`,
            'ambiguous'
          )
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
        continue
      }
      if (res.ok) return res.json()
      if (res.status === 404) return undefined
      const err = await classify(res, `GET ${path}`)
      if (
        (err.kind === 'rate-limited' || err.kind === 'ambiguous') &&
        attempt < 3
      ) {
        await new Promise((r) =>
          setTimeout(r, err.retryAfterMs ?? 1000 * 2 ** attempt)
        )
        continue
      }
      throw err
    }
  }
  return {
    getMarket: async (id) => {
      const m = await read(`v0/market/${encodeURIComponent(id)}`)
      return m ? toMarketLike(m) : undefined
    },
    searchMarkets: async (term) => {
      const q = new URLSearchParams({
        term,
        filter: 'all',
        contractType: 'ALL',
        limit: '100',
        sort: 'score',
      })
      const found = new Map<string, MarketLike>()
      for (let offset = 0; offset < 10_000; offset += 100) {
        q.set('offset', String(offset))
        const rows = (await read(`v0/search-markets?${q}`)) ?? []
        const previous = found.size
        for (const row of rows) found.set(row.id, toMarketLike(row))
        if (rows.length < 100) return [...found.values()]
        if (found.size === previous)
          throw new Error(
            `Duplicate search did not advance for ${term}; review before creating`
          )
      }
      throw new Error(
        `Duplicate search reached its page limit for ${term}; review before creating`
      )
    },
    me: async () => {
      const u = await read('v0/me', true)
      return { id: u.id, username: u.username, balance: Number(u.balance) }
    },
    createMarket: async (body) => {
      if (!opts.allowWrites)
        throw new Error(
          'Refusing to write: this client was built for a dry run'
        )
      if (!opts.apiKey)
        throw new Error('MANIFOLD_API_KEY is required to create markets')
      let res
      try {
        res = await f(url('v0/market'), {
          method: 'POST',
          headers: {
            Authorization: `Key ${opts.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: timeout(opts.createTimeoutMs ?? 60_000),
        })
      } catch (err) {
        // Includes our own timeout: the server may still have created it.
        throw new ApiError(
          `POST v0/market: ${(err as Error).message}`,
          'ambiguous'
        )
      }
      if (!res.ok) throw await classify(res, 'POST v0/market')
      const m = await res.json()
      return { id: m.id, slug: m.slug, url: m.url }
    },
  }
}

// ---------------------------------------------------------------------------
// Dashboard mapping output
// ---------------------------------------------------------------------------

export type MappingRow = {
  raceKey: string
  list: ManifestEntry['dashboard']['list']
  key: string
  slug: string // real slug, or PENDING:<raceKey>
  contractId: string // real id, or PENDING:<raceKey>
  url: string | null
  preferOverPortfolio?: boolean
  proposition: ManifestEntry['proposition']
  answers: (AnswerMeta & { answerId: string })[]
  status: EntryState['status'] | 'planned' | 'unresolved'
}

export function buildDashboardMapping(
  manifest: Manifest,
  state: CreationState
): MappingRow[] {
  return manifest.entries.map((entry) => {
    const s = state.entries[entry.raceKey]
    const pending = `PENDING:${entry.raceKey}`
    const live = s?.status === 'created' && s.contractId
    const byText = new Map((s?.answers ?? []).map((a) => [a.text, a.id]))
    return {
      raceKey: entry.raceKey,
      list: entry.dashboard.list,
      key: entry.dashboard.key,
      slug: live && s.slug ? s.slug : pending,
      contractId: live ? s.contractId! : pending,
      url: live ? s.url ?? null : null,
      preferOverPortfolio: entry.dashboard.preferOverPortfolio,
      proposition: entry.proposition,
      answers: (entry.answerMeta ?? []).map((a) => ({
        ...a,
        answerId:
          (live && byText.get(a.label)) ||
          `PENDING:${entry.raceKey}#${a.label}`,
      })),
      status:
        s?.status ?? (entry.status === 'ready' ? 'planned' : 'unresolved'),
    }
  })
}
