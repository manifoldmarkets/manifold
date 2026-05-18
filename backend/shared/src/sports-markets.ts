import { ENV } from 'common/envs/constants'
import { liquidityTiers } from 'common/tier'
import { getUser } from 'shared/utils'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { resolveMarketHelper } from 'shared/resolve-market-helpers'
import { anythingToRichText } from 'shared/tiptap'
import { convertContract } from 'common/supabase/contracts'
import { CPMMMultiContract } from 'common/contract'
import { insert, bulkInsert } from 'shared/supabase/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

export type LiquidityTierValue = (typeof liquidityTiers)[number]

export interface StageLiquidityTiers {
  REGULAR_SEASON?: LiquidityTierValue
  GROUP_STAGE?: LiquidityTierValue
  LEAGUE_PHASE?: LiquidityTierValue
  ROUND_OF_16?: LiquidityTierValue
  QUARTER_FINALS?: LiquidityTierValue
  SEMI_FINALS?: LiquidityTierValue
  THIRD_PLACE?: LiquidityTierValue
  FINAL?: LiquidityTierValue
}

export interface TournamentConfig {
  name: string
  shortLabel: string
  footballDataCode: string
  sportsLeague: string
  startDate: string
  endDate: string
  hasGroupStageDraws: boolean
  /** When true, use team shortName instead of flag+TLA (for club tournaments) */
  useTeamNames?: boolean
  officialGroupSlug: string
  officialGroupName: string
  communityGroupSlug: string
  communityDashboardSlug: string
  additionalGroupIds: { dev: string[]; prod: string[] }
  manifoldSportsUserId: { dev: string; prod: string }
  closeTimeOffsetMs: number
  stageLiquidityTiers: StageLiquidityTiers
}

