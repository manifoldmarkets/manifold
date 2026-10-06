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

// 'president' covers the state (and ME/NE district) elector markets and the
// national Electoral College winner (state code 'US').
export type Office = 'senate' | 'governor' | 'house' | 'president'
export const OFFICES: readonly Office[] = [
  'senate',
  'governor',
  'house',
  'president',
]
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
  // Election year: 2026 for the midterm manifests, 2028/2032/2036 for the
  // generic presidential-cycle manifests. The raceKey starts with it.
  cycle: number
  office: Office
  state: string // 'US' for the national presidential market
  stateName: string
  district?: number // 0 = at-large; for president: a ME/NE elector district
  election: 'regular' | 'special'
  round: string
  // Names that identify this race's candidates; used to recognise a market
  // created after the audit that names candidates instead of the office.
  // Empty for the generic party markets, which deliberately name nobody.
  candidateNames: string[]
}

// Page list names: the 2026 launch used `senate2026`, `governors2026` and
// `HOUSE_RACE_MARKETS`; later cycles use `<office>s?<cycle>`.
export type DashboardList =
  | 'senate2026'
  | 'governors2026'
  | 'HOUSE_RACE_MARKETS'
  | `senate${number}`
  | `governors${number}`
  | `house${number}`
  | `president${number}`

export type RaceManifestEntry = {
  kind?: 'race'
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
    list: DashboardList
    key: string // state code, or district id like "CA-29"; "US" nationally
    // Filled consistently by the 2028+ generator so a future page can be
    // wired from the mapping output alone.
    cycle?: number
    office?: Office
    preferOverPortfolio?: boolean
  }
  evidence?: Record<string, unknown>
}

// A statewide ballot question on the November 3, 2026 ballot. Measures are a
// different proposition from races: one binary per measure, YES = the measure
// is approved under its own official approval rule at this election.
export type MeasureDesignationKind =
  | 'prop'
  | 'question'
  | 'amendment'
  | 'issue'
  | 'measure'
  | 'sq'
  | 'initiative'
  | 'ci'
  | 'i'
  | 'hjr'
  | 'proposal'
  | 'il26'
  | 'referendum'
  | 'other'

export type MeasureIdentity = {
  cycle: 2026
  electionDate: '2026-11-03'
  state: string
  stateName: string
  // The official ballot number/letter, e.g. { kind: 'prop', value: '50' }.
  // Null when the state does not number the question; aliases must then
  // identify it.
  designation: {
    kind: MeasureDesignationKind
    value: string
    label: string
  } | null
  officialTitle: string
  shortSubject: string
  // Old initiative/filing numbers, act names and nicknames a market may use.
  aliases: string[]
  measureType: string
  advisory: boolean
  // The official approval rule, including any turnout or second-vote rule.
  approvalRule: string
  // e.g. "first approved by voters in 2024" for Nevada initiated amendments.
  secondVoteOf?: string | null
  certifyingAuthority: string
  officialSourceUrl: string
}

export type MeasureManifestEntry = {
  kind: 'ballot-measure'
  // Stable key, e.g. "2026-measure-CA-prop-50". Named raceKey so the shared
  // plan/apply/state machinery treats both kinds alike.
  raceKey: string
  status: 'ready' | 'unresolved'
  unresolvedFields?: string[]
  measure: MeasureIdentity
  proposition: 'measure-approval'
  yesMeaning: string
  shapeRationale: string
  payload?: CreatePayload
  seed?: { basis: string; note: string; needsReview: boolean }
  liquidityPlan?: {
    tier: number
    rationale: string
    enhancedTier?: number
    enhancedRationale?: string
    alternatives?: string
  }
  reviewedRejectedContractIds?: string[]
  // Portfolio answers already reviewed and rejected: "contractId#answerId".
  reviewedRejectedAnswers?: string[]
  searchTerms: string[]
  dashboard: {
    list: 'BALLOT_MEASURES'
    key: string
    state: string
    // The page's stable measure key can differ from the creation/state key.
    pageKey?: string
  }
  evidence?: Record<string, unknown>
}

// `ManifestEntry` stays the race entry for existing callers.
export type ManifestEntry = RaceManifestEntry
export type AnyManifestEntry = RaceManifestEntry | MeasureManifestEntry

export const isMeasureEntry = (
  entry: AnyManifestEntry
): entry is MeasureManifestEntry => entry.kind === 'ballot-measure'

export type Manifest = {
  // 'ballot-measures' manifests hold only ballot-measure entries and use their
  // own idempotency series; absent means the original race manifest.
  kind?: 'races' | 'ballot-measures'
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
  entries: AnyManifestEntry[]
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
  // Persist with the created record: a rerun must not skip a seed failure.
  // Clear only after a person has reviewed the market and API seed support.
  seedReviewRequired?: string
  // Quiet creation stages the market unlisted, then publishes after read-back.
  pendingPublication?: boolean
  // Save each successful edit so a resume finishes styling before publication.
  answerColorsApplied?: Record<string, string>
  existing?: {
    id: string
    slug?: string
    question: string
    verdict: string
    answerId?: string
  }[]
  message?: string
  updatedAt: string
}

export type CreationState = {
  series: string
  manifestVersion: string
  // Bound on the first apply, so a state file is never reused against a
  // different API (dev vs prod) or creator account.
  apiBase?: string
  creatorId?: string
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
  answers?: {
    id: string
    text: string
    resolution?: string
    probability?: number
  }[]
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
  // Creation charges the ante. Publishing only changes visibility.
  createMarket(
    body: CreatePayload & { idempotencyKey: string }
  ): Promise<{ id: string; slug?: string; url?: string }>
  publishMarket?(id: string): Promise<void>
  setAnswerColor?(
    contractId: string,
    answerId: string,
    color: string
  ): Promise<void>
}

