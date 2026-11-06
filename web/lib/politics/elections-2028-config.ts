// Which market fills each slot of the 2028-and-beyond /election page.
//
// Two layers. The community markets below were the deepest for each question
// on 2026-11-05 (the multi-year charts need their history). The official
// @ManifoldPolitics markets come from public/data/election-markets-2028.json, by key
// (OFFICIAL_SLOTS and friends); each slot switches to its official market on
// its own once that market has at least as many traders (pickSlot in
// official-markets.ts). Nothing here needs editing as markets are created.

export const NATIONAL_2028 = {
  // "Which political party wins the US presidency in 2028?" (Ernie, 256
  // traders; Democratic Party / Republican Party / Other Party).
  party: '8p6sy5snq9',
  // "Who will be elected president in 2028?" (Tetraspace, 2,114 traders,
  // trading since April 2022: the chart's long history).
  president: 'tPLAFk3FPVm3xrBmldfh',
  // "Who will be the Democratic nominee for president in 2028?" (DylanSlagh,
  // 1,910 traders).
  demNominee: 'R6PEvCwbEKdg74kB1lQT',
  // "Who will be the Republican nominee for president in 2028?" (DylanSlagh,
  // 818 traders).
  gopNominee: 'GPZbz96wqZGVhSbNJmRL',
  // Running mates: the Democratic (adamgrushan, 52) and Republican
  // (Breakthrough, 53) VP nominee markets.
  demVp: 'Qn66569Et5',
  gopVp: '91q35jtpyz',
  // "Who will be on the winning U.S. presidential ticket (President + VP) in
  // 2028?" (yeeta, 105; independent answers).
  ticket: 'zpQhgp9LL9',
  // "Which party will win the popular vote in the 2028 Presidential
  // election?" (AmmonLam, 22).
  popularVote: '9pyRSU5A6n',
  // "Which party will control congress after the 2028 elections" (13).
  congress: 'dcN5E02Ocl',
} as const

// The official market for each national slot, by key in
// public/data/election-markets-2028.json. The balance-of-power market replaces the
// community "control of Congress" slot outright once it exists.
export const OFFICIAL_SLOTS = {
  party: '2028-president-US-general',
  demNominee: '2028-dem-nominee',
  gopNominee: '2028-gop-nominee',
  demVp: '2028-dem-vp-nominee',
  gopVp: '2028-gop-vp-nominee',
  popularVote: '2028-popular-vote',
  balanceOfPower: '2028-balance-of-power',
} as const

// @ManifoldPolitics' own "Who will win the 2028 US presidential election?",
// made before the scripts (604 traders on 2026-11-05).
export const OFFICIAL_PRESIDENT_2028 = 't9s0m8tf2v'

// Community markets an official market replaces in the off-year and later
// sections (official key → community id).
export const COMMUNITY_EQUIVALENTS: Record<string, string> = {
  '2027-governor-kentucky': 'lSEy8OEpAP',
  '2027-governor-mississippi': 'lOgOZz5U0p',
  '2027-governor-louisiana': 'SORZzEPORl',
  '2030-balance-of-power': '06GTQ5wGTbIbtEIEfIXh',
  '2032-winner': '2lbO8ztHRtqA7QHDTwsR',
  '2032-dem-nominee': 'IpRZ6zS9hQ',
  '2032-president-US-general': '6qZZpIhzLn',
  // Early-state primaries that already had community markets.
  '2028-gop-iowa': 'EgLsNldtZl',
  '2028-dem-new-hampshire': 'yQQLsZsqNZ',
  '2028-gop-new-hampshire': 'tZptdQEpu8',
  '2028-dem-south-carolina': 'OsZngC899Z',
}

// The later national markets in reading order (official keys).
export const LATER_KEYS = [
  '2030-balance-of-power',
  '2032-winner',
  '2032-president-US-general',
  '2032-dem-nominee',
  '2032-gop-nominee',
  '2032-balance-of-power',
  '2034-balance-of-power',
  '2036-president-US-general',
  '2036-balance-of-power',
]

// When each cycle's race board freezes its columns: the first polls opening
// on Election Day (6am ET).
export const BOARD_FREEZE: Record<number, number> = {
  2028: Date.UTC(2028, 10, 7, 11),
  2030: Date.UTC(2030, 10, 5, 11),
}

// The district-by-district 2026 House market: YES = a Democrat won. Its 68
// competitive seats are the 2026 winners the board knows for "flipped".
export const HOUSE_2026_DISTRICTS_SLUG = 'will-a-democrat-win-these-us-house'

