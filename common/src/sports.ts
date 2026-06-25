import { ENV } from 'common/envs/constants'
import { liquidityTiers } from 'common/tier'
import { MAX_GROUPS_PER_MARKET } from 'common/group'
import { uniq } from 'lodash'

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
  /** Path portion of the dashboard URL, e.g. '/sports/world-cup-2026' */
  dashboardPath: string
  additionalGroupIds: { dev: string[]; prod: string[] }
  manifoldSportsUserId: { dev: string; prod: string }
  closeTimeOffsetMs: number
  stageLiquidityTiers: StageLiquidityTiers
}

// ─── Resolution helpers ──────────────────────────────────────────────────────

/**
 * Pick the answer that should resolve YES for a finished match.
 *
 * football-data.org reports the winner as 'HOME_TEAM', 'AWAY_TEAM', or 'DRAW'.
 * Our markets carry answers either as bare names ("Brazil", "Draw") in
 * club tournaments (CL/PL, useTeamNames: true) or as flag-prefixed names
 * ("🇧🇷 Brazil", "Draw") in international tournaments (WC). This helper
 * resolves the winner to the correct answer id by matching the team name
 * either exactly or as a trailing suffix after a space.
 *
 * Returns null when:
 * - the match has no winner recorded (drawn knockout, abandoned, awarded), or
 * - no answer text matches the winning team (data anomaly worth alerting on).
 */
export function pickSportsWinningAnswer(
  match: {
    homeTeamName: string
    awayTeamName: string
    winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null | undefined
  },
  answers: ReadonlyArray<{ id: string; text: string }>
): { id: string; text: string } | null {
  if (!match.winner) return null
  const winningText =
    match.winner === 'HOME_TEAM'
      ? match.homeTeamName
      : match.winner === 'AWAY_TEAM'
      ? match.awayTeamName
      : 'Draw'
  return (
    answers.find(
      (a) => a.text === winningText || a.text.endsWith(` ${winningText}`)
    ) ?? null
  )
}

// ─── API response types ──────────────────────────────────────────────────────

/**
 * Shape returned by the `sports-markets` API endpoint and consumed by the
 * sports dashboard page. Kept in sync between backend (`sports-markets.ts`
 * handler) and frontend (`sports-dashboard-page.tsx`).
 */
export interface SportsMarket {
  id: string
  question: string
  closeTime: number
  sportsStartTimestamp: string | null
  resolution: string | null
  resolvedAnswer: string | null
  resolutionTime: number | null
  sportsHomeScore: number | null
  sportsAwayScore: number | null
  // How the match was decided ('REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT')
  // and the shootout result, so the final score isn't shown contradicting the
  // winner (e.g. a 1–1 fullTime next to the team that advanced on penalties).
  sportsScoreDuration: string | null
  sportsPenHome: number | null
  sportsPenAway: number | null
  // Live-score fields, written by the sports-live poller while a match is in
  // play. sportsLiveStatus is the football-data status (IN_PLAY/PAUSED/…);
  // sportsLiveUpdatedTime lets the client treat stale live data as "not live".
  sportsLiveStatus: string | null
  sportsLiveMinute: string | null
  sportsLiveUpdatedTime: number | null
  volume: number
  // Full URL incl. hostname, consistent with the raw markets API. The frontend
  // builds its own in-app navigation path from creatorUsername + slug (so SPA
  // nav and preview deployments work) rather than navigating to this absolute URL.
  url: string
  creatorUsername: string
  slug: string
  needsAttention: boolean
  answers: Array<{ id: string; text: string; prob: number }>
}

// ─── User IDs ─────────────────────────────────────────────────────────────────

// The market creator is always @ManifoldSports, hardcoded per env — never the
// admin who triggers creation. Any admin can run the create flow on their side;
// the markets are always owned by @ManifoldSports.
const MANIFOLD_SPORTS_USER_ID_PROD = 'NnVY8olowYMYQGr346dfmHXBSpx2' // @ManifoldSports (prod)
const MANIFOLD_SPORTS_USER_ID_DEV = 't3R3HV2QFTRGnJxtxhzdesA4stw1' // @ManifoldSports / sports@manifold.markets (dev)

// ─── Tournament configs ───────────────────────────────────────────────────────

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
  dashboardPath: '/sports/world-cup-2026',
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
  dashboardPath: '/sports/cl-2026',
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
  dashboardPath: '/sports/pl-2526',
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

export const TOURNAMENT_CONFIGS: Record<string, TournamentConfig> = {
  WC: WORLD_CUP_2026,
}