export function plannedAnswerColors(entry: AnyManifestEntry) {
  if (isMeasureEntry(entry)) return []
  return (entry.answerMeta ?? []).map((answer) => ({
    label: answer.label,
    color:
      answer.party === 'D'
        ? '#adc4e3'
        : answer.party === 'R'
        ? '#ecbab5'
        : answer.party === 'I'
        ? '#80cbc4'
        : '#9e9fbd',
  }))
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

// One resolution template for every measure market, so the rules are the
// same across states: the official approval rule (quoted), the 2026 vote only,
// the certified result, recounts, N/A when there is no vote, and a fixed
// choice that later court rulings do not change the result.
export function measureDescriptionMarkdown(
  m: MeasureIdentity,
  extra: { yesMeans: string; noMeans: string; seedNote: string }
) {
  const name = `${m.stateName} ${
    m.designation ? `${m.designation.label} ` : ''
  }(${m.officialTitle})`
  return [
    `This market resolves **YES** if ${name} is **approved by voters at the November 3, 2026 general election** under its official approval rule:`,
    '',
    `> ${m.approvalRule}`,
    '',
    m.secondVoteOf
      ? `This is the second required vote (${m.secondVoteOf}). Only the 2026 vote counts here: the market resolves YES only if the measure is approved at the November 3, 2026 election.`
      : `Only the November 3, 2026 vote counts; earlier votes on similar proposals do not.`,
    m.advisory
      ? 'This is an **advisory** (non-binding) question. YES means voters approve the question at the ballot; it does not mean any law is enacted or takes effect.'
      : 'YES means voter approval at this election, not that the measure is later implemented.',
    '',
    '**What the votes mean (official summary):**',
    `- YES: ${extra.yesMeans}`,
    `- NO: ${extra.noMeans}`,
    '',
    `**Results:** resolves on the result certified by ${m.certifyingAuthority}. It may resolve earlier once official returns or the Associated Press show the outcome cannot change and no recount is pending; if a recount or certified correction changes the outcome before resolution, the certified result controls.`,
    '',
    '**No vote:** if the measure is removed from the ballot, a court orders its votes not to be counted, or the vote is postponed beyond November 3, 2026, the market resolves N/A.',
    '',
    '**Later legal challenges:** resolution follows voter approval as certified. A court later invalidating, enjoining or delaying the measure does not change the resolution.',
    '',
    `**Starting probability:** ${extra.seedNote}`,
    '',
    `Official source: ${m.officialSourceUrl}`,
  ].join('\n')
}

// Exact question shape for measure markets (task requirement).
export const MEASURE_QUESTION_RE =
  /^Will .+ be approved in the November 3, 2026 election\?$/

export function validateMeasureEntry(
  entry: MeasureManifestEntry,
  now = Date.now()
) {
  const errors: string[] = []
  const e = (m: string) => errors.push(`${entry.raceKey}: ${m}`)
  const id = entry.measure
  if (!/^2026-measure-[A-Z]{2}-[a-z0-9-]+$/.test(entry.raceKey))
    e('raceKey must look like 2026-measure-<ST>-<slug>')
  if (!id || id.cycle !== 2026 || id.electionDate !== '2026-11-03')
    e('measure identity must be the November 3, 2026 election')
  if (id && !entry.raceKey.startsWith(`2026-measure-${id.state}-`))
    e('raceKey state must match the measure state')
  if (entry.dashboard?.list !== 'BALLOT_MEASURES')
    e('dashboard.list must be BALLOT_MEASURES')
  const pageKey = entry.dashboard?.pageKey
  if (
    pageKey !== undefined &&
    (!/^[A-Z]{2}-[a-z0-9-]+$/.test(pageKey) ||
      !pageKey.startsWith(`${id?.state}-`))
  )
    e('dashboard.pageKey must be a page measure key in the same state')
  if (entry.status !== 'ready') return errors
  if (!id?.designation && !(id?.aliases ?? []).length)
    e('needs an official designation or aliases to identify the measure')
  for (const k of [
    'officialTitle',
    'approvalRule',
    'certifyingAuthority',
    'officialSourceUrl',
  ] as const)
    if (!id?.[k]) e(`measure.${k} is required`)
  if (id?.officialSourceUrl && !/^https:\/\//.test(id.officialSourceUrl))
    e('measure.officialSourceUrl must be an https URL')
  const p = entry.payload
  if (!p) return [...errors, `${entry.raceKey}: ready entry has no payload`]
  if (p.outcomeType !== 'BINARY')
    e('ballot-measure markets are binary (YES = approved)')
  if (!MEASURE_QUESTION_RE.test(p.question))
    e(
      'question must read "Will <state, identifier, subject> be approved in the November 3, 2026 election?"'
    )
  if (p.question.length > MAX_QUESTION_LENGTH)
    e(`question must be at most ${MAX_QUESTION_LENGTH} characters`)
  if (!p.question.includes(id.stateName)) e('question must name the state')
  if (
    id.designation &&
    !p.question.toLowerCase().includes(id.designation.label.toLowerCase())
  )
    e('question must include the official designation')
  if (
    !(
      Number.isFinite(p.initialProb) &&
      p.initialProb! >= MIN_ANSWER_PROB &&
      p.initialProb! <= MAX_ANSWER_PROB
    )
  )
    e(`initialProb must be ${MIN_ANSWER_PROB}-${MAX_ANSWER_PROB}`)
  if (p.answers?.length || p.answerProbs?.length)
    e('a binary payload has no answers')
  const d = p.descriptionMarkdown ?? ''
  if (d.length < 400) e('description must state the full resolution criteria')
  if (id?.approvalRule && !d.includes(id.approvalRule))
    e('description must quote the official approval rule verbatim')
  if (id?.officialSourceUrl && !d.includes(id.officialSourceUrl))
    e('description must link the official source')
  for (const [re, what] of [
    [/\bN\/A\b/, 'an N/A rule for removal, cancellation or postponement'],
    [/recount/i, 'recount handling'],
    [/certif/i, 'certified-result handling'],
    [/(invalidat|struck down|court)/i, 'treatment of later legal invalidation'],
  ] as const)
    if (!re.test(d)) e(`description must state ${what}`)
  if (id?.secondVoteOf && !/2026/.test(d))
    e('a second-vote measure must say the 2026 vote is the one that counts')
  if (id?.advisory) {
    if (!/advisory/i.test(d)) e('an advisory question must say it is advisory')
    if (/becomes? law|takes? effect/i.test(p.question))
      e('an advisory question must not promise it becomes law')
    // A binding amendment, statute or bond described as non-binding would
    // tell traders the opposite of what a YES vote does.
    if (!/advisory/i.test(id.measureType ?? ''))
      e(
        `only an advisory measure type can be marked advisory (got "${id.measureType}")`
      )
  } else if (/non-binding|\badvisory\b/i.test(d))
    e('a binding measure must not be described as advisory')
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
  if (!entry.searchTerms?.length)
    e('needs searchTerms for the duplicate recheck')
  if (!entry.seed?.basis) e('seed basis must be documented')
  if (
    entry.seed &&
    p.initialProb === 50 &&
    !entry.seed.needsReview &&
    /unsupported|no basis/i.test(entry.seed.basis)
  )
    e('an unsupported 50% seed must be flagged needsReview')
  return errors
}

export function validateEntry(entry: AnyManifestEntry, now = Date.now()) {
  if (isMeasureEntry(entry)) return validateMeasureEntry(entry, now)
  const errors: string[] = []
  const e = (m: string) => errors.push(`${entry.raceKey}: ${m}`)
  const keyParts = entry.raceKey.match(
    /^(\d{4})-(senate|governor|house|president)-([A-Z]{2})-/
  )
  if (!keyParts) e('raceKey must start with <cycle>-<office>-<ST>-')
  else {
    const id = entry.identity
    if (Number(keyParts[1]) !== id?.cycle)
      e(`raceKey cycle ${keyParts[1]} must match identity.cycle ${id?.cycle}`)
    if (keyParts[2] !== id?.office)
      e(
        `raceKey office ${keyParts[2]} must match identity.office ${id?.office}`
      )
    if (keyParts[3] !== id?.state)
      e(`raceKey state ${keyParts[3]} must match identity.state ${id?.state}`)
  }
  if (
    entry.identity?.office === 'president' &&
    entry.proposition !== 'ballot-party'
  )
    e('presidential markets resolve by party, not by candidate')
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
  // Keep the two kinds of manifest (and their idempotency series) apart.
  const measures = manifest.kind === 'ballot-measures'
  for (const entry of manifest.entries)
    if (isMeasureEntry(entry) !== measures)
      errors.push(
        `${entry.raceKey}: ${measures ? 'race' : 'ballot-measure'} entry in a ${
          manifest.kind ?? 'races'
        } manifest`
      )
  if (measures && !/ballot-measures/.test(manifest.series))
    errors.push(
      'a ballot-measures manifest needs its own *ballot-measures* series'
    )
  if (!measures && /ballot-measures/.test(manifest.series))
    errors.push('a race manifest cannot use a ballot-measures series')
  const seen = new Set<string>()
  const pageKeys = new Set<string>()
  for (const entry of manifest.entries) {
    if (seen.has(entry.raceKey))
      errors.push(`duplicate raceKey ${entry.raceKey}`)
    seen.add(entry.raceKey)
    if (isMeasureEntry(entry) && entry.dashboard?.pageKey) {
      if (pageKeys.has(entry.dashboard.pageKey))
        errors.push(`duplicate dashboard.pageKey ${entry.dashboard.pageKey}`)
      pageKeys.add(entry.dashboard.pageKey)
    }
    errors.push(...validateEntry(entry, now))
  }
  return errors
}

export type ApplyOptions = {
  apply: boolean
  creatorUsername?: string
  maxTotalMana?: number
  retryUnconfirmed?: boolean
  quiet?: boolean
  // The API base this run writes to; recorded in (and checked against) state.
  apiBase?: string
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
  /\b(primar(y|ies)|nominee|nomination|margin|by more than|vote share|turnout|percent|%|if |conditional|county|debate|endorse|poll(s|ing)?\b|how many|seats|popular vote|tie|faithless|vice[- ]?president|VP|trifecta|both|and will|sweep|bluer|redder|closest|last called|run(s|ning)? for|candidate for|unanimous|landslide|recession|every|all \d+|all of|all the|swing states?|ticket|socialist|aged?|taller|mog|catholic|female|millennial|first-time|years old|survive|third term|sworn in|runner-up)\b/i
const OFFICE_RE: Record<Office, RegExp> = {
  senate: /\bsenat/i,
  // "governor(s|ship)", not "government".
  governor: /\bgovernor|gubernator/i,
  house: /\bhouse\b|congress|\bdistrict\b|\bcd[- ]?\d|representative/i,
  president: /\bpresiden|\belectoral (college|vote)|\bwhite house\b/i,
}
// Offices that are never one of ours ("Speaker of the House" included): a
// market about them is a different proposition even when an answer names
// one of our candidates. The planned office's own pattern is left out.
const OTHER_OFFICE_PARTS: Record<string, string> = {
  president: '\\bpresiden',
  speaker: '\\bspeaker\\b',
  leader: '\\b(majority|minority) leader',
  mayor: '\\bmayor\\b',
  secretary: '\\bsecretary\\b',
  ag: '\\battorney general\\b',
  cabinet: '\\bcabinet\\b',
  scotus: '\\bsupreme court\\b',
}
const otherOfficeRe = (office: Office) =>
  new RegExp(
    Object.entries(OTHER_OFFICE_PARTS)
      .filter(([k]) => k !== office)
      .map(([, re]) => re)
      .join('|'),
    'i'
  )
// A presidential market must be about winning the election (or the state's
// electors); anything else about the presidency is a different proposition.
const WIN_RE =
  /\bwins?\b|\bwinning\b|\bwon\b|\bwinners?\b|\belect(ed)?\b|\bcarr(y|ies)\b|\bbe (the )?(next )?president\b|\bflip\b|\bhold\b/i
// Two questions in one market ("A? / B?", "A && B") never equal one race.
const COMBINED_RE = /\/\/| \/ |&&|\|\|/
// Elector-district wording ("ME-2", "Nebraska's 2nd district"): a statewide
// presidential entry must not treat a district market as equivalent.
const ELECTOR_DISTRICT_RE =
  /\b(ME|NE)[- ]?0?[1-3]\b|\b(1st|2nd|3rd|first|second|third) (congressional )?district\b/i

function mentionsDistrict(text: string, id: RaceIdentity) {
  if (id.district === undefined) return true
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

// ---------------------------------------------------------------------------
// Equivalence of an existing market to a planned ballot measure
// ---------------------------------------------------------------------------

export const US_STATE_NAMES: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
}

// States named in a text, longest names first so "West Virginia" is not also
// read as "Virginia". Postal codes count only next to a measure label
// ("CA Prop 50", "NV Q6").
export function statesNamedIn(text: string) {
  const found = new Set<string>()
  let t = ` ${text} `
  for (const [code, name] of Object.entries(US_STATE_NAMES).sort(
    (a, b) => b[1].length - a[1].length
  )) {
    // Possessives with or without the apostrophe ("Nebraskas 2nd").
    const re = new RegExp(`\\b${name}(?:['’]?s)?\\b`, 'gi')
    if (re.test(t)) {
      found.add(code)
      t = t.replace(re, ' ')
    }
  }
  if (/\bD\.?C\.?\b|\bDistrict of Columbia\b/i.test(text)) found.add('DC')
  for (const m of text.matchAll(
    /\b([A-Z]{2})\s*(?:Prop(?:osition)?|Q(?:uestion)?|Amendment|Issue|Measure|SQ)\b/g
  ))
    if (US_STATE_NAMES[m[1]]) found.add(m[1])
  return found
}

const MEASURE_ID_RES: [RegExp, MeasureDesignationKind][] = [
  [/\bprop(?:osition)?\.?\s*#?\s*([0-9]{1,3}|[A-Z]{1,2})\b/gi, 'prop'],
  [/\bquestion\s*(?:no\.?)?\s*#?\s*([0-9]{1,2})\b/gi, 'question'],
  [/\bQ\s?([0-9]{1,2})\b/g, 'question'],
  [/\bamendment\s*(?:no\.?)?\s*#?\s*([0-9]{1,3}|[A-Z])\b/gi, 'amendment'],
  [/\bissue\s*#?\s*([0-9]{1,2})\b/gi, 'issue'],
  [/\b(?:ballot\s+)?measure\s*(?:no\.?)?\s*#?\s*([0-9]{1,4})\b/gi, 'measure'],
  [/\b(?:SQ|state question)\s*#?\s*([0-9]{3})\b/gi, 'sq'],
  [/\bCI-?\s?([0-9]{2,3})\b/gi, 'ci'],
  [/\b(?<![A-Z])I-\s?([0-9]{2,4})\b/g, 'i'],
  [
    /\binitiative\s*(?:measure)?\s*(?:no\.?)?\s*#?\s*([0-9]{1,4})\b/gi,
    'initiative',
  ],
  [/\bIL26-?([0-9]{3})\b/gi, 'il26'],
  [/\bHJR\s*([0-9]{1,3})\b/gi, 'hjr'],
  [/\bproposal\s*#?\s*([0-9]{1,2})\b/gi, 'proposal'],
  [/\breferendum\s*([A-Z0-9]{1,3})\b/g, 'referendum'],
]
export function measureIdsIn(text: string) {
  const out = new Set<string>()
  for (const [re, kind] of MEASURE_ID_RES)
    for (const m of text.matchAll(re))
      out.add(`${kind}:${m[1].toUpperCase().replace(/^0+(?=\d)/, '')}`)
  return out
}
const designationKey = (d: MeasureIdentity['designation']) =>
  d ? `${d.kind}:${d.value.toUpperCase().replace(/^0+(?=\d)/, '')}` : null

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
function aliasHit(text: string, aliases: string[]) {
  return aliases.find(
    (a) =>
      a.trim().length >= 4 &&
      new RegExp(
        `(^|[^A-Za-z0-9])${escapeRe(a.trim())}($|[^A-Za-z0-9])`,
        'i'
      ).test(text)
  )
}

const APPROVAL_RE =
  /\b(pass(es|ed)?|approv\w*|adopt\w*|ratif\w*|enact\w*|vote[sd]? yes|yes vote|succeed\w*)\b/i
const OPPOSITE_RE =
  /\b(fail(s|ed)?|be rejected|reject(ed|s)?|defeat(ed)?|voted? down|not pass)\b/i
const QUALIFY_RE =
  /\b(qualif\w*|make (it )?(on(to)? )?the ballot|appear on the ballot|be on the ballot|signatures?|certif(y|ied) (for|to) the ballot)\b/i
const ON_BALLOT_CONDITION_RE =
  /\bif (it|they)('s| is| are) on the ballot\b|\bif (it|they) (qualif\w*|make[s]? the ballot)\b/i
const DERIVATIVE_RE =
  /\b(if|conditional|given that|assuming|margin|by more than|by at least|vote share|percent|turnout|how many|both|all of|any of|court|struck|lawsuit|injunction|unconstitutional|take effect|implement\w*|go into effect|enforce\w*)\b|%/i
const REPEAL_RE = /\b(repeal\w*|overturn\w*|strike down|veto\w*)\b/i

export function classifyExistingMeasureMarket(
  entry: MeasureManifestEntry,
  m: MarketLike
): { verdict: Verdict; reason: string; answerId?: string } {
  const id = entry.measure
  if (m.isResolved || m.resolution)
    return { verdict: 'unrelated', reason: 'already resolved' }
  if (entry.reviewedRejectedContractIds?.includes(m.id))
    return {
      verdict: 'unrelated',
      reason: 'reviewed and rejected in the audit',
    }
  const year = (t: string) => {
    const years: string[] = t.match(/\b20\d\d\b/g) ?? []
    return years.length === 0
      ? 'none'
      : years.includes('2026')
      ? '2026'
      : 'other'
  }
  const key = designationKey(id.designation)
  const identify = (t: string) =>
    (key && measureIdsIn(t).has(key) ? id.designation!.label : undefined) ??
    aliasHit(t, id.aliases)
  // One textual unit (a binary's question, or a portfolio answer read with its
  // question as context) against the planned measure.
  const judge = (
    unit: string,
    context: string
  ): { verdict: Verdict; reason: string } => {
    const both = `${context} ${unit}`
    const hit = identify(unit)
    if (!hit)
      return { verdict: 'unrelated', reason: 'does not name this measure' }
    const states = statesNamedIn(both)
    if (states.size && !states.has(id.state))
      return { verdict: 'unrelated', reason: 'a different state' }
    if (year(both) === 'other')
      return { verdict: 'unrelated', reason: 'a different election year' }
    if (QUALIFY_RE.test(both) && !APPROVAL_RE.test(both))
      return {
        verdict: 'unrelated',
        reason: 'qualification only, not approval',
      }
    if (!states.size && !aliasHit(unit, id.aliases))
      return {
        verdict: 'ambiguous',
        reason: `names ${hit} but no state`,
      }
    if (OPPOSITE_RE.test(both))
      return {
        verdict: 'ambiguous',
        reason: 'opposite wording (YES would mean rejection); not equivalent',
      }
    if (REPEAL_RE.test(both) && !REPEAL_RE.test(id.officialTitle))
      return {
        verdict: 'ambiguous',
        reason: 'repeal/overturn wording; YES orientation unclear',
      }
    const onBallotOnly = ON_BALLOT_CONDITION_RE.test(both)
    const withoutPlacement = both.replace(
      new RegExp(ON_BALLOT_CONDITION_RE.source, 'gi'),
      ''
    )
    if (DERIVATIVE_RE.test(withoutPlacement))
      return {
        verdict: 'ambiguous',
        reason:
          'conditional, combined, margin, court or implementation wording',
      }
    if (!APPROVAL_RE.test(both))
      return {
        verdict: 'ambiguous',
        reason: 'names the measure; approval unclear',
      }
    return {
      verdict: 'equivalent',
      reason: `approval of ${hit}${
        onBallotOnly ? ' (conditional only on ballot placement)' : ''
      }`,
    }
  }
  const answers = m.answers ?? []
  if (m.outcomeType === 'BINARY' || answers.length === 0)
    return judge(m.question, m.question)
  // Multi-answer: judge each open answer on its own (portfolios are
  // independent answers; never treat the market as one proposition).
  let best: { verdict: Verdict; reason: string; answerId?: string } = {
    verdict: 'unrelated',
    reason: 'no answer names this measure',
  }
  for (const a of answers) {
    if (a.resolution) continue
    if (entry.reviewedRejectedAnswers?.includes(`${m.id}#${a.id}`)) continue
    const v = judge(a.text, m.question)
    if (v.verdict === 'equivalent')
      return { ...v, answerId: a.id, reason: `answer ${a.id}: ${v.reason}` }
    if (v.verdict === 'ambiguous' && best.verdict === 'unrelated')
      best = { ...v, answerId: a.id, reason: `answer ${a.id}: ${v.reason}` }
  }
  if (best.verdict === 'unrelated') {
    const q = judge(m.question, m.question)
    if (q.verdict !== 'unrelated') return q
  }
  return best
}

export function classifyExistingMarket(
  entry: AnyManifestEntry,
  m: MarketLike
): { verdict: Verdict; reason: string; answerId?: string } {
  if (isMeasureEntry(entry)) return classifyExistingMeasureMarket(entry, m)
  const id = entry.identity
  if (m.isResolved || m.resolution)
    return { verdict: 'unrelated', reason: 'already resolved' }
  if (entry.reviewedRejectedContractIds?.includes(m.id))
    return {
      verdict: 'unrelated',
      reason: 'reviewed and rejected in the audit',
    }
  const answerText = (m.answers ?? []).map((a) => a.text).join(' ')
  const text = `${m.question} ${answerText}`
  const cycle = String(id.cycle)
  const national = id.office === 'president' && id.state === 'US'
  // The national market is "present" when no particular state is named.
  const statePresent = national
    ? statesNamedIn(m.question).size === 0
    : id.state === 'DC'
    ? /\bD\.?C\.?\b|\bDistrict of Columbia\b/i.test(text)
    : new RegExp(`\\b${id.stateName}(?:['’]?s)?\\b`, 'i').test(text) ||
      new RegExp(`\\b${id.state}[- ]?(\\d{1,2}|AL)\\b`).test(text)
  // A surname is enough in the question; an answer must carry the full name.
  // Answers are long lists of people (drivers, cabinet picks, Speaker
  // hopefuls), where bare surnames like "Carson" match unrelated markets.
  const names = id.candidateNames.filter((n) => {
    const last = n.trim().split(/\s+/).pop() ?? ''
    if (last.length <= 2) return false
    if (new RegExp(`\\b${last}\\b`, 'i').test(m.question)) return true
    const full = n
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '\\s+')
    return new RegExp(`\\b${full}\\b`, 'i').test(answerText)
  })
  const office = OFFICE_RE[id.office].test(m.question)
  const year =
    new RegExp(`\\b${cycle}\\b`).test(text) ||
    /\bnovember\b|\bgeneral\b|\bmidterm|\bpresidential election/i.test(text)
  const otherYear =
    (m.question.match(/\b20\d\d\b/g) ?? []).some((y) => y !== cycle) &&
    !new RegExp(`\\b${cycle}\\b`).test(m.question)
  if (!statePresent && names.length === 0)
    return {
      verdict: 'unrelated',
      reason: 'different state and no candidate names',
    }
  if (otherYear)
    return { verdict: 'unrelated', reason: 'different election year' }
  // A question that never names our office but names another one (Speaker,
  // president, mayor…, or a Senate race for a House entry) is a different
  // proposition. "Speaker of the House" does not count as naming the House;
  // "Will Secretary X win the governor race?" still names our office.
  const namesOurOffice = OFFICE_RE[id.office].test(
    m.question.replace(/speaker of the house/gi, ' ')
  )
  if (
    !namesOurOffice &&
    (otherOfficeRe(id.office).test(m.question) ||
      Object.entries(OFFICE_RE).some(
        ([o, re]) => o !== id.office && re.test(m.question)
      ))
  )
    return { verdict: 'unrelated', reason: 'question is about another office' }
  const questionStates = statesNamedIn(m.question)
  if (questionStates.size && !questionStates.has(id.state))
    return { verdict: 'unrelated', reason: 'question names only other states' }
  if (!office && names.length === 0)
    return { verdict: 'unrelated', reason: 'different office' }
  if (id.office === 'president' && !WIN_RE.test(m.question))
    return {
      verdict: 'unrelated',
      reason: 'about the presidency, but not who wins',
    }
  if (EXCLUDE.test(m.question))
    return {
      verdict: office && statePresent ? 'ambiguous' : 'unrelated',
      reason: 'primary/margin/conditional/derivative wording',
    }
  if (
    COMBINED_RE.test(m.question) ||
    (m.question.match(/\?/g) ?? []).length > 1
  )
    return {
      verdict: office && statePresent ? 'ambiguous' : 'unrelated',
      reason: 'combined or multi-part question',
    }
  if (
    id.office === 'president' &&
    id.district === undefined &&
    !national &&
    ELECTOR_DISTRICT_RE.test(m.question)
  )
    return { verdict: 'unrelated', reason: 'an elector-district market' }
  // "Congressional district" names the House office, but a presidential
  // elector-district market is about the presidency, not the House seat.
  if (
    id.office === 'house' &&
    OFFICE_RE.president.test(m.question) &&
    !/\bhouse\b|representative/i.test(m.question)
  )
    return {
      verdict: 'unrelated',
      reason: 'a presidential elector-district market, not the House seat',
    }
  if (id.district !== undefined && !mentionsDistrict(text, id))
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
  if (new Set(m.question.match(/\b20\d\d\b/g) ?? []).size > 1)
    return { verdict: 'ambiguous', reason: 'names more than one year' }
  // Office, state, district and year match. Party-proposition markets are
  // equivalent to a planned party market; anything else needs a reviewer.
  const partyAnswers =
    (m.answers ?? []).length >= 2 &&
    (m.answers ?? []).every((a) =>
      /democrat|republican|other|independent|party|dfl/i.test(a.text)
    )
  const partyBinary =
    m.outcomeType === 'BINARY' &&
    (/will (a|the) (democrat|republican)/i.test(m.question) ||
      (/\b(democrat|republican)/i.test(m.question) &&
        /\bwin|\bflip\b|\bhold\b|\bcarr(y|ies)\b/i.test(m.question)))
  if (entry.proposition === 'ballot-party' && office && statePresent) {
    if (partyAnswers)
      return {
        verdict: 'equivalent',
        reason: 'same office/state/district/year with party outcomes',
      }
    // The 2026 launch accepted a binary party market as equivalent. The
    // generic 2028+ markets are three-way and meant to be a uniform official
    // set, so a binary is held for review instead of blocking creation.
    if (partyBinary)
      return id.cycle === 2026
        ? {
            verdict: 'equivalent',
            reason: 'same office/state/district/year with party outcomes',
          }
        : {
            verdict: 'ambiguous',
            reason: 'binary party market for this race; ours is three-way',
          }
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
  entry: AnyManifestEntry,
  api: Pick<ElectionApi, 'searchMarkets' | 'getMarket'>
) {
  const found = new Map<string, MarketLike>()
  for (const term of entry.searchTerms) {
    for (const m of await api.searchMarkets(term)) found.set(m.id, m)
  }
  const verdicts: (ReturnType<typeof classifyExistingMarket> & {
    m: MarketLike
  })[] = []
  for (const m of found.values()) {
    const first = { m, ...classifyExistingMarket(entry, m) }
    // Search results carry lite answers without resolutions. Re-read (one
    // at a time) any multi-answer hit that might block creation, so a
    // resolved or cancelled answer is judged on the full market. A failed
    // read throws and stops the run; a missing market keeps the verdict.
    if (first.verdict === 'unrelated' || !m.answers?.length) {
      verdicts.push(first)
      continue
    }
    const full = await api.getMarket(m.id)
    verdicts.push(
      full ? { m: full, ...classifyExistingMarket(entry, full) } : first
    )
  }
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

// The API silently drops unknown fields, so an API without answerProbs
// support would open every multi-answer market at an even split. Compare the
// created market's answer probabilities with the seeds (matched by text).
export function seedMismatch(payload: CreatePayload, market: MarketLike) {
  if (!payload.answerProbs?.length || !payload.answers?.length) return undefined
  const byText = new Map(
    (market.answers ?? []).map((a) => [a.text.trim(), a.probability])
  )
  for (let i = 0; i < payload.answers.length; i++) {
    const want = payload.answerProbs[i] / 100
    const got = byText.get(payload.answers[i].trim())
    if (got === undefined || !Number.isFinite(got))
      return `answer "${payload.answers[i]}" has no readable probability`
    if (Math.abs(got - want) > 0.015)
      return `answer "${payload.answers[i]}" opened at ${(got * 100).toFixed(
        1
      )}%, not the seeded ${payload.answerProbs[i]}%`
  }
  return undefined
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
  if (opts.quiet && !api.publishMarket)
    throw new Error('Quiet creation requires a client that can publish markets')
  if (
    !api.setAnswerColor &&
    manifest.entries.some(
      (e) => e.status === 'ready' && plannedAnswerColors(e).length
    )
  )
    throw new Error(
      'Race creation requires a client that can set answer colors'
    )
  if (state.series !== manifest.series)
    throw new Error(
      `State file belongs to series ${state.series}, not ${manifest.series}`
    )
  const me = await api.me()
  if (me.username !== opts.creatorUsername)
    throw new Error(
      `API key belongs to @${me.username}, not @${opts.creatorUsername}`
    )
  if (!Number.isFinite(me.balance))
    throw new Error('could not read the creator balance from /v0/me')
  if (state.apiBase && opts.apiBase && state.apiBase !== opts.apiBase)
    throw new Error(
      `State file was used against ${state.apiBase}, not ${opts.apiBase}; use a separate state file per environment`
    )
  if (state.creatorId && state.creatorId !== me.id)
    throw new Error(
      `State file belongs to creator ${state.creatorId}, not @${me.username} (${me.id})`
    )
  if (!state.apiBase || !state.creatorId) {
    state.apiBase = state.apiBase ?? opts.apiBase
    state.creatorId = me.id
    await persist(state)
  }

  const result: ApplyResult = {
    created: [],
    skippedExisting: [],
    needsReview: [],
    failed: [],
    pending: [],
    spentThisRun: 0,
  }
  // Check all records, including entries since removed/held in the manifest.
  const blockedSeed = Object.values(state.entries).find(
    (entry) => entry.seedReviewRequired
  )
  if (blockedSeed) {
    result.stoppedReason = `${blockedSeed.raceKey} requires seed review: ${blockedSeed.seedReviewRequired}; review before clearing seedReviewRequired in the state file`
    return result
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
  const publishPending = async (raceKey: string) => {
    const record = state.entries[raceKey]
    if (!record.pendingPublication) return true
    try {
      if (!record.contractId || !api.publishMarket)
        throw new Error('missing contract ID or publication client')
      // The public read API omits visibility. The update's success confirms
      // the awaited DB write; repeating the same visibility after a timeout
      // is harmless and doesn't re-run creation notifications or charge mana.
      await api.publishMarket(record.contractId)
      await save(raceKey, { status: 'created', pendingPublication: false })
      return true
    } catch (err) {
      result.stoppedReason = `${raceKey} was created and its cost recorded, but publication is pending: ${
        (err as Error).message
      }; resume with the same state file`
      return false
    }
  }

  const finishCreation = async (entry: AnyManifestEntry) => {
    const record = state.entries[entry.raceKey]
    const colors = plannedAnswerColors(entry)
    try {
      if (colors.length) {
        if (!record.contractId || !api.setAnswerColor)
          throw new Error('missing contract ID or answer-color client')
        const edits = colors.map(({ label, color }) => {
          const answer = record.answers?.find((a) => a.text === label)
          if (!answer) throw new Error(`cannot find answer: ${label}`)
          return { answerId: answer.id, color }
        })
        for (const { answerId, color } of edits) {
          if (record.answerColorsApplied?.[answerId] === color) continue
          await api.setAnswerColor(record.contractId, answerId, color)
          record.answerColorsApplied = {
            ...record.answerColorsApplied,
            [answerId]: color,
          }
          await save(entry.raceKey, {
            status: 'created',
            answerColorsApplied: record.answerColorsApplied,
          })
        }
      }
    } catch (err) {
      result.stoppedReason = `${
        entry.raceKey
      } was created and its cost recorded, but answer colors are pending: ${
        (err as Error).message
      }; resume with the same state file`
      return false
    }
    return publishPending(entry.raceKey)
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
      if (prior.status === 'created') {
        // An older created payload may use different answer labels. Do not
        // rename it or infer which answer to edit from the new manifest.
        const finished =
          prior.payloadHash === hash
            ? await finishCreation(entry)
            : await publishPending(entry.raceKey)
        if (!finished) break
      }
      continue
    }
    // 1) Read-only reconciliation of our reserved id, always first — also for
    // entries that failed earlier, in case the failure hid a real create.
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
      const seedProblem = seedMismatch(entry.payload!, atKey)
      await save(entry.raceKey, {
        status: 'created',
        idempotencyKey: key,
        payloadHash: prior?.payloadHash ?? hash,
        contractId: atKey.id,
        slug: atKey.slug,
        url: atKey.url,
        answers: atKey.answers,
        // `||`, not `??`: a failed entry recorded 0 reserved, but it cost money.
        costMana: prior?.reservedMana || costOf(entry.payload!).total,
        reservedMana: 0,
        seedReviewRequired: seedProblem,
        pendingPublication: prior?.pendingPublication ?? opts.quiet,
        message: 'reconciled read-only: market exists at the reserved id',
      })
      result.created.push(entry.raceKey)
      if (seedProblem) {
        result.stoppedReason = `${entry.raceKey} exists, but ${seedProblem}; review its opening prices before creating more (current prices may have moved)`
        break
      }
      if (!(await finishCreation(entry))) break
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
    if (
      (prior?.status === 'pending-reconciliation' ||
        prior?.status === 'in-flight') &&
      !opts.retryUnconfirmed
    ) {
      result.pending.push(entry.raceKey)
      log(
        `${entry.raceKey}: earlier create is unconfirmed and no market exists at ${key}; rerun with --retry-unconfirmed to re-send (the reserved id still blocks duplicates)`
      )
      result.stoppedReason = `unconfirmed create for ${entry.raceKey}; reconcile before creating more`
      break
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
      ...(v.answerId ? { answerId: v.answerId } : {}),
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
      pendingPublication: !!opts.quiet,
    })
    let createdId: string | undefined
    let ambiguous: string | undefined
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const res = await api.createMarket({
          ...entry.payload!,
          visibility: opts.quiet ? 'unlisted' : entry.payload!.visibility,
          idempotencyKey: key,
        })
        createdId = res?.id || undefined
        // A success without an id is not a failure: reconcile by reserved id.
        if (!createdId) ambiguous = 'create succeeded without returning an id'
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
          // Stop on any rejection: a schema, path or permission problem
          // would otherwise fail every remaining entry the same way.
          result.stoppedReason =
            ae.status === 403 || ae.status === 401
              ? `account/permission error: ${ae.message}`
              : `create rejected for ${entry.raceKey}: ${ae.message}`
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
      const seedProblem = seedMismatch(entry.payload!, market)
      await save(entry.raceKey, {
        status: 'created',
        contractId: market.id,
        slug: market.slug,
        url: market.url,
        answers: market.answers,
        costMana: cost.total,
        reservedMana: 0,
        seedReviewRequired: seedProblem,
        message: ambiguous ? `reconciled after: ${ambiguous}` : undefined,
      })
      result.created.push(entry.raceKey)
      result.spentThisRun += cost.total
      balance -= cost.total
      if (seedProblem) {
        result.stoppedReason = `${entry.raceKey} was created, but ${seedProblem}; stopped before creating more`
        break
      }
      if (!(await finishCreation(entry))) break
      continue
    }
    if (createdId) {
      // Created, but answer ids not readable yet; keep the id, don't re-create.
      const seedProblem = entry.payload!.answerProbs?.length
        ? 'created market could not be read back to verify its starting probabilities'
        : undefined
      await save(entry.raceKey, {
        status: 'created',
        contractId: createdId,
        costMana: cost.total,
        reservedMana: 0,
        seedReviewRequired: seedProblem,
        message: 'created; answer ids not yet read back',
      })
      result.created.push(entry.raceKey)
      result.spentThisRun += cost.total
      balance -= cost.total
      if (seedProblem) {
        result.stoppedReason = `${entry.raceKey}: ${seedProblem}; stopped before creating more`
        break
      }
      if (!(await finishCreation(entry))) break
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
  answers: (m.answers ?? []).map((a: any) => ({
    id: a.id,
    text: a.text,
    resolution: a.resolution,
    probability: typeof a.probability === 'number' ? a.probability : undefined,
  })),
})

// Small pages keep each search query well inside the server's statement
// timeout. The server answers a failed search with HTTP 200 and no rows, so
// fewer, larger queries would make "no duplicates" more likely to be a lie.
export const SEARCH_PAGE_SIZE = 100
const SEARCH_MAX_PAGES = 200

// `allowWrites: false` (every dry run) blocks creation and publication before any
// request is made, and no API key is attached to reads.
export function makeHttpApi(opts: {
  apiBase: string
  apiKey?: string
  allowWrites: boolean
  fetch?: FetchLike
  readTimeoutMs?: number
  createTimeoutMs?: number
  // Minimum spacing between requests. Cloudflare blocks an IP for about two
  // minutes after roughly 500 requests a minute; 250 ms keeps a long online
  // dry run at 240/min at most.
  paceMs?: number
}): ElectionApi {
  const f: FetchLike = opts.fetch ?? (globalThis.fetch as unknown as FetchLike)
  const url = (path: string) => `${opts.apiBase.replace(/\/$/, '')}/${path}`
  let lastRequestAt = 0
  const pace = async () => {
    const wait = (opts.paceMs ?? 0) - (Date.now() - lastRequestAt)
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastRequestAt = Date.now()
  }
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
        await pace()
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
      // The API rejects offset > 1000, so page exhaustively by creation time
      // (sort=newest + beforeTime cursor), as the API itself recommends.
      // includeLiteAnswers: without it every multi-answer hit has no
      // answers, and a portfolio answer naming this race or measure is missed.
      const PAGE = SEARCH_PAGE_SIZE
      const MAX_PAGES = SEARCH_MAX_PAGES
      const found = new Map<string, MarketLike>()
      let before: number | undefined
      for (let page = 0; page < MAX_PAGES; page++) {
        const q = new URLSearchParams({
          term,
          filter: 'all',
          contractType: 'ALL',
          limit: String(PAGE),
          sort: 'newest',
          includeLiteAnswers: 'true',
        })
        if (before !== undefined) q.set('beforeTime', String(before))
        const rows = await read(`v0/search-markets?${q}`)
        if (!Array.isArray(rows))
          throw new Error(
            `Duplicate search for ${term} returned no result list; review before creating`
          )
        const previous = found.size
        for (const row of rows) found.set(row.id, toMarketLike(row))
        if (rows.length < PAGE) return [...found.values()]
        if (found.size === previous)
          throw new Error(
            `Duplicate search did not advance for ${term}; review before creating`
          )
        const oldest = Math.min(...rows.map((r: any) => Number(r.createdTime)))
        if (!Number.isFinite(oldest))
          throw new Error(
            `Duplicate search rows lack createdTime for ${term}; review before creating`
          )
        // +1 ms re-reads rows created in the same millisecond as this page's
        // oldest row, so none is skipped at the boundary (ids de-duplicate).
        before = oldest + 1
      }
      throw new Error(
        `Duplicate search exceeded ${
          PAGE * MAX_PAGES
        } results for ${term}; narrow the term or review before creating`
      )
    },
    me: async () => {
      const u = await read('v0/me', true)
      return { id: u.id, username: u.username, balance: Number(u.balance) }
    },
    publishMarket: async (id) => {
      if (!opts.allowWrites) throw new Error('Refusing to write: dry run')
      if (!opts.apiKey)
        throw new Error('MANIFOLD_API_KEY is required to publish')
      const res = await f(url(`v0/market/${encodeURIComponent(id)}/update`), {
        method: 'POST',
        headers: {
          Authorization: `Key ${opts.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ visibility: 'public' }),
        signal: timeout(opts.createTimeoutMs ?? 60_000),
      })
      if (!res.ok) throw await classify(res, 'publish market')
      const body = await res.json().catch(() => undefined)
      if (body?.success !== true)
        throw new Error('publication response did not confirm success')
    },
    setAnswerColor: async (contractId, answerId, color) => {
      if (!opts.allowWrites) throw new Error('Refusing to write: dry run')
      if (!opts.apiKey)
        throw new Error('MANIFOLD_API_KEY is required to set answer colors')
      const res = await f(url('edit-answer-cpmm'), {
        method: 'POST',
        headers: {
          Authorization: `Key ${opts.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ contractId, answerId, color }),
        signal: timeout(opts.createTimeoutMs ?? 60_000),
      })
      if (!res.ok) throw await classify(res, 'set answer color')
      const body = await res.json().catch(() => undefined)
      if (body?.status !== 'success')
        throw new Error('answer color response did not confirm success')
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
      const m = await res.json().catch(() => undefined)
      // 2xx without a contract id: the market may exist; reconcile, don't fail.
      if (!m?.id)
        throw new ApiError(
          'POST v0/market: success response without a contract id',
          'ambiguous',
          res.status
        )
      return { id: m.id, slug: m.slug, url: m.url }
    },
  }
}

// ---------------------------------------------------------------------------
// Dashboard mapping output
// ---------------------------------------------------------------------------

export type MappingRow = {
  raceKey: string
  list: AnyManifestEntry['dashboard']['list']
  key: string
  slug: string // real slug, or PENDING:<raceKey>
  contractId: string // real id, or PENDING:<raceKey>
  url: string | null
  preferOverPortfolio?: boolean
  proposition: AnyManifestEntry['proposition']
  answers: (AnswerMeta & { answerId: string })[]
  status: EntryState['status'] | 'planned' | 'unresolved'
  // Ballot measures only: what the contract's YES means, for the map.
  measure?: {
    state: string
    designation: string | null
    officialTitle: string
    yesMeaning: string
    // A binary created by this manifest: YES = approved.
    yesOrientation: 'approve'
    answerId: null
    approvalRule: string
    officialSourceUrl: string
  }
}

export function buildDashboardMapping(
  manifest: Manifest,
  state: CreationState
): MappingRow[] {
  return manifest.entries.map((entry) => {
    const s = state.entries[entry.raceKey]
    const pending = `PENDING:${entry.raceKey}`
    const live = s?.status === 'created' && s.contractId
    if (isMeasureEntry(entry))
      return {
        raceKey: entry.raceKey,
        list: entry.dashboard.list,
        key: entry.dashboard.pageKey ?? entry.dashboard.key,
        slug: live && s.slug ? s.slug : pending,
        contractId: live ? s.contractId! : pending,
        url: live ? s.url ?? null : null,
        proposition: entry.proposition,
        answers: [],
        status:
          s?.status ?? (entry.status === 'ready' ? 'planned' : 'unresolved'),
        measure: {
          state: entry.measure.state,
          designation: entry.measure.designation?.label ?? null,
          officialTitle: entry.measure.officialTitle,
          yesMeaning: entry.yesMeaning,
          yesOrientation: 'approve',
          answerId: null,
          approvalRule: entry.measure.approvalRule,
          officialSourceUrl: entry.measure.officialSourceUrl,
        },
      }
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