// The three markets drawn as face-ended line charts, in tab order.
export const RACE_CHARTS = [
  {
    key: 'president',
    id: NATIONAL_2028.president,
    title: 'Who will win the White House?',
    tab: 'President',
    colorBy: 'party',
  },
  {
    key: 'demNominee',
    id: NATIONAL_2028.demNominee,
    title: 'Democratic nominee',
    tab: 'Democratic nominee',
    colorBy: 'dem',
  },
  {
    key: 'gopNominee',
    id: NATIONAL_2028.gopNominee,
    title: 'Republican nominee',
    tab: 'Republican nominee',
    colorBy: 'gop',
  },
] as const

export type RaceChartKey = (typeof RACE_CHARTS)[number]['key']

// Candidates drawn per race chart, and listed in its leaderboard.
export const CHART_SERIES = 6
export const LIST_SERIES = 10

// The 2028 presidential map: one "Which party will win the 2028 presidential
// election in <unit>?" market per electoral unit (Jack1, Sept 2026; where he
// made two, the one with more volume). Maine's 2nd district has none yet; it
// reads its prior from UNIT_PRIORS_2028 until one exists.
export const STATE_MARKETS_2028: Record<string, string> = {
  AL: 'pPONIpP0hC',
  AK: 'glczdn2q09',
  AZ: '8p2PP5ZuIy',
  AR: 'qRpSnZqnt8',
  CA: 'dLCgElSShN',
  CO: 'tElnQ0lUUZ',
  CT: 'Z5ntQsN2LI',
  DE: 'Ay0u92zyqg',
  DC: 'OpEnsCIRg5',
  FL: 'NSOgE5EtQU',
  GA: 'ZP59COZzOS',
  HI: '8uOl9NEgzQ',
  ID: 'dpgdNLRRs5',
  IL: 'EuU28RzAqR',
  IN: 'UNRdnQ5ZCh',
  IA: 'hgEgEL5SEu',
  KS: 'tzpS2SNpdg',
  KY: 'd2URcq8Nsz',
  LA: 'PREgpUZdpp',
  ME: 'pOZ5qnZClc',
  'ME-1': 'Atdns09Oqz',
  MD: 'sIyzI9c6IO',
  MA: 'yzUQLLu2p0',
  MI: 'IUtAAARIZZ',
  MN: 'Zy98nNRACn',
  MS: 'AOp2h6CAtq',
  MO: 'I0RhNQPtd6',
  MT: 'sqCtn95u0z',
  NE: 'IglANsO0CS',
  'NE-1': 'ZnPPIg0QRE',
  'NE-2': 'L2gCNl2hZN',
  'NE-3': 'nyUuU9t0Pz',
  NV: 'lpNAnZZtAz',
  NH: '6Ilzq5Lctg',
  NJ: 'Pds8QhlUuR',
  NM: 'Qcu2QpZgQ9',
  NY: 'sNzuhCSgtR',
  NC: 'PISlZNCLR2',
  ND: '8pnz80sS5g',
  OH: 'PRI92CyLy0',
  OK: 'zSStNCPRht',
  OR: 'Zn9hNCQu02',
  PA: 'tdQdZd0Plg',
  RI: 'ulRdlQIZg2',
  SC: 'L2SLRIRl6U',
  SD: 'yLyuzCPpgS',
  TN: '8N6RzusU8C',
  TX: 'yIsQd2Rqcq',
  UT: '0099I2E2EL',
  VT: '0dPRNShgnl',
  VA: 'USzunIZqQd',
  WA: 'c5R68SUuyR',
  WV: '9U5IENILtZ',
  WI: 'UgnOcS2ddg',
  WY: 'yQLnLqP5gu',
}

