import { ENV } from 'common/envs/constants'
import { getUser } from 'shared/utils'
import {
  createSupabaseDirectClient,
  pgp,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { resolveMarketHelper } from 'shared/resolve-market-helpers'
import { anythingToRichText } from 'shared/tiptap'
import { convertAnswer, convertContract } from 'common/supabase/contracts'
import { CPMMMultiContract } from 'common/contract'
import { insert, bulkInsert, bulkInsertQuery } from 'shared/supabase/utils'
import { answerToRow } from 'shared/supabase/answers'
import { generateAntes } from 'shared/create-contract-helpers'
import { runTxnOutsideBetQueue } from 'shared/txn/run-txn'
import { addGroupToContract } from 'shared/update-group-contracts-internal'
import { getNewContract } from 'common/new-contract'
import { getAnte } from 'common/economy'
import { slugify } from 'common/util/slugify'
import { randomString } from 'common/util/random'
import {
  LiquidityTierValue,
  StageLiquidityTiers,
  TournamentConfig,
  TOURNAMENT_CONFIGS,
  WORLD_CUP_2026,
  CHAMPIONS_LEAGUE_2026,
  PREMIER_LEAGUE_2526,
  TEST_TOURNAMENT_2026,
} from 'common/sports'

export type { LiquidityTierValue, StageLiquidityTiers, TournamentConfig }
export {
  TOURNAMENT_CONFIGS,
  WORLD_CUP_2026,
  CHAMPIONS_LEAGUE_2026,
  PREMIER_LEAGUE_2526,
  TEST_TOURNAMENT_2026,
}

// football-data.org v4 match shape (subset used here)
export interface FDMatch {
  id: number
  utcDate: string
  status:
    | 'SCHEDULED'
    | 'TIMED'
    | 'IN_PLAY'
    | 'PAUSED'
    | 'FINISHED'
    | 'SUSPENDED'
    | 'POSTPONED'
    | 'CANCELLED'
    | 'AWARDED'
  matchday: number | null
  stage: string
  group: string | null
  homeTeam: {
    id: number
    name: string
    shortName: string
    tla: string
    crest: string
    area?: { code: string }
  }
  awayTeam: {
    id: number
    name: string
    shortName: string
    tla: string
    crest: string
    area?: { code: string }
  }
  score: {
    winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null
    duration: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT'
    fullTime: { home: number | null; away: number | null }
    halfTime: { home: number | null; away: number | null }
  }
}

export interface ResolveLogEntry {
  question: string
  result: string
  status: 'resolved' | 'skipped' | 'error'
}

// ─── Group auto-creation ──────────────────────────────────────────────────────

export interface GroupEnsureResult {
  id: string
  created: boolean
  restricted: boolean
}

/**
 * Ensure the official tournament group exists and is curated (admin-restricted).
 * Creates it if missing. Updates privacy_status to 'curated' if it exists but is public.
 * Always runs before any market creation — idempotent.
 */
export async function ensureOfficialGroup(
  config: TournamentConfig,
  creatorId: string,
  pg: SupabaseDirectClient
): Promise<GroupEnsureResult> {
  const slug = config.officialGroupSlug

  const existing = await pg.oneOrNone<{
    id: string
    privacy_status: string
  }>(
    `select id, privacy_status from groups where slug = $1 limit 1`,
    [slug]
  )

  if (existing) {
    let restricted = existing.privacy_status === 'curated'
    if (!restricted) {
      await pg.none(
        `update groups set privacy_status = 'curated' where id = $1`,
        [existing.id]
      )
      restricted = true
    }
    return { id: existing.id, created: false, restricted }
  }

  const group = await insert(pg, 'groups', {
    creator_id: creatorId,
    slug,
    name: config.officialGroupName,
    about: anythingToRichText({ raw: `Official Manifold Sports markets for ${config.name}. Managed by @ManifoldSports.` }),
    total_members: 1,
    privacy_status: 'curated',
  })

  await bulkInsert(pg, 'group_members', [
    { group_id: group.id, member_id: creatorId, role: 'admin' },
  ])

  return { id: group.id, created: true, restricted: true }
}

export interface CommunityAssetsResult {
  groupId: string
  groupCreated: boolean
  dashboardId: string
  dashboardCreated: boolean
}

/**
 * Ensure the community group + dashboard exist for a tournament.
 * Both are curated (admin-restricted for adding). Idempotent.
 * Call this alongside ensureOfficialGroup when batch-creating markets.
 */
export async function ensureCommunityAssets(
  config: TournamentConfig,
  creatorId: string,
  creatorUsername: string,
  creatorName: string,
  creatorAvatarUrl: string,
  pg: SupabaseDirectClient
): Promise<CommunityAssetsResult> {
  // ── Community group ──────────────────────────────────────────────────────────
  const groupSlug = config.communityGroupSlug
  let groupCreated = false

  const existingGroup = await pg.oneOrNone<{ id: string }>(
    `select id from groups where slug = $1 limit 1`,
    [groupSlug]
  )

  let groupId: string
  if (existingGroup) {
    groupId = existingGroup.id
    await pg.none(
      `update groups set privacy_status = 'curated' where id = $1`,
      [groupId]
    )
  } else {
    const group = await insert(pg, 'groups', {
      creator_id: creatorId,
      slug: groupSlug,
      name: `MS Community: ${config.name}`,
      about: anythingToRichText({ raw: `Community markets for ${config.name}. Curated by Manifold admins.` }),
      total_members: 1,
      privacy_status: 'curated',
    })
    await bulkInsert(pg, 'group_members', [
      { group_id: group.id, member_id: creatorId, role: 'admin' },
    ])
    groupId = group.id
    groupCreated = true
  }

  // ── Community dashboard ──────────────────────────────────────────────────────
  const dashSlug = config.communityDashboardSlug
  let dashboardCreated = false

  const existingDash = await pg.oneOrNone<{ id: string }>(
    `select id from dashboards where slug = $1 limit 1`,
    [dashSlug]
  )

  let dashboardId: string
  if (existingDash) {
    dashboardId = existingDash.id
  } else {
    const dash = await pg.one<{ id: string }>(
      `insert into dashboards(slug, creator_id, title, items, creator_username, creator_name, creator_avatar_url)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id`,
      [
        dashSlug,
        creatorId,
        `MS Community: ${config.name}`,
        JSON.stringify([]),
        creatorUsername,
        creatorName,
        creatorAvatarUrl,
      ]
    )
    dashboardId = dash.id
    dashboardCreated = true
  }

  return { groupId, groupCreated, dashboardId, dashboardCreated }
}

// ─── Flag / display helpers ───────────────────────────────────────────────────

// Maps football-data.org area codes / TLAs that differ from ISO 3166-1 alpha-2
const FD_CODE_TO_ISO2: Record<string, string> = {
  // UK nations
  ENG: 'GB', SCO: 'GB', WAL: 'GB', NIR: 'GB',
  // TLA → ISO2 for all 48 WC 2026 teams + common extras
  MEX: 'MX', USA: 'US', CAN: 'CA', BRA: 'BR', ARG: 'AR', FRA: 'FR',
  ESP: 'ES', GER: 'DE', POR: 'PT', NED: 'NL', BEL: 'BE', ITA: 'IT',
  URU: 'UY', COL: 'CO', CHI: 'CL', ECU: 'EC', PER: 'PE', VEN: 'VE',
  PAR: 'PY', BOL: 'BO', JAM: 'JM', PAN: 'PA', CRC: 'CR', HON: 'HN',
  SLV: 'SV', GTM: 'GT', CUB: 'CU', TRI: 'TT', HAI: 'HT',
  MAR: 'MA', SEN: 'SN', NGA: 'NG', CMR: 'CM', CIV: 'CI', GHA: 'GH',
  EGY: 'EG', TUN: 'TN', ALG: 'DZ', MLI: 'ML', RSA: 'ZA', COD: 'CD',
  JPN: 'JP', KOR: 'KR', AUS: 'AU', IRN: 'IR', SAU: 'SA', QAT: 'QA',
  UAE: 'AE', IDN: 'ID', UZB: 'UZ', CHN: 'CN', IND: 'IN', THA: 'TH',
  KSA: 'SA', KUW: 'KW', IRQ: 'IQ', JOR: 'JO', LBN: 'LB', SYR: 'SY',
  CRO: 'HR', SRB: 'RS', SVK: 'SK', SVN: 'SI', HUN: 'HU', ROU: 'RO',
  GRE: 'GR', TUR: 'TR', UKR: 'UA', POL: 'PL', CZE: 'CZ', AUT: 'AT',
  SWE: 'SE', NOR: 'NO', DEN: 'DK', SUI: 'CH', SCT: 'GB', FIN: 'FI',
  BIH: 'BA', MKD: 'MK', ALB: 'AL', ISL: 'IS', IRL: 'IE',
  CPV: 'CV', CUR: 'CW',
}

export function flagEmoji(iso2: string): string {
  if (!iso2 || iso2.length !== 2) return ''
  return [...iso2.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('')
}

export function teamFlagFromArea(areaCode: string): string {
  const iso2 = FD_CODE_TO_ISO2[areaCode] ?? areaCode
  return flagEmoji(iso2)
}

function teamFlag(team: FDMatch['homeTeam']): string {
  return teamFlagFromArea(team.area?.code ?? team.tla ?? '')
}

export function stageLabel(match: FDMatch): string {
  switch (match.stage) {
    case 'REGULAR_SEASON':
      return match.matchday != null ? `MD ${match.matchday}` : 'Regular Season'
    case 'GROUP_STAGE':
      return (match.group ?? 'Group Stage').replace(/^GROUP_/, 'Group ')
    case 'LEAGUE_PHASE':
      return match.matchday != null ? `MD ${match.matchday}` : 'League Phase'
    case 'ROUND_OF_16':
      return 'R16'
    case 'QUARTER_FINALS':
      return 'QF'
    case 'SEMI_FINALS':
      return 'SF'
    case 'THIRD_PLACE':
      return 'Third Place'
    case 'FINAL':
      return 'Final'
    default:
      return match.stage
  }
}

export function stageLiquidityForMatch(
  match: FDMatch,
  config: TournamentConfig,
  overrides?: Partial<StageLiquidityTiers>
): LiquidityTierValue {
  const tiers = { ...config.stageLiquidityTiers, ...overrides }
  return (
    (tiers as Record<string, LiquidityTierValue | undefined>)[match.stage] ??
    tiers.LEAGUE_PHASE ??
    tiers.GROUP_STAGE ??
    1_000
  )
}

export function computeCloseTime(match: FDMatch, config: TournamentConfig): number {
  return new Date(match.utcDate).getTime() + config.closeTimeOffsetMs
}

function isKnockoutStage(stage: string): boolean {
  return ['ROUND_OF_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'THIRD_PLACE', 'FINAL'].includes(stage)
}

function sportsEventId(match: FDMatch): string {
  return `fd-${match.id}`
}

export { sportsEventId as matchSportsEventId }

// ─── Description builder ─────────────────────────────────────────────────────

const RESOLUTION_NOTE =
  'This market resolves automatically after the match concludes based on official results.'

export function buildDescription(
  match: FDMatch,
  config: TournamentConfig,
  opts: { customNote?: string; dashboardUrl?: string } = {}
): string {
  const { homeTeam, awayTeam, utcDate, stage } = match
  const knockout = isKnockoutStage(stage)
  const dateStr = new Date(utcDate).toUTCString().replace(' GMT', ' UTC')
  const stageName = stageLabel(match)

  const matchLine = `**${homeTeam.name} vs ${awayTeam.name} · ${stageName} · Kickoff ${dateStr}**`
  const resolveLine = knockout
    ? `*Resolves to the advancing team*`
    : `*Resolves to the winning team or draw (90 min regulation)*`

  const parts = [matchLine, resolveLine]
  if (opts.customNote?.trim()) {
    const substituted = opts.customNote.trim()
      .replace(/{team1}/g, homeTeam.name)
      .replace(/{team2}/g, awayTeam.name)
      .replace(/{kickoff}/g, dateStr)
      .replace(/{stage}/g, stageName)
      .replace(/{dashboard_url}/g, opts.dashboardUrl ?? '')
    parts.push(substituted)
  }
  parts.push(RESOLUTION_NOTE)
  if (opts.dashboardUrl) {
    let href = opts.dashboardUrl.trim()
    try {
      // Extract just the path so the link works on both localhost and prod
      const u = new URL(
        href.startsWith('/') || href.startsWith('http') ? href : `https://${href}`
      )
      href = u.pathname + u.search + u.hash
    } catch {
      if (!href.startsWith('/')) href = `/${href}`
    }
    parts.push(`[Visit the ${config.name} Dashboard](${href})`)
  }
  parts.push('Created and managed by [@ManifoldSports](https://manifold.markets/ManifoldSports)')

  return parts.join('\n\n\n')
}

// ─── Football-data.org API ────────────────────────────────────────────────────

async function fdFetch<T>(path: string, apiKey: string): Promise<T> {
  // Read at call time so FOOTBALL_DATA_BASE_URL can be set after module load (e.g. test scripts)
  const base = process.env.FOOTBALL_DATA_BASE_URL ?? 'https://api.football-data.org'
  const res = await fetch(`${base}${path}`, {
    headers: { 'X-Auth-Token': apiKey, connection: 'close' },
  })
  if (!res.ok) {
    throw new Error(
      `football-data.org ${path} → ${res.status} ${res.statusText}`
    )
  }
  return res.json() as Promise<T>
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fetchAllCompetitionMatches(
  config: TournamentConfig,
  apiKey: string,
  opts: { dateFrom?: string; dateTo?: string; status?: string } = {}
): Promise<FDMatch[]> {
  let path = `/v4/competitions/${config.footballDataCode}/matches`
  const params: string[] = []
  if (opts.status) params.push(`status=${opts.status}`)
  if (opts.dateFrom) params.push(`dateFrom=${opts.dateFrom}`)
  if (opts.dateTo) params.push(`dateTo=${opts.dateTo}`)
  if (params.length) path += '?' + params.join('&')

  const data = await fdFetch<{ matches: FDMatch[] }>(path, apiKey)
  return data.matches ?? []
}

export async function fetchFinishedMatches(
  config: TournamentConfig,
  apiKey: string
): Promise<FDMatch[]> {
  return fetchAllCompetitionMatches(config, apiKey, { status: 'FINISHED' })
}

export async function fetchSingleMatch(
  matchId: number,
  apiKey: string
): Promise<FDMatch> {
  const data = await fdFetch<{ match: FDMatch }>(`/v4/matches/${matchId}`, apiKey)
  return data.match
}

// ─── Market creation ──────────────────────────────────────────────────────────

export interface MarketCreateParams {
  question: string
  descriptionMarkdown: string
  answers: string[]
  answerShortTexts: string[]
  answerImageUrls: string[]
  closeTime: number
  sportsStartTimestamp: string
  sportsEventId: string
  sportsLeague: string
  groupIds: string[]
  liquidityTier: LiquidityTierValue
}

export function buildMarketParams(
  match: FDMatch,
  config: TournamentConfig,
  officialGroupId: string,
  opts: {
    customNote?: string
    dashboardUrl?: string
    liquidityTierOverrides?: Partial<StageLiquidityTiers>
  } = {}
): MarketCreateParams {
  const home = match.homeTeam
  const away = match.awayTeam
  const knockout = isKnockoutStage(match.stage)
  const stage = stageLabel(match)

  let question: string
  let answers: string[]
  let answerShortTexts: string[]

  if (config.useTeamNames) {
    // Club tournaments (e.g. CL): use shortName, no flag emoji
    const homeName = home.shortName || home.name
    const awayName = away.shortName || away.name
    question = `${homeName} vs ${awayName} [${config.shortLabel}]`
    answers = knockout
      ? [home.name, away.name]
      : [home.name, away.name, 'Draw']
    answerShortTexts = knockout
      ? [homeName, awayName]
      : [homeName, awayName, 'Draw']
  } else {
    // International tournaments (e.g. WC): use flag + TLA
    const homeFlag = teamFlag(home)
    const awayFlag = teamFlag(away)
    question = `${homeFlag}${home.tla} vs ${awayFlag}${away.tla} [${config.shortLabel}]`
    answers = knockout
      ? [`${homeFlag} ${home.name}`, `${awayFlag} ${away.name}`]
      : [`${homeFlag} ${home.name}`, `${awayFlag} ${away.name}`, 'Draw']
    answerShortTexts = knockout
      ? [`${homeFlag}${home.tla}`, `${awayFlag}${away.tla}`]
      : [`${homeFlag}${home.tla}`, `${awayFlag}${away.tla}`, 'Draw']
  }

  const crests = [home.crest, away.crest]
  const answerImageUrls =
    knockout && crests.every((u) => u && u.length > 0) ? crests : []

  const additionalIds =
    ENV === 'DEV' ? config.additionalGroupIds.dev : config.additionalGroupIds.prod

  return {
    question,
    descriptionMarkdown: buildDescription(match, config, opts),
    answers,
    answerShortTexts,
    answerImageUrls,
    closeTime: computeCloseTime(match, config),
    sportsStartTimestamp: match.utcDate,
    sportsEventId: sportsEventId(match),
    sportsLeague: config.sportsLeague,
    groupIds: [officialGroupId, ...additionalIds],
    liquidityTier: stageLiquidityForMatch(match, config, opts.liquidityTierOverrides),
  }
}

// ─── Resolution ───────────────────────────────────────────────────────────────

interface UnresolvedSportsMarket {
  id: string
  sportsEventId: string
  answers: Array<{ id: string; text: string }>
  question: string
}

type SportsContractData = CPMMMultiContract & { sportsEventId?: string }

async function getUnresolvedSportsMarkets(
  pg: SupabaseDirectClient,
  config: TournamentConfig,
  creatorId: string
): Promise<UnresolvedSportsMarket[]> {
  const rows = await pg.manyOrNone<{ data: SportsContractData }>(
    `select data from contracts
     where data->>'sportsLeague' = $1
       and creator_id = $2
       and resolution is null
       and outcome_type = 'MULTIPLE_CHOICE'
       and token = 'MANA'`,
    [config.sportsLeague, creatorId]
  )

  return rows.map((r) => {
    const data = r.data
    return {
      id: data.id,
      sportsEventId: data.sportsEventId ?? '',
      answers: (data.answers ?? []).map((a) => ({ id: a.id, text: a.text })),
      question: data.question,
    }
  })
}

export async function resolveTournamentMarkets(
  config: TournamentConfig,
  apiKey: string,
  opts: { dryRun?: boolean } = {}
): Promise<{
  resolved: number
  skipped: number
  errors: number
  log: ResolveLogEntry[]
}> {
  const { dryRun = false } = opts
  const pg = createSupabaseDirectClient()
  const log: ResolveLogEntry[] = []

  const creatorId =
    ENV === 'DEV'
      ? config.manifoldSportsUserId.dev
      : config.manifoldSportsUserId.prod

  const creatorUser = await getUser(creatorId)
  if (!creatorUser) throw new Error(`ManifoldSports user ${creatorId} not found`)

  const unresolvedMarkets = await getUnresolvedSportsMarkets(pg, config, creatorId)

  if (unresolvedMarkets.length === 0)
    return { resolved: 0, skipped: 0, errors: 0, log }

  await sleep(1000)
  const finishedMatches = await fetchFinishedMatches(config, apiKey)
  const finishedById = new Map(finishedMatches.map((m) => [sportsEventId(m), m]))

  let resolved = 0
  let skipped = 0
  let errors = 0

  for (const market of unresolvedMarkets) {
    const match = finishedById.get(market.sportsEventId)
    if (!match) {
      skipped++
      log.push({ question: market.question, result: 'Match not finished yet', status: 'skipped' })
      continue
    }

    const { winner } = match.score
    if (!winner) {
      skipped++
      log.push({ question: market.question, result: 'No winner recorded', status: 'skipped' })
      continue
    }

    const winningText =
      winner === 'HOME_TEAM'
        ? match.homeTeam.name
        : winner === 'AWAY_TEAM'
        ? match.awayTeam.name
        : 'Draw'

    const winningAnswer = market.answers.find(
      (a) => a.text === winningText || a.text.endsWith(` ${winningText}`)
    )
    if (!winningAnswer) {
      errors++
      log.push({
        question: market.question,
        result: `No answer matching "${winningText}"`,
        status: 'error',
      })
      continue
    }

    if (dryRun) {
      resolved++
      log.push({
        question: market.question,
        result: `Would resolve → ${winningText}`,
        status: 'resolved',
      })
      continue
    }

    try {
      const contractRow = await pg.oneOrNone<{
        data: any
        importance_score: number | null
      }>(`select data, importance_score from contracts where id = $1`, [market.id])

      if (!contractRow) {
        errors++
        log.push({ question: market.question, result: 'Contract not found in DB', status: 'error' })
        continue
      }

      const contract = convertContract(contractRow) as CPMMMultiContract
      await resolveMarketHelper(contract, creatorUser, creatorUser, {
        outcome: winningAnswer.id,
        resolutions: { [winningAnswer.id]: 100 },
      })
      // Store final score in contract data for dashboard display
      const homeScore = match.score.fullTime.home
      const awayScore = match.score.fullTime.away
      if (homeScore !== null && awayScore !== null) {
        await pg.none(
          `update contracts set data = data || $1::jsonb where id = $2`,
          [JSON.stringify({ sportsHomeScore: homeScore, sportsAwayScore: awayScore }), market.id]
        )
      }
      resolved++
      log.push({ question: market.question, result: winningText, status: 'resolved' })
    } catch (e) {
      errors++
      log.push({
        question: market.question,
        result: e instanceof Error ? e.message : String(e),
        status: 'error',
      })
    }
  }

  return { resolved, skipped, errors, log }
}

// ─── Market creation ───────────────────────────────────────────────────────────

export interface CreateLogEntry {
  question: string
  result: string
  status: 'created' | 'skipped' | 'error' | 'dry-run'
}

function isoDateStr(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export async function createTournamentMarkets(
  config: TournamentConfig,
  apiKey: string,
  opts: { daysAhead?: number; dryRun?: boolean; dashboardUrl?: string } = {}
): Promise<{ created: number; skipped: number; errors: number; log: CreateLogEntry[] }> {
  const { daysAhead = 7, dryRun = false, dashboardUrl } = opts
  const pg = createSupabaseDirectClient()
  const log: CreateLogEntry[] = []

  const creatorId =
    ENV === 'DEV'
      ? config.manifoldSportsUserId.dev
      : config.manifoldSportsUserId.prod

  if (creatorId.startsWith('TODO_')) {
    throw new Error(`[sports-create] ${config.footballDataCode}: manifoldSportsUserId not configured`)
  }

  const creatorUser = await getUser(creatorId)
  if (!creatorUser) throw new Error(`ManifoldSports user ${creatorId} not found`)

  const groupResult = await ensureOfficialGroup(config, creatorId, pg)

  const dateFrom = isoDateStr(new Date())
  const dateTo = isoDateStr(new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000))

  await sleep(500)
  const matches = await fetchAllCompetitionMatches(config, apiKey, {
    status: 'SCHEDULED',
    dateFrom,
    dateTo,
  })

  let created = 0
  let skipped = 0
  let errors = 0

  for (const match of matches) {
    const { homeTeam, awayTeam } = match
    const matchLabel = `${homeTeam.name || '?'} vs ${awayTeam.name || '?'}`

    if (!homeTeam.name || !awayTeam.name) {
      skipped++
      log.push({ question: matchLabel, result: 'Teams not yet determined', status: 'skipped' })
      continue
    }

    const eventId = sportsEventId(match)

    const existing = await pg.oneOrNone<{ id: string }>(
      `select id from contracts where data->>'sportsEventId' = $1 and token = 'MANA' limit 1`,
      [eventId]
    )
    if (existing) {
      skipped++
      log.push({ question: matchLabel, result: 'Market already exists', status: 'skipped' })
      continue
    }

    const params = buildMarketParams(match, config, groupResult.id, { dashboardUrl })

    if (dryRun) {
      created++
      log.push({ question: params.question, result: 'Would create', status: 'dry-run' })
      continue
    }

    try {
      const ante = getAnte('MULTIPLE_CHOICE', params.answers.length, params.liquidityTier)
      const proposedSlug = slugify(params.question)
      const slugExists = await pg.oneOrNone<{ id: string }>(
        `select id from contracts where slug = $1 limit 1`,
        [proposedSlug]
      )
      const slug = slugExists ? `${proposedSlug}-${randomString(4)}` : proposedSlug

      const description =
        anythingToRichText({ markdown: params.descriptionMarkdown }) ??
        anythingToRichText({ raw: '' })!

      const contract = getNewContract({
        id: randomString(),
        slug,
        creator: creatorUser,
        question: params.question,
        outcomeType: 'MULTIPLE_CHOICE',
        description,
        initialProb: 50,
        ante,
        closeTime: params.closeTime,
        visibility: 'public',
        isTwitchContract: undefined,
        token: 'MANA',
        takerAPIOrdersDisabled: undefined,
        siblingContractId: undefined,
        coverImageUrl: undefined,
        min: 0,
        max: 0,
        isLogScale: false,
        answers: params.answers,
        addAnswersMode: 'DISABLED',
        shouldAnswersSumToOne: true,
        answerShortTexts: params.answerShortTexts,
        answerImageUrls: params.answerImageUrls.length > 0 ? params.answerImageUrls : undefined,
        sportsStartTimestamp: params.sportsStartTimestamp,
        sportsEventId: params.sportsEventId,
        sportsLeague: params.sportsLeague,
        unit: undefined,
        midpoints: undefined,
        timezone: undefined,
        voterVisibility: undefined,
        pollType: undefined,
        maxSelections: undefined,
      }) as CPMMMultiContract

      const providerId = creatorId

      const { token, ...contractData } = contract as any

      const insertAnswersQuery = bulkInsertQuery(
        'answers',
        contract.answers.map(answerToRow),
        true
      )
      const contractQuery = pgp.as.format(
        `insert into contracts (id, data, token) values ($1, $2::jsonb, $3)`,
        [contract.id, JSON.stringify(contractData), token ?? 'MANA']
      )

      const result = await pg.tx(async (tx) => {
        const rows = await tx.multi(`${contractQuery}; ${insertAnswersQuery};`)
        if (rows[1]?.length > 0) {
          contract.answers = rows[1].map(convertAnswer)
        }
        await runTxnOutsideBetQueue(tx, {
          fromId: providerId,
          fromType: 'USER',
          toId: contract.id,
          toType: 'CONTRACT',
          amount: ante,
          token: 'M$',
          category: 'CREATE_CONTRACT_ANTE',
        })
        await generateAntes(tx, providerId, contract, ante, ante)
        return contract
      })

      await Promise.allSettled(
        params.groupIds.map((gId) =>
          pg.oneOrNone<{ id: string; slug: string }>(
            `select id, slug from groups where id = $1 limit 1`,
            [gId]
          ).then((g) => (g ? addGroupToContract(pg, result, g) : null))
        )
      )

      created++
      log.push({ question: params.question, result: result.id, status: 'created' })
    } catch (e) {
      errors++
      log.push({
        question: params.question ?? matchLabel,
        result: e instanceof Error ? e.message : String(e),
        status: 'error',
      })
    }
  }

  return { created, skipped, errors, log }
}