export interface LiveMatchScore {
  sportsEventId: string
  homeScore: number | null
  awayScore: number | null
  status: 'IN_PLAY' | 'PAUSED' | 'HALF_TIME' | string
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

// ─── Config ──────────────────────────────────────────────────────────────────

const MANIFOLD_SPORTS_USER_ID_PROD = 'NnVY8olowYMYQGr346dfmHXBSpx2' // @ManifoldSports
const MANIFOLD_SPORTS_USER_ID_DEV = 'lu01Fs2BVnTQgFMMpS1qhYst9fs2' // @teststef

export const WORLD_CUP_2026: TournamentConfig = {
  name: 'FIFA World Cup 2026',
  shortLabel: "World Cup '26",
  footballDataCode: 'WC',
  sportsLeague: 'FIFA World Cup',
  startDate: '2026-06-11',
  endDate: '2026-07-19',
  hasGroupStageDraws: true,
  officialGroupSlug: 'ms-official-wc2026',
  officialGroupName: 'MS Official: World Cup 2026',
  communityGroupSlug: 'ms-community-wc2026',
  communityDashboardSlug: 'ms-community-wc2026',
  additionalGroupIds: {
    dev: [],
    prod: [
      '2hGlgVhIyvVaFyQAREPi', // sports_default
      'ypd6vR44ZzJyN9xykx6e', // soccer
    ],
  },
  manifoldSportsUserId: {
    dev: MANIFOLD_SPORTS_USER_ID_DEV,
    prod: MANIFOLD_SPORTS_USER_ID_PROD,
  },
  closeTimeOffsetMs: 2.5 * 60 * 60 * 1000,
  stageLiquidityTiers: {
    GROUP_STAGE: 1_000,
    ROUND_OF_16: 10_000,
    QUARTER_FINALS: 10_000,
    SEMI_FINALS: 10_000,
    THIRD_PLACE: 10_000,
    FINAL: 10_000,
  },
}

// Registry of all configured tournaments, keyed by footballDataCode.
// Add new entries here when adding a new tournament.
export const CHAMPIONS_LEAGUE_2026: TournamentConfig = {
  name: 'UEFA Champions League 2025/26',
  shortLabel: "UCL '26",
  footballDataCode: 'CL',
  sportsLeague: 'UEFA Champions League',
  startDate: '2025-09-16',
  endDate: '2026-05-31',
  hasGroupStageDraws: true,
  useTeamNames: true,
  officialGroupSlug: 'ms-official-cl-2026',
  officialGroupName: 'MS Official: Champions League 2026',
  communityGroupSlug: 'ms-community-cl-2026',
  communityDashboardSlug: 'ms-community-cl-2026',
  additionalGroupIds: {
    dev: [],
    prod: [],
  },
  manifoldSportsUserId: {
    dev: MANIFOLD_SPORTS_USER_ID_DEV,
    prod: MANIFOLD_SPORTS_USER_ID_PROD,
  },
  closeTimeOffsetMs: 2.5 * 60 * 60 * 1000,
  stageLiquidityTiers: {
    GROUP_STAGE: 1_000,
    LEAGUE_PHASE: 1_000,
    ROUND_OF_16: 10_000,
    QUARTER_FINALS: 10_000,
    SEMI_FINALS: 10_000,
    THIRD_PLACE: 10_000,
    FINAL: 10_000,
  },
}

export const PREMIER_LEAGUE_2526: TournamentConfig = {
  name: 'Premier League 2025/26',
  shortLabel: "PL '26",
  footballDataCode: 'PL',
  sportsLeague: 'Premier League',
  startDate: '2025-08-16',
  endDate: '2026-05-24',
  hasGroupStageDraws: true,
  useTeamNames: true,
  officialGroupSlug: 'ms-official-pl-2526',
  officialGroupName: 'MS Official: Premier League 2025/26',
  communityGroupSlug: 'ms-community-pl-2526',
  communityDashboardSlug: 'ms-community-pl-2526',
  additionalGroupIds: { dev: [], prod: [] },
  manifoldSportsUserId: {
    dev: MANIFOLD_SPORTS_USER_ID_DEV,
    prod: MANIFOLD_SPORTS_USER_ID_PROD,
  },
  closeTimeOffsetMs: 2.5 * 60 * 60 * 1000,
  stageLiquidityTiers: {
    REGULAR_SEASON: 1_000,
    FINAL: 10_000,
  },
}

// Dev-only test tournament — only included in TOURNAMENT_CONFIGS when ENV === 'DEV'.
// Mock server (backend/scripts/mock-sports-server.mjs) serves 3 GROUP_STAGE matches as competition code TEST.
export const TEST_TOURNAMENT_2026: TournamentConfig = {
  name: 'Test Tournament [DEV]',
  shortLabel: "Test '26",
  footballDataCode: 'TEST',
  sportsLeague: 'Test Tournament',
  startDate: '2026-05-07',
  endDate: '2026-05-07',
  hasGroupStageDraws: true,
  officialGroupSlug: 'ms-official-test-2026',
  officialGroupName: 'MS Official: Test Tournament 2026',
  communityGroupSlug: 'ms-community-test-2026',
  communityDashboardSlug: 'ms-community-test-2026',
  additionalGroupIds: { dev: [], prod: [] },
  manifoldSportsUserId: {
    dev: MANIFOLD_SPORTS_USER_ID_DEV,
    prod: MANIFOLD_SPORTS_USER_ID_DEV, // dev user for both — test tournament only exists in dev
  },
  closeTimeOffsetMs: 2.5 * 60 * 60 * 1000,
  stageLiquidityTiers: {
    GROUP_STAGE: 1_000,
  },
}

export const TOURNAMENT_CONFIGS: Record<string, TournamentConfig> = {
  WC: WORLD_CUP_2026,
  CL: CHAMPIONS_LEAGUE_2026,
  PL: PREMIER_LEAGUE_2526,
  ...(ENV === 'DEV' ? { TEST: TEST_TOURNAMENT_2026 } : {}),
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

export async function fetchInPlayMatches(
  config: TournamentConfig,
  apiKey: string
): Promise<FDMatch[]> {
  const data = await fdFetch<{ matches: FDMatch[] }>(
    `/v4/competitions/${config.footballDataCode}/matches?status=IN_PLAY`,
    apiKey
  )
  return data.matches ?? []
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
