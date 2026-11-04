// Which market fills each slot of the 2028-and-beyond /election page.
//
// Every slot is a market id, so swapping a community market for an official
// @ManifoldPolitics one (once backend/scripts/elections-2028 creates them) is a
// one-line change here. Today most slots hold the deepest community market for
// the question, picked from prod by traders and volume on 2026-11-05; the
// multi-year charts need their history.

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

// The Democrat's chance in a unit with no market (or whose market is
// unreadable): the generic pipeline's Stage A seed for the unit, Phi(lean / 9)
// with lean = its mean 2020/2024 two-party margin minus the national one, in
// an even national environment (`2028-president-ME-02-general` in
// backend/scripts/elections-2028-2036/2028/manifest.json on branch
// elections-2028-2036: 15 / 84 / 1). Only Maine's 2nd district needs one today.
export const UNIT_PRIORS_2028: Record<string, number> = {
  'ME-2': 0.15,
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

// Polling averages that still matter after the midterms.
export const POLLING_PERPS_2028 = [
  'trump-approval-rating',
  'jd-vance-favorability-votehub-avg',
]

// Fixed dates on the road ahead. Election days are set by law (the Tuesday
// after the first Monday in November); the electoral college meets on the
// first Monday after the second Wednesday in December.
export const KEY_DATES = [
  {
    key: '2027',
    label: '2027 elections',
    detail: 'Governors in KY, LA and MS',
    time: Date.UTC(2027, 10, 2, 11),
  },
  {
    key: '2028',
    label: 'Election Day 2028',
    detail: 'President, Senate, House',
    time: Date.UTC(2028, 10, 7, 11),
  },
  {
    key: 'electors',
    label: 'Electors vote',
    detail: 'Electoral college',
    time: Date.UTC(2028, 11, 18, 17),
  },
  {
    key: 'inauguration',
    label: 'Inauguration',
    detail: 'The next president',
    time: Date.UTC(2029, 0, 20, 17),
  },
  {
    key: '2030',
    label: '2030 midterms',
    detail: 'Senate, House, 36 governors',
    time: Date.UTC(2030, 10, 5, 11),
  },
  {
    key: '2032',
    label: '2032 election',
    detail: 'President',
    time: Date.UTC(2032, 10, 2, 11),
  },
] as const