// The Democrat's chance in a unit whose market is missing, unlisted or
// resolved: the generic pipeline's Stage A seed for that unit (two-party
// share), Phi(lean / 9) with lean = its mean 2020/2024 two-party margin minus
// the national one, in an even national environment (the 2028 manifest on
// branch elections-2028-2036). Maine's 2nd district has no market today, so
// it always reads this; any other unit only falls back to it, and the model
// is skipped (not guessed) for a unit with neither.
export const UNIT_PRIORS_2028: Record<string, number> = {
  AK: 0.065,
  AL: 0.01,
  AR: 0.01,
  AZ: 0.322,
  CA: 0.99,
  CO: 0.891,
  CT: 0.963,
  DC: 0.99,
  DE: 0.959,
  FL: 0.137,
  GA: 0.39,
  HI: 0.99,
  IA: 0.084,
  ID: 0.01,
  IL: 0.921,
  IN: 0.016,
  KS: 0.028,
  KY: 0.01,
  LA: 0.01,
  MA: 0.99,
  MD: 0.99,
  ME: 0.772,
  'ME-1': 0.99,
  'ME-2': 0.152,
  MI: 0.464,
  MN: 0.683,
  MO: 0.019,
  MS: 0.01,
  MT: 0.012,
  NC: 0.335,
  ND: 0.01,
  NE: 0.01,
  'NE-1': 0.063,
  'NE-2': 0.674,
  'NE-3': 0.01,
  NH: 0.657,
  NJ: 0.857,
  NM: 0.784,
  NV: 0.417,
  NY: 0.967,
  OH: 0.106,
  OK: 0.01,
  OR: 0.943,
  PA: 0.421,
  RI: 0.964,
  SC: 0.033,
  SD: 0.01,
  TN: 0.01,
  TX: 0.105,
  UT: 0.01,
  VA: 0.768,
  VT: 0.99,
  WA: 0.977,
  WI: 0.428,
  WV: 0.01,
  WY: 0.01,
}

// How strongly states move together in the model (see ec-model.ts).
export const EC_MODEL_RHO = 0.75

// Elections before 2028, soonest first. Off-year races, the January 2027
// Speaker vote, and the deepest markets on major elections abroad.
export const BEFORE_2028 = {
  us: [
    'WqhLLwO3Oe1Ed358f94b', // Who will win the January 2027 Speaker of the House election?
    'uE05R9lhnZ', // Who will win the 2027 Chicago mayoral election?
    'lSEy8OEpAP', // Which Party will win the 2027 Kentucky Gubernatorial Election?
    'lOgOZz5U0p', // Which party will win the 2027 Mississippi governor election?
    'SORZzEPORl', // Which party will win the 2027 Louisiana governor election?
    's9ZQROyAcg', // Will a US House seat flip from Republican to Democrat in a 2027 special election?
    'NCAZzQ9Cnu', // Will a US House seat flip from Democrat to Republican in a 2027 special election?
  ],
  world: [
    'thlctZn5PU', // Israel election: Who will be the next prime minister?
    'WqdbRcw5wWApd0c6nDye', // Who will win the 2027 French presidential election
    'ZmcUoscCf4evhGoqhK0l', // Will Javier Milei be reelected for a second term as the President of Argentina?
    'xlFgcnvDG58gyCJIHycI', // Who will win the next parliamentary election in Poland?
  ],
}

// The cycles after 2028.
export const AFTER_2028 = {
  2030: [
    '06GTQ5wGTbIbtEIEfIXh', // Which party will control the US senate after the 2030 midterm elections?
  ],
  2032: [
    '2lbO8ztHRtqA7QHDTwsR', // Who will win the 2032 United States presidential election?
    'IpRZ6zS9hQ', // Who will be the 2032 Democratic Nominee?
    '6qZZpIhzLn', // Which political party wins the US presidency in 2032?
  ],
}

// The road to the nominations: early-state contests and who's running.
export const PRIMARY_MARKETS_2028 = [
  'LMOer48txjhMRhCRmnPG', // Who will run for the Democratic presidential nomination in 2028?
  'If2TqruSfvk1EMMwc4qZ', // Who will run for the Republican presidential nomination in 2028?
  'EgLsNldtZl', // Who will win the 2028 Iowa Republican presidential caucuses?
  'yQQLsZsqNZ', // Who will win the 2028 New Hampshire Democratic presidential primary?
  'tZptdQEpu8', // Who will win the 2028 New Hampshire Republican presidential primary?
  'OsZngC899Z', // Who will win the 2028 South Carolina Democratic presidential primary?
]

// Topic for the Trending row and the feed's default view.
export const PRESIDENTIAL_2028_TOPIC_SLUG =
  '2028-us-presidential-election-6tdsp26zly'