// ─── football-data.org match shape ─────────────────────────────────────────────

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
  // Live elapsed minute during IN_PLAY (football-data provides it on the single-
  // match endpoint; may be absent in the competition list — read defensively).
  minute?: number | string | null
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
    // Present on knockout matches decided beyond 90'. fullTime is the post-ET
    // aggregate; penalties carries the shootout result separately.
    extraTime?: { home: number | null; away: number | null }
    penalties?: { home: number | null; away: number | null }
  }
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
  // ISO 3166-1 alpha-3 / FIFA variants — football-data returns the SAME team
  // under different code schemes across matches (e.g. Uruguay as URU or URY,
  // Curaçao as CUR or CUW), so map both forms to the right flag.
  URY: 'UY', CUW: 'CW', DEU: 'DE', NLD: 'NL', PRT: 'PT', CHE: 'CH',
  HRV: 'HR', DNK: 'DK', DZA: 'DZ', GRC: 'GR', PRY: 'PY', HND: 'HN',
  CHL: 'CL', CRI: 'CR', BGR: 'BG', ZAF: 'ZA', ARE: 'AE', KWT: 'KW',
  TTO: 'TT', HTI: 'HT', NZL: 'NZ', PHL: 'PH',
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

// Reverse of flagEmoji: turns a regional-indicator flag emoji back into its
// lowercase ISO 3166-1 alpha-2 code (e.g. "🇰🇷" → "kr"), or '' if not a flag.
// Lets the UI render a cross-platform flag IMAGE instead of relying on the OS to
// draw the emoji — Windows/Chrome render flag emoji as the bare letters ("KR").
export function flagEmojiToCode(flag: string): string {
  const cps = [...flag].map((c) => c.codePointAt(0) ?? 0)
  if (cps.length !== 2) return ''
  const A = 0x1f1e6
  const Z = 0x1f1ff
  if (cps.some((cp) => cp < A || cp > Z)) return ''
  return cps.map((cp) => String.fromCharCode(cp - A + 97)).join('')
}

// The UK home nations share the GB flag emoji (football-data gives them area
// code GB), so the emoji alone can't tell them apart. They have no usable single
// emoji — the subdivision "tag sequence" emoji renders as a bare black flag on
// Windows/older Android — but flagcdn serves their ISO 3166-2 flag IMAGES. Since
// the team name is always alongside the flag, disambiguate by name for the image
// while leaving the Union Jack emoji as the (recognizable) cross-platform
// fallback.
const SUBDIVISION_FLAG_CODE: Record<string, string> = {
  england: 'gb-eng',
  scotland: 'gb-sct',
  wales: 'gb-wls',
  'northern ireland': 'gb-nir',
}

// Resolve the flagcdn image code for a team, preferring a name-based subdivision
// override (England/Scotland/Wales/N. Ireland) and otherwise falling back to the
// ISO2 code derived from the flag emoji.
export function flagImageCode(emoji?: string, name?: string): string {
  const key = name?.trim().toLowerCase()
  if (key && SUBDIVISION_FLAG_CODE[key]) return SUBDIVISION_FLAG_CODE[key]
  return emoji ? flagEmojiToCode(emoji) : ''
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

// Knockout matches can run up to ~170 min (90' + halftime + 30' ET + ET break +
// ~30' penalties). Use 3.5 h so betting stays open through the final whistle.
const KNOCKOUT_CLOSE_OFFSET_MS = 3.5 * 60 * 60 * 1000

export function computeCloseTime(match: FDMatch, config: TournamentConfig): number {
  const offsetMs = isKnockoutStage(match.stage)
    ? Math.max(config.closeTimeOffsetMs, KNOCKOUT_CLOSE_OFFSET_MS)
    : config.closeTimeOffsetMs
  return new Date(match.utcDate).getTime() + offsetMs
}

function isKnockoutStage(stage: string): boolean {
  return ['ROUND_OF_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'THIRD_PLACE', 'FINAL'].includes(stage)
}

export function sportsEventId(match: FDMatch): string {
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
  parts.push('Created and managed by [@ManifoldSports](/ManifoldSports)')

  return parts.join('\n\n\n')
}

// ─── Market params builder ─────────────────────────────────────────────────────

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
    /** Extra group ids to tag on top of the official + configured groups. */
    extraGroupIds?: string[]
  } = {}
): MarketCreateParams {
  const home = match.homeTeam
  const away = match.awayTeam
  const knockout = isKnockoutStage(match.stage)

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
    // Dedup (extra tags may repeat a configured group, e.g. "soccer") and cap at
    // the per-market topic limit — createMarketHelper rejects >MAX_GROUPS_PER_MARKET.
    // Official + configured groups come first so they survive truncation.
    groupIds: uniq([
      officialGroupId,
      ...additionalIds,
      ...(opts.extraGroupIds ?? []),
    ]).slice(0, MAX_GROUPS_PER_MARKET),
    liquidityTier: stageLiquidityForMatch(match, config, opts.liquidityTierOverrides),
  }
}
