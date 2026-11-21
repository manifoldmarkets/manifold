import { BDL_LEAGUE_KEYS } from './bdl/leagues'
import { MANIFOLD_SPORTS_USER_IDS } from './sports'
import { providerOf, type SportsProvider } from './sports-provider'

export const SPORTS_GAME_MARKET_TYPES: readonly string[] = [
  'moneyline',
  'spread',
  'total',
  'prop',
  'winner',
  'podium',
  'method',
  'round',
  'distance',
  'top_n',
  'make_cut',
]

const entrantPairLeagues = ['atp', 'wta', 'mma']
const eventLeagues = BDL_LEAGUE_KEYS.filter(
  (league) => league !== 'f1' && !entrantPairLeagues.includes(league)
).join('|')
const id = '[1-9][0-9]{0,15}'
const slug = '[A-Za-z0-9][A-Za-z0-9_-]*'

// Shared with PostgreSQL. These recognize individual event identities, including
// tournament games and esports matches. Season titles and playoff series use
// distinct namespaces. Spell out character classes for both regex engines.
export const SPORTS_GAME_EVENT_PATTERNS = {
  odds: '^odds:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$',
  'football-data': '^fd-' + id + '$',
  bdl:
    '^(' +
    [
      `bdl:(${eventLeagues}):${id}(:${slug})?`,
      `bdl:(${entrantPairLeagues.join('|')}):${id}:${id}-${id}`,
      `bdl-f1:${id}:${id}`,
      'bdl:ncaab-bracket:[0-9]{4}:[0-7]:(0|[1-9][0-9]*)',
    ].join('|') +
    ')$',
} satisfies Record<Exclude<SportsProvider, 'fixture'>, string>

const gamePatterns = Object.entries(SPORTS_GAME_EVENT_PATTERNS).map(
  ([provider, source]) => ({ provider, pattern: new RegExp(source) })
)

export function isOfficialSportsGameMarket(contract: {
  creatorId?: string
  sportsEventId?: string | null
  sportsProvider?: string | null
  sportsFixture?: boolean | null
  sportsMarketType?: string | null
}) {
  const {
    creatorId,
    sportsEventId,
    sportsFixture,
    sportsMarketType,
    sportsProvider,
  } = contract
  if (
    !creatorId ||
    !MANIFOLD_SPORTS_USER_IDS.includes(creatorId) ||
    sportsFixture === true ||
    typeof sportsEventId !== 'string' ||
    (sportsMarketType != null &&
      !SPORTS_GAME_MARKET_TYPES.includes(sportsMarketType))
  )
    return false
  const source = sportsProvider ?? providerOf({ sportsEventId })
  return gamePatterns.some(
    ({ provider, pattern }) =>
      source === provider && pattern.exec(sportsEventId)?.[0] === sportsEventId
  )
}