// The US elections topics /election stands in for, like /sports for the
// sports topics: /topic/<slug> sends visitors here
// (pages/topic/[topicSlug].tsx) with the market feed set to that topic.
// A cycle's topics also make up its leaderboard (`id`).
export const ELECTION_HUB_TOPICS: {
  slug: string
  id: string
  label: string
  cycle: number
}[] = [
  {
    slug: '2028-us-elections',
    id: 'e5e38ea8-fdbc-4f79-9ab1-c28259c7c0aa',
    label: '2028 elections',
    cycle: 2028,
  },
  {
    slug: PRESIDENTIAL_2028_TOPIC_SLUG,
    id: 'aa5ce4dd-faf2-47a3-85a2-030f9579c65a',
    label: '2028 President',
    cycle: 2028,
  },
  {
    slug: '2028-us-presidential-election',
    id: 'c83fd20c-226d-4b9e-ad21-b116412d4009',
    label: '2028 presidential election',
    cycle: 2028,
  },
  {
    slug: '2028-presidential-primaries',
    id: 'e2388efe-5f86-49df-8856-1aae41119521',
    label: '2028 primaries',
    cycle: 2028,
  },
  {
    slug: '2028-democratic-presidential-primar',
    id: '46b8f3ab-33f6-4bd3-8950-2d2189c8c549',
    label: '2028 Democratic primaries',
    cycle: 2028,
  },
  {
    slug: '2028-us-congressional-elections',
    id: 'd9f0a472-9532-4110-b8fd-30c9d0a02b40',
    label: '2028 Congress',
    cycle: 2028,
  },
  {
    slug: '2027-us-elections',
    id: 'dfc26949-e897-4f2b-97d9-0690fabe150c',
    label: '2027 elections',
    cycle: 2027,
  },
  {
    slug: '2030-us-elections',
    id: '90752af0-0369-420b-ae24-422c1f7345d8',
    label: '2030 elections',
    cycle: 2030,
  },
  {
    slug: '2030-us-congressional-elections',
    id: '5187a143-2c12-458f-baac-96ca258c629c',
    label: '2030 Congress',
    cycle: 2030,
  },
]

// /election for a hub topic, with the feed set to it; undefined for any
// other topic.
export function electionPathForTopic(slug: string): string | undefined {
  return ELECTION_HUB_TOPICS.some((t) => t.slug === slug)
    ? `/election?topic=${encodeURIComponent(slug)}`
    : undefined
}

// The topic the page's Follow button follows: the one every official
// market of the cycle the page leads with is in.
export const hubTopicSlug = (cycle: 2028 | 2030) => `${cycle}-us-elections`

// Leaderboards: profit and market creators across a set of topics (a
// market in several counts once).
export type ElectionLeaderboardConfig = {
  key: string
  title: string
  subtitle: string
  // The first is the fallback for an API that predates `groupIds`, so the
  // one with the most markets.
  topicIds: string[]
}

// The 2026 midterms, at the top of the page until the new Congress has
// settled in.
export const MIDTERMS_2026_LEADERBOARD: ElectionLeaderboardConfig = {
  key: '2026',
  title: 'The 2026 midterms leaderboard',
  subtitle:
    'Who made the most on the 2026 elections, and whose markets drew the most traders.',
  topicIds: [
    '1f785ecd-2cbc-4a04-8c20-0459dc31e4ad', // 2026-us-congressional-elections
    '2e9fc841-389f-4e11-99bb-c26ca54ecac2', // 2026-midterms
    'e7e420ef-b0a8-43c3-8188-33ef0fefa0d7', // 2026-us-election
    '32dcce0c-40c6-4fdd-8850-3b8b4459b5cd', // 2026-ballot-measures
    '6a58fc57-106f-4a97-bf29-c40b4f91f3c6', // 26-midterm-contest
  ],
}
export const MIDTERMS_2026_LEADERBOARD_UNTIL = Date.UTC(2027, 1, 1)

// A cycle's leaderboard: its hub topics, the busiest first.
export function cycleLeaderboard(
  cycle: 2028 | 2030
): ElectionLeaderboardConfig {
  const topics = ELECTION_HUB_TOPICS.filter((t) => t.cycle === cycle)
  const first =
    topics.find((t) => t.slug === PRESIDENTIAL_2028_TOPIC_SLUG) ?? topics[0]
  return {
    key: String(cycle),
    title: `${cycle} leaderboard`,
    subtitle: `The top traders on the ${cycle} races so far, and whose markets drew the most traders.`,
    topicIds: [first, ...topics.filter((t) => t !== first)].map((t) => t.id),
  }
}

// Polling averages that still matter after the midterms.
export const POLLING_PERPS_2028 = [
  'trump-approval-rating',
  'jd-vance-favorability-votehub-avg',
]

// The calendar on the road ahead. Election days are set by law (the Tuesday
// after the first Monday in November); the electoral college meets on the
// first Monday after the second Wednesday in December. Super Tuesday is the
// first Tuesday in March under most of those states' laws. Dates the parties
// haven't set yet (the early contests, the conventions, the debates) show as
// a season and drop off once it's over (`until`), with no day count.
export type TimelineEntry = {
  key: string
  label: string
  detail: string
  // A fixed date (with a day count), or a season shown as text.
  time?: number
  season?: string
  // Where the entry sits in the timeline, and when it drops off.
  sortAt: number
  until: number
  // A section of the page the entry links to.
  href?: string
}

export const TIMELINE: TimelineEntry[] = [
  {
    key: '2027',
    label: '2027 elections',
    detail: 'Governors in KY, LA and MS; legislatures',
    time: Date.UTC(2027, 10, 2, 11),
    sortAt: Date.UTC(2027, 10, 2, 11),
    until: Date.UTC(2027, 10, 3, 11),
    href: '#off-year',
  },
  {
    key: 'early',
    label: 'Early contests',
    detail: 'Iowa, New Hampshire, South Carolina, Nevada',
    season: 'Early 2028',
    sortAt: Date.UTC(2028, 0, 15),
    until: Date.UTC(2028, 2, 1),
    href: '#primaries',
  },
  {
    key: 'super-tuesday',
    label: 'Super Tuesday',
    detail: 'The biggest day of primaries',
    time: Date.UTC(2028, 2, 7, 12),
    sortAt: Date.UTC(2028, 2, 7, 12),
    until: Date.UTC(2028, 2, 8, 12),
    href: '#primaries',
  },
  {
    key: 'last-primaries',
    label: 'Last primaries',
    detail: 'The final states vote',
    season: 'June 2028',
    sortAt: Date.UTC(2028, 5, 15),
    until: Date.UTC(2028, 6, 1),
    href: '#primaries',
  },
  {
    key: 'conventions',
    label: 'Party conventions',
    detail: 'Each party formally nominates',
    season: 'Summer 2028',
    sortAt: Date.UTC(2028, 6, 20),
    until: Date.UTC(2028, 8, 1),
    href: '#race',
  },
  {
    key: 'debates',
    label: 'Debates',
    detail: 'Presidential and vice presidential',
    season: 'Fall 2028',
    sortAt: Date.UTC(2028, 9, 1),
    until: Date.UTC(2028, 10, 1),
  },
  {
    key: '2028',
    label: 'Election Day 2028',
    detail: 'President, Senate, House',
    time: Date.UTC(2028, 10, 7, 11),
    sortAt: Date.UTC(2028, 10, 7, 11),
    until: Date.UTC(2028, 10, 8, 11),
    href: '#board',
  },
  {
    key: 'electors',
    label: 'Electors vote',
    detail: 'Electoral college',
    time: Date.UTC(2028, 11, 18, 17),
    sortAt: Date.UTC(2028, 11, 18, 17),
    until: Date.UTC(2028, 11, 19, 17),
  },
  {
    key: 'inauguration',
    label: 'Inauguration',
    detail: 'The next president',
    time: Date.UTC(2029, 0, 20, 17),
    sortAt: Date.UTC(2029, 0, 20, 17),
    until: Date.UTC(2029, 0, 21, 17),
  },
  {
    key: '2029',
    label: '2029 elections',
    detail: 'Governors in VA and NJ',
    time: Date.UTC(2029, 10, 6, 11),
    sortAt: Date.UTC(2029, 10, 6, 11),
    until: Date.UTC(2029, 10, 7, 11),
    href: '#off-year',
  },
  {
    key: '2030',
    label: '2030 midterms',
    detail: 'Senate, House, 36 governors',
    time: Date.UTC(2030, 10, 5, 11),
    sortAt: Date.UTC(2030, 10, 5, 11),
    until: Date.UTC(2030, 10, 6, 11),
    href: '#midterms-2030',
  },
  {
    key: '2032',
    label: '2032 election',
    detail: 'President',
    time: Date.UTC(2032, 10, 2, 11),
    sortAt: Date.UTC(2032, 10, 2, 11),
    until: Date.UTC(2032, 10, 3, 11),
  },
]

// What the timeline shows: everything not yet over, in order.
export const upcomingTimeline = (now: number) =>
  TIMELINE.filter((e) => e.until > now).sort((a, b) => a.sortAt - b.sortAt)
