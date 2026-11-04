// The @ManifoldPolitics national/headline election markets for 2027–2032:
// nominees, running mates, the popular vote, electoral votes, the tipping
// point, control of Congress, early primary contests, the 2027 off-year races
// and the 2030/2032 cycles. Per-state presidential, Senate-seat, governor and
// House-district markets are NOT here: the generic party-market pipeline on
// branch `elections-2028-2036` covers those.
//
// Pure data + pure helpers (validation, seed resolution, payloads). The CLI is
// create-national-markets.ts; tests are national-markets.test.ts.

import { getAnswerProbsError } from 'common/new-contract'
import { MAX_QUESTION_LENGTH } from 'common/contract'
import { MAX_GROUPS_PER_MARKET } from 'common/group'
import { MAX_ANSWER_LENGTH, MAX_ANSWERS } from 'common/answer'
import { liquidityTiers } from 'common/tier'
import { getAnte } from 'common/economy'
import {
  binaryPartySeeds,
  CandidateSeeds,
  candidateSeeds,
  derivedVpSeeds,
  EV_BUCKETS,
  evBucketSeeds,
  flattenedSeeds,
  MARGIN_BUCKETS,
  marginBucketSeeds,
  normalizeName,
  partyShares,
  reservedIdFor,
  SourceAnswer,
  threePartySeeds,
  twoPartySeeds,
} from './seeds'

export const SERIES = 'us-national-2028-v1'
export const MANIFOLD_POLITICS_ID = 'vuI5upWB8yU00rP7yxj95J2zd952'
export const MANIFOLD_POLITICS_USERNAME = 'ManifoldPolitics'

export type Cycle = 2027 | 2028 | 2030 | 2032
// primary: early-state contests; nomination: conventions/nominees;
// general: decided on (or after) election day; offyear: 2027 races.
export type Phase = 'primary' | 'nomination' | 'general' | 'offyear'

// Election days, the reference for close-time ordering checks.
export const ELECTION_DAYS: Record<Cycle, string> = {
  2027: '2027-11-02',
  2028: '2028-11-07',
  2030: '2030-11-05',
  2032: '2032-11-02',
}

export const DEM = 'Democratic Party'
export const REP = 'Republican Party'
export const THIRD = 'Another party or independent'

// Community markets the seeds are read from (prod ids, read at run time).
export const SOURCES = {
  demNominee2028: 'R6PEvCwbEKdg74kB1lQT', // DylanSlagh, ~1,900 traders
  gopNominee2028: 'GPZbz96wqZGVhSbNJmRL', // DylanSlagh, ~820 traders
  demVp2028: 'Qn66569Et5', // adamgrushan
  gopVp2028: '91q35jtpyz', // Breakthrough
  party2028: '8p6sy5snq9', // Ernie, "Which political party wins the US presidency in 2028?"
  popularVote2028: '9pyRSU5A6n', // AmmonLam
  senateRep2028: 'SUTs1ggYgoddnFyALjjV', // AndrewG binary, YES = Republicans
  senate2030: '06GTQ5wGTbIbtEIEfIXh', // PaperBoy, Republicans/Democrats
  demNominee2032: 'IpRZ6zS9hQ', // DylanSlagh
  winner2032: '2lbO8ztHRtqA7QHDTwsR', // Unown
} as const

export type SeedSpec =
  | { kind: 'static-binary'; pct: number; note: string }
  // Fixed answer order is the entry's `answers`; pcts in the same order.
  | { kind: 'static-fixed'; pcts: number[]; note: string }
  // Listed candidates with "Other" taking the remainder.
  | { kind: 'static-candidates'; seeds: { text: string; pct: number }[]; note: string }
  | { kind: 'source-candidates'; sourceId: string; minProb: number; maxAnswers: number }
  | {
      kind: 'derived-vp'
      demVpSourceId: string
      repVpSourceId: string
      partySourceId: string
      minProb: number
      maxAnswers: number
    }
  | { kind: 'source-binary-party'; sourceId: string; yesParty: typeof DEM | typeof REP }
  | { kind: 'source-two-party'; sourceId: string }
  | { kind: 'source-three-party'; sourceId: string; otherPct: number }
  | { kind: 'ev-buckets'; partySourceId: string; sigma: number }
  | { kind: 'margin-buckets'; popularVoteSourceId: string; sigma: number }
  | { kind: 'flattened-nominee'; nomineeSourceId: string; power: number; maxAnswers: number }

type Base = {
  key: string
  cycle: Cycle
  phase: Phase
  question: string
  description: string // markdown
  topics: string[] // group slugs, resolved to ids at run time
  liquidityTier: 1000 | 10000
  closeTime: string // ISO 8601, UTC
}

export type BinaryEntry = Base & {
  outcome: 'BINARY'
  seed: Extract<SeedSpec, { kind: 'static-binary' }>
}

export type MultiEntry = Base & {
  outcome: 'MULTIPLE_CHOICE'
  // DISABLED: a fixed set of answers (no "Other"); ONLY_CREATOR: candidate
  // lists @ManifoldPolitics curates, with an "Other" answer.
  addAnswersMode: 'DISABLED' | 'ONLY_CREATOR'
  // The fixed answers (DISABLED markets); candidate markets take theirs from
  // the seed.
  answers?: string[]
  seed: Exclude<SeedSpec, { kind: 'static-binary' }>
}

export type Entry = BinaryEntry | MultiEntry

// ---------------------------------------------------------------------------
// Description building blocks
// ---------------------------------------------------------------------------

const HUB =
  'Part of [Manifold Politics](https://manifold.markets/ManifoldPolitics) election coverage: see every race at [manifold.markets/election](https://manifold.markets/election).'
const CURATED =
  'Answers are curated by @ManifoldPolitics, who will add candidates as they emerge (ask in the comments). "Other" covers everyone not listed; a bet on "Other" includes any answer added later.'
const SEEDED =
  "Opening odds were copied from Manifold's most-traded community market on the same question when this market was created."
const DERIVED =
  "Opening odds were derived from Manifold's community markets (see below) when this market was created."
const PRIOR =
  'Opening odds are a rough prior set by Manifold Politics. Trade them to where you think they belong.'

const desc = (...paragraphs: string[]) => paragraphs.join('\n\n')

const TOPICS_2028 = [
  'us-politics',
  'elections',
  '2028-us-presidential-election-6tdsp26zly',
]

const nomineeDescription = (party: 'Democratic' | 'Republican', year: number) =>
  desc(
    `Resolves to the person the ${party} Party formally nominates for President of the United States for the ${year} election: the winner of the presidential roll call at the ${year} ${party} National Convention, or of an equivalent formal nomination vote (for example a virtual roll call). If that nominee later withdraws or is replaced, this still resolves to the person first formally nominated. If the ${party} Party does not nominate anyone for a ${year} presidential election, resolves N/A.`,
    CURATED,
    SEEDED,
    HUB
  )

const vpNomineeDescription = (party: 'Democratic' | 'Republican') =>
  desc(
    `Resolves to the person the ${party} Party formally nominates for Vice President of the United States for the 2028 election (at the 2028 ${party} National Convention or an equivalent formal nomination vote). If that nominee later withdraws or is replaced, this still resolves to the person first formally nominated. If the ${party} Party does not nominate a vice presidential candidate for a 2028 election, resolves N/A.`,
    CURATED,
    SEEDED,
    HUB
  )

type EarlyState = {
  state: 'Iowa' | 'New Hampshire' | 'South Carolina' | 'Nevada'
  contest: 'caucuses' | 'primary' | 'contest'
  slug: string
}
const EARLY_STATES: EarlyState[] = [
  { state: 'Iowa', contest: 'caucuses', slug: 'iowa' },
  { state: 'New Hampshire', contest: 'primary', slug: 'new-hampshire' },
  { state: 'South Carolina', contest: 'primary', slug: 'south-carolina' },
  { state: 'Nevada', contest: 'contest', slug: 'nevada' },
]

const earlyContestDescription = (
  s: EarlyState,
  party: 'Democratic' | 'Republican'
) =>
  desc(
    `Resolves to the candidate who wins the ${s.state} ${party} presidential nominating contest for 2028: the candidate with the most votes in its presidential preference vote, per certified results (or the Associated Press count if results are not certified within a week). If a contest reports no vote totals, the candidate allocated the most national convention delegates from it wins.`,
    `Which contest counts: if the state holds a state-run ${party} presidential primary and the state party also holds a separate caucus, the contest that allocates ${s.state}'s national convention delegates counts. If only a state-run primary is held, it counts even if the national party does not award delegates from it. If "uncommitted", "none of these candidates" or a similar line gets the most votes, resolves to "Other". If no ${party} presidential contest is held in ${s.state} before the party formally chooses its 2028 nominee, resolves N/A.`,
    CURATED,
    'Opening odds were derived from Manifold\'s 2028 nominee market when this market was created, flattened because a single state is less predictable than the nomination.',
    HUB
  )

const controlDescription = (
  chamber: 'Senate' | 'House',
  year: 2028 | 2030 | 2032
) => {
  const congress = { 2028: '121st', 2030: '122nd', 2032: '123rd' }[year]
  const convenes = { 2028: '2029', 2030: '2031', 2032: '2033' }[year]
  const senateTie =
    year === 2030
      ? `If the Senate is split evenly, control goes to the party of the Vice President in office when the ${congress} Congress convenes.`
      : `If the Senate is split evenly, control goes to the party of the Vice President inaugurated on January 20, ${convenes}.`
  return chamber === 'Senate'
    ? desc(
        `Resolves to the party that controls the US Senate after the ${year} elections: the party with a majority of senators when the ${congress} Congress organizes in January ${convenes}, after any runoffs, counting independents with the party they caucus with for organizing the chamber. ${senateTie} Later vacancies, appointments or party switches do not change the resolution.`,
        HUB
      )
    : desc(
        `Resolves to the party with a majority of seats (218 or more) in the US House of Representatives when the ${congress} Congress convenes on January 3, ${convenes}, based on the ${year} election results (members-elect, after any runoffs and recounts), counting independents with the party they caucus with. If no party has a majority, resolves to the party of the Speaker elected at the start of the ${congress} Congress.`,
        HUB
      )
}

// ---------------------------------------------------------------------------
// The manifest
// ---------------------------------------------------------------------------

const AFTER_2028 = '2028-11-08T12:00:00Z'
const NOMINATION_2028 = '2028-09-30T12:00:00Z'
const EARLY_2028 = '2028-06-30T12:00:00Z'

const earlyContest = (
  s: EarlyState,
  party: 'Democratic' | 'Republican'
): MultiEntry => ({
  key: `2028-${party === 'Democratic' ? 'dem' : 'gop'}-${s.slug}`,
  cycle: 2028,
  phase: 'primary',
  outcome: 'MULTIPLE_CHOICE',
  addAnswersMode: 'ONLY_CREATOR',
  question: `Who will win the 2028 ${s.state} ${party} presidential ${s.contest}?`,
  description: earlyContestDescription(s, party),
  topics: [
    'us-politics',
    s.state === 'New Hampshire' ? 'new-hampshire-primary' : 'elections',
    '2028-us-presidential-election-6tdsp26zly',
    '2028-presidential-primaries',
    party === 'Democratic' ? 'democratic-party' : 'republican-party',
  ],
  liquidityTier: 1000,
  closeTime: EARLY_2028,
  seed: {
    kind: 'flattened-nominee',
    nomineeSourceId:
      party === 'Democratic' ? SOURCES.demNominee2028 : SOURCES.gopNominee2028,
    power: 0.8,
    maxAnswers: 12,
  },
})

const partyControl = (
  key: string,
  cycle: 2028 | 2030 | 2032,
  chamber: 'Senate' | 'House',
  closeTime: string,
  seed: MultiEntry['seed'],
  topicExtra: string
): MultiEntry => ({
  key,
  cycle,
  phase: 'general',
  outcome: 'MULTIPLE_CHOICE',
  addAnswersMode: 'DISABLED',
  answers: [DEM, REP],
  question: `Which party will control the US ${chamber} after the ${cycle} election?`,
  description: controlDescription(chamber, cycle),
  topics: [
    'us-politics',
    'elections',
    'us-congress',
    chamber === 'Senate' ? 'us-senate' : 'house-of-representatives',
    topicExtra,
  ],
  liquidityTier: 1000,
  closeTime,
  seed,
})

const governor2027 = (
  state: 'Kentucky' | 'Mississippi' | 'Louisiana',
  closeTime: string,
  pcts: [number, number, number],
  extra: string
): MultiEntry => ({
  key: `2027-governor-${state.toLowerCase()}`,
  cycle: 2027,
  phase: 'offyear',
  outcome: 'MULTIPLE_CHOICE',
  addAnswersMode: 'DISABLED',
  answers: [DEM, REP, THIRD],
  question: `Which party will win the 2027 ${state} governor election?`,
  description: desc(
    `Resolves to the party of the candidate who wins the 2027 ${state} gubernatorial election, per certified results. ${extra} A candidate's party is the party label they carry on the deciding ballot; an independent or minor-party winner resolves to "${THIRD}".`,
    PRIOR,
    HUB
  ),
  topics: [
    'us-politics',
    'elections',
    '2027-us-elections',
    'governor',
    state.toLowerCase(),
  ],
  liquidityTier: 1000,
  closeTime,
  seed: {
    kind: 'static-fixed',
    pcts,
    note: `Static prior (D/R/other) for ${state}; no deep community market to copy.`,
  },
})

export const ENTRIES: Entry[] = [
  // ----------------------------------------------------------------- 2028
  {
    key: '2028-dem-nominee',
    cycle: 2028,
    phase: 'nomination',
    outcome: 'MULTIPLE_CHOICE',
    addAnswersMode: 'ONLY_CREATOR',
    question: 'Who will be the 2028 Democratic presidential nominee?',
    description: nomineeDescription('Democratic', 2028),
    topics: [...TOPICS_2028, '2028-presidential-primaries', 'democratic-party'],
    liquidityTier: 10000,
    closeTime: NOMINATION_2028,
    seed: {
      kind: 'source-candidates',
      sourceId: SOURCES.demNominee2028,
      minProb: 0.01,
      maxAnswers: 20,
    },
  },
  {
    key: '2028-gop-nominee',
    cycle: 2028,
    phase: 'nomination',
    outcome: 'MULTIPLE_CHOICE',
    addAnswersMode: 'ONLY_CREATOR',
    question: 'Who will be the 2028 Republican presidential nominee?',
    description: nomineeDescription('Republican', 2028),
    topics: [...TOPICS_2028, '2028-presidential-primaries', 'republican-party'],
    liquidityTier: 10000,
    closeTime: NOMINATION_2028,
    seed: {
      kind: 'source-candidates',
      sourceId: SOURCES.gopNominee2028,
      minProb: 0.01,
      maxAnswers: 20,
    },
  },
  {
    key: '2028-dem-vp-nominee',
    cycle: 2028,
    phase: 'nomination',
    outcome: 'MULTIPLE_CHOICE',
    addAnswersMode: 'ONLY_CREATOR',
    question: 'Who will be the 2028 Democratic vice presidential nominee?',
    description: vpNomineeDescription('Democratic'),
    topics: [...TOPICS_2028, 'vice-president', 'democratic-party'],
    liquidityTier: 1000,
    closeTime: NOMINATION_2028,
    seed: {
      kind: 'source-candidates',
      sourceId: SOURCES.demVp2028,
      minProb: 0.01,
      maxAnswers: 20,
    },
  },
  {
    key: '2028-gop-vp-nominee',
    cycle: 2028,
    phase: 'nomination',
    outcome: 'MULTIPLE_CHOICE',
    addAnswersMode: 'ONLY_CREATOR',
    question: 'Who will be the 2028 Republican vice presidential nominee?',
    description: vpNomineeDescription('Republican'),
    topics: [...TOPICS_2028, 'vice-president', 'republican-party'],
    liquidityTier: 1000,
    closeTime: NOMINATION_2028,
    seed: {
      kind: 'source-candidates',
      sourceId: SOURCES.gopVp2028,
      minProb: 0.01,
      maxAnswers: 20,
    },
  },
  {
    key: '2028-vp-winner',
    cycle: 2028,
    phase: 'general',
    outcome: 'MULTIPLE_CHOICE',
    addAnswersMode: 'ONLY_CREATOR',
    question: 'Who will be elected vice president of the United States in 2028?',
    description: desc(
      'Resolves to the person elected Vice President of the United States in the November 7, 2028 election: the candidate who receives a majority of electoral votes for Vice President as counted by Congress in January 2029, or the person the Senate chooses if no candidate has a majority. If no 2028 presidential election is held, resolves N/A.',
      CURATED,
      DERIVED,
      "How: each running mate's chance of being nominated (Manifold's Democratic and Republican 2028 VP-nominee markets) times their party's chance of winning the presidency (Manifold's 2028 party market). People under 1% start in \"Other\".",
      HUB
    ),
    topics: [...TOPICS_2028, 'vice-president'],
    liquidityTier: 1000,
    closeTime: AFTER_2028,
    seed: {
      kind: 'derived-vp',
      demVpSourceId: SOURCES.demVp2028,
      repVpSourceId: SOURCES.gopVp2028,
      partySourceId: SOURCES.party2028,
      minProb: 0.01,
      maxAnswers: 24,
    },
  },
  {
    key: '2028-popular-vote',
    cycle: 2028,
    phase: 'general',
    outcome: 'MULTIPLE_CHOICE',
    addAnswersMode: 'DISABLED',
    answers: [DEM, REP, THIRD],
    question:
      'Which party will win the national popular vote in the 2028 presidential election?',
    description: desc(
      `Resolves to the party of the presidential candidate who receives the most votes nationwide (all 50 states plus DC) in the November 7, 2028 general election, per certified results. A candidate's party is the party whose presidential nomination they hold; an independent or minor-party candidate resolves to "${THIRD}".`,
      SEEDED,
      HUB
    ),
    topics: [...TOPICS_2028, 'electoral-college'],
    liquidityTier: 1000,
    closeTime: AFTER_2028,
    seed: {
      kind: 'source-three-party',
      sourceId: SOURCES.popularVote2028,
      otherPct: 1,
    },
  },
  {
    key: '2028-dem-electoral-votes',
    cycle: 2028,
    phase: 'general',
    outcome: 'MULTIPLE_CHOICE',
    addAnswersMode: 'DISABLED',
    answers: EV_BUCKETS.map((b) => b.label),
    question:
      'How many electoral votes will the 2028 Democratic presidential nominee win?',
    description: desc(
      "Resolves to the range containing the number of electoral votes the Democratic Party's 2028 presidential nominee wins, counting the electors pledged to them by each state's certified results (statewide and, in Maine and Nebraska, by congressional district). Faithless electors are ignored. If the Democratic nominee is replaced on the ballot before Election Day, the replacement's electoral votes count.",
      "How the opening odds were set: Democratic electoral votes ~ Normal(μ, 60), with μ placed so that the chance of 270 or more equals the Democratic share of Manifold's 2028 party market; each range opens at no less than 1%.",
      HUB
    ),
    topics: [...TOPICS_2028, 'electoral-college'],
    liquidityTier: 1000,
    closeTime: AFTER_2028,
    seed: { kind: 'ev-buckets', partySourceId: SOURCES.party2028, sigma: 60 },
  },
  {
    key: '2028-popular-vote-margin',
    cycle: 2028,
    phase: 'general',
    outcome: 'MULTIPLE_CHOICE',
    addAnswersMode: 'DISABLED',
    answers: MARGIN_BUCKETS.map((b) => b.label),
    question: 'What will the national popular vote margin be in the 2028 presidential election?',
    description: desc(
      "The margin is the Democratic nominee's share of the total national popular vote minus the Republican nominee's share, in percentage points, from certified results (all 50 states plus DC), computed to two decimals. Ranges: \"R+6 or more\" = −6.00 or lower; \"R+3 to R+6\" = above −6.00, up to −3.00; \"R+0 to R+3\" = above −3.00, below 0; \"D+0 to D+3\" = above 0, below 3.00; \"D+3 to D+6\" = 3.00 up to (not including) 6.00; \"D+6 to D+9\" = 6.00 up to (not including) 9.00; \"D+9 or more\" = 9.00 or higher. A margin exactly on a boundary goes to the range farther from zero; exactly 0.00 resolves 50/50 between \"R+0 to R+3\" and \"D+0 to D+3\".",
      "How the opening odds were set: margin ~ Normal(μ, 4.5 points), with μ placed so that the chance of a Democratic popular-vote win equals the Democratic share of Manifold's community 2028 popular-vote market; each range opens at no less than 1%.",
      HUB
    ),
    topics: [...TOPICS_2028, 'electoral-college'],
    liquidityTier: 1000,
    closeTime: AFTER_2028,
    seed: {
      kind: 'margin-buckets',
      popularVoteSourceId: SOURCES.popularVote2028,
      sigma: 4.5,
    },
  },
  {
    key: '2028-ec-popular-split',
    cycle: 2028,
    phase: 'general',
    outcome: 'BINARY',
    question: 'Will the 2028 popular vote winner lose the Electoral College?',
    description: desc(
      'Resolves YES if the 2028 presidential candidate who receives the most votes nationwide (certified results, all 50 states plus DC) does not win a majority of electoral votes (270 or more) by the electors pledged to them in certified state results: either another candidate reaches 270, or no one does. Resolves NO if the national popular-vote winner wins 270 or more. Faithless electors are ignored.',
      PRIOR,
      HUB
    ),
    topics: [...TOPICS_2028, 'electoral-college'],
    liquidityTier: 1000,
    closeTime: AFTER_2028,
    seed: {
      kind: 'static-binary',
      pct: 10,
      note: 'Prior: 2 of the last 7 elections (2000, 2016) split; most cycles are not close enough to.',
    },
  },
  {
    key: '2028-tipping-point',
    cycle: 2028,
    phase: 'general',
    outcome: 'MULTIPLE_CHOICE',
    addAnswersMode: 'ONLY_CREATOR',
    question: 'Which state will be the tipping point in the 2028 presidential election?',
    description: desc(
      "The tipping-point state is the one that delivers the winner's 270th electoral vote: order every electoral-vote unit (the 50 states, DC, and Maine's and Nebraska's congressional districts, with those two states' statewide results as separate units) by the winning presidential candidate's margin over the runner-up there, in percentage points of all votes cast, from the winner's best unit to worst, and add up the winner's electoral votes in that order. The unit that takes the total to 270 or more is the tipping point. Uses certified results and pledged electors (faithless electors are ignored). A congressional-district unit resolves to its state's answer. If no candidate wins 270 electoral votes, resolves N/A.",
      CURATED,
      PRIOR,
      HUB
    ),
    topics: [...TOPICS_2028, 'electoral-college'],
    liquidityTier: 1000,
    closeTime: AFTER_2028,
    seed: {
      kind: 'static-candidates',
      note: 'Prior from recent tipping points (PA 2016/2020, WI 2016/2020, PA/MI 2024) and the 2028 battleground map.',
      seeds: [
        { text: 'Pennsylvania', pct: 28 },
        { text: 'Michigan', pct: 13 },
        { text: 'Wisconsin', pct: 13 },
        { text: 'North Carolina', pct: 9 },
        { text: 'Georgia', pct: 9 },
        { text: 'Arizona', pct: 7 },
        { text: 'Nevada', pct: 4 },
        { text: 'Minnesota', pct: 3 },
        { text: 'New Hampshire', pct: 2 },
        { text: 'Virginia', pct: 2 },
        { text: 'Texas', pct: 2 },
        { text: 'Florida', pct: 2 },
        { text: 'Ohio', pct: 1 },
      ],
    },
  },
  partyControl(
    '2028-senate-control',
    2028,
    'Senate',
    AFTER_2028,
    {
      kind: 'source-binary-party',
      sourceId: SOURCES.senateRep2028,
      yesParty: REP,
    },
    '2028-us-elections'
  ),
  partyControl(
    '2028-house-control',
    2028,
    'House',
    AFTER_2028,
    {
      kind: 'static-fixed',
      pcts: [60, 40],
      note: 'No community 2028 House-control market with ≥10 traders (checked 2026-11-05; only trifecta markets). Democrats won the House in 2026 and lead the 2028 party market.',
    },
    '2028-us-elections'
  ),
  {
    key: '2028-trifecta',
    cycle: 2028,
    phase: 'general',
    outcome: 'MULTIPLE_CHOICE',
    addAnswersMode: 'DISABLED',
    answers: ['Democratic trifecta', 'Republican trifecta', 'Divided government'],
    question:
      'Who will control the White House, Senate and House after the 2028 election?',
    description: desc(
      'Resolves to "Democratic trifecta" if a Democratic president is inaugurated on January 20, 2029 and Democrats control both the Senate and the House; to "Republican trifecta" if the same holds for Republicans; otherwise to "Divided government", including when the president is neither a Democrat nor a Republican.',
      'Chamber control is defined as in the Manifold Politics 2028 Senate and House control markets: the Senate majority after the 2028 elections and runoffs, counting independents with the party they caucus with, with an evenly split Senate going to the party of the Vice President inaugurated on January 20, 2029; the House majority (218+) of members-elect when the 121st Congress convenes, or the Speaker\'s party if no party has one.',
      PRIOR,
      HUB
    ),
    topics: [...TOPICS_2028, 'us-congress', '2028-us-elections'],
    liquidityTier: 1000,
    closeTime: AFTER_2028,
    seed: {
      kind: 'static-fixed',
      pcts: [40, 22, 38],
      note: 'Prior: P(D president) ≈ 0.67 and P(D Senate) ≈ 0.67 from community markets, strongly correlated; R trifecta needs an R president (~0.32) plus both chambers.',
    },
  },
  {
    key: '2028-dem-contested-convention',
    cycle: 2028,
    phase: 'nomination',
    outcome: 'BINARY',
    question:
      'Will the 2028 Democratic convention need more than one ballot to nominate a president?',
    description: desc(
      'Resolves YES if no candidate wins the Democratic presidential nomination on the first presidential roll-call ballot at the 2028 Democratic National Convention (or the first ballot of an equivalent formal nomination vote, such as a virtual roll call), so that a second ballot is held. Resolves NO if the nominee is chosen on the first ballot or by acclamation. If the Democratic Party does not formally nominate a 2028 presidential candidate, resolves N/A.',
      PRIOR,
      HUB
    ),
    topics: [...TOPICS_2028, '2028-presidential-primaries', 'democratic-party'],
    liquidityTier: 1000,
    closeTime: NOMINATION_2028,
    seed: {
      kind: 'static-binary',
      pct: 6,
      note: 'Prior: no major-party convention has gone past one ballot since 1952; open, crowded field.',
    },
  },
  {
    key: '2028-gop-contested-convention',
    cycle: 2028,
    phase: 'nomination',
    outcome: 'BINARY',
    question:
      'Will the 2028 Republican convention need more than one ballot to nominate a president?',
    description: desc(
      'Resolves YES if no candidate wins the Republican presidential nomination on the first presidential roll-call ballot at the 2028 Republican National Convention (or the first ballot of an equivalent formal nomination vote), so that a second ballot is held. Resolves NO if the nominee is chosen on the first ballot or by acclamation. If the Republican Party does not formally nominate a 2028 presidential candidate, resolves N/A.',
      PRIOR,
      HUB
    ),
    topics: [...TOPICS_2028, '2028-presidential-primaries', 'republican-party'],
    liquidityTier: 1000,
    closeTime: NOMINATION_2028,
    seed: {
      kind: 'static-binary',
      pct: 3,
      note: 'Prior: the last multi-ballot Republican convention was 1948; the field has a clear front-runner.',
    },
  },
  ...EARLY_STATES.flatMap((s) => [
    earlyContest(s, 'Democratic'),
    earlyContest(s, 'Republican'),
  ]),

  // ----------------------------------------------------------------- 2027
  governor2027(
    'Kentucky',
    '2027-11-03T12:00:00Z',
    [24, 75, 1],
    'The general election is on November 2, 2027.'
  ),
  governor2027(
    'Mississippi',
    '2027-11-03T12:00:00Z',
    [17, 82, 1],
    'The general election is on November 2, 2027. Mississippi requires a majority: if no candidate wins one, the runoff decides and this market resolves after it (the close time may be extended).'
  ),
  governor2027(
    'Louisiana',
    '2027-11-21T12:00:00Z',
    [9, 90, 1],
    "This covers the whole 2027 election, whether it is decided in the October primary or the November runoff, under whatever primary system Louisiana uses for governor in 2027."
  ),
  {
    key: '2027-virginia-senate',
    cycle: 2027,
    phase: 'offyear',
    outcome: 'MULTIPLE_CHOICE',
    addAnswersMode: 'DISABLED',
    answers: [DEM, REP],
    question: 'Which party will control the Virginia Senate after the 2027 election?',
    description: desc(
      "Resolves to the party that wins a majority (21 or more) of the 40 Virginia Senate seats in the November 2, 2027 election, per certified results, counting independents with the caucus they join. If the chamber is tied 20–20, resolves to the party of the Lieutenant Governor in office when the Senate convenes in January 2028.",
      PRIOR,
      HUB
    ),
    topics: ['us-politics', 'elections', '2027-us-elections', 'virginia'],
    liquidityTier: 1000,
    closeTime: '2027-11-03T12:00:00Z',
    seed: {
      kind: 'static-fixed',
      pcts: [72, 28],
      note: 'Prior: Democrats hold the chamber and Virginia has trended Democratic in recent statewide races.',
    },
  },
  {
    key: '2027-virginia-house',
    cycle: 2027,
    phase: 'offyear',
    outcome: 'MULTIPLE_CHOICE',
    addAnswersMode: 'DISABLED',
    answers: [DEM, REP],
    question:
      'Which party will control the Virginia House of Delegates after the 2027 election?',
    description: desc(
      'Resolves to the party that wins a majority (51 or more) of the 100 House of Delegates seats in the November 2, 2027 election, per certified results, counting independents with the caucus they join. If the chamber is tied 50–50, resolves to the party of the Speaker elected when the House convenes in January 2028; if the parties instead adopt a power-sharing agreement with co-speakers, resolves 50% to each.',
      PRIOR,
      HUB
    ),
    topics: ['us-politics', 'elections', '2027-us-elections', 'virginia'],
    liquidityTier: 1000,
    closeTime: '2027-11-03T12:00:00Z',
    seed: {
      kind: 'static-fixed',
      pcts: [80, 20],
      note: 'Prior: Democrats expanded their House of Delegates majority in 2025.',
    },
  },

  // ----------------------------------------------------------------- 2030
  partyControl(
    '2030-senate-control',
    2030,
    'Senate',
    '2030-11-06T12:00:00Z',
    { kind: 'source-two-party', sourceId: SOURCES.senate2030 },
    'us-midterm-elections'
  ),
  partyControl(
    '2030-house-control',
    2030,
    'House',
    '2030-11-06T12:00:00Z',
    {
      kind: 'static-fixed',
      pcts: [45, 55],
      note: "Prior: the president's party usually loses House seats at midterms, and Democrats are favored to win the presidency in 2028.",
    },
    'us-midterm-elections'
  ),

  // ----------------------------------------------------------------- 2032
  {
    key: '2032-dem-nominee',
    cycle: 2032,
    phase: 'nomination',
    outcome: 'MULTIPLE_CHOICE',
    addAnswersMode: 'ONLY_CREATOR',
    question: 'Who will be the 2032 Democratic presidential nominee?',
    description: nomineeDescription('Democratic', 2032),
    topics: [
      'us-politics',
      'elections',
      '2032-us-presidential-election',
      'democratic-party',
    ],
    liquidityTier: 1000,
    closeTime: '2032-09-30T12:00:00Z',
    seed: {
      kind: 'source-candidates',
      sourceId: SOURCES.demNominee2032,
      minProb: 0.01,
      maxAnswers: 20,
    },
  },
  {
    key: '2032-gop-nominee',
    cycle: 2032,
    phase: 'nomination',
    outcome: 'MULTIPLE_CHOICE',
    addAnswersMode: 'ONLY_CREATOR',
    question: 'Who will be the 2032 Republican presidential nominee?',
    description: desc(
      nomineeDescription('Republican', 2032).replace(SEEDED, PRIOR)
    ),
    topics: [
      'us-politics',
      'elections',
      '2032-us-presidential-election',
      'republican-party',
    ],
    liquidityTier: 1000,
    closeTime: '2032-09-30T12:00:00Z',
    seed: {
      kind: 'static-candidates',
      note: "Prior: no community market. The 2028 Republican field's leaders (JD Vance 32%, Marco Rubio 19% for 2028) scaled down for an eight-year horizon; a Republican elected in 2028 would likely be renominated. Other ≥ 50%.",
      seeds: [
        { text: 'JD Vance', pct: 15 },
        { text: 'Marco Rubio', pct: 10 },
        { text: 'Ron DeSantis', pct: 5 },
        { text: 'Donald Trump Jr.', pct: 4 },
        { text: 'Tucker Carlson', pct: 3 },
        { text: 'Vivek Ramaswamy', pct: 2 },
        { text: 'Glenn Youngkin', pct: 2 },
        { text: 'Brian Kemp', pct: 2 },
        { text: 'Josh Hawley', pct: 2 },
        { text: 'Ted Cruz', pct: 1 },
        { text: 'Nikki Haley', pct: 1 },
        { text: 'Sarah Huckabee Sanders', pct: 1 },
      ],
    },
  },
  {
    key: '2032-winner',
    cycle: 2032,
    phase: 'general',
    outcome: 'MULTIPLE_CHOICE',
    addAnswersMode: 'ONLY_CREATOR',
    question: 'Who will win the 2032 US presidential election?',
    description: desc(
      'Resolves to the person elected President of the United States in the November 2, 2032 election: the candidate who receives a majority of electoral votes as counted by Congress in January 2033, or the person the House chooses in a contingent election. If no 2032 presidential election is held, resolves N/A.',
      CURATED,
      SEEDED,
      HUB
    ),
    topics: ['us-politics', 'elections', '2032-us-presidential-election'],
    liquidityTier: 1000,
    closeTime: '2032-11-03T12:00:00Z',
    seed: {
      kind: 'source-candidates',
      sourceId: SOURCES.winner2032,
      minProb: 0.01,
      maxAnswers: 20,
    },
  },
  partyControl(
    '2032-senate-control',
    2032,
    'Senate',
    '2032-11-03T12:00:00Z',
    {
      kind: 'static-fixed',
      pcts: [50, 50],
      note: 'Prior: six years out, no informative market.',
    },
    '2032-us-presidential-election'
  ),
  partyControl(
    '2032-house-control',
    2032,
    'House',
    '2032-11-03T12:00:00Z',
    {
      kind: 'static-fixed',
      pcts: [50, 50],
      note: 'Prior: six years out, and the 2030 census will redraw the map.',
    },
    '2032-us-presidential-election'
  ),
]

// ---------------------------------------------------------------------------
// Seed resolution
// ---------------------------------------------------------------------------

export type SourceMarket = {
  id: string
  question: string
  outcomeType: string
  isResolved: boolean
  uniqueBettorCount?: number
  probability?: number // binary
  answers?: SourceAnswer[] // multiple choice
}

export type SourceReader = (id: string) => Promise<SourceMarket | undefined>

export type ResolvedSeed =
  | { outcome: 'BINARY'; initialProb: number; basis: string }
  | {
      outcome: 'MULTIPLE_CHOICE'
      answers: string[]
      answerProbs: number[] // percent, one per listed answer
      otherPct?: number // only when the market gets an "Other" answer
      basis: string
    }

// Source ids a seed needs, for prefetching and reporting.
export function seedSourceIds(seed: SeedSpec): string[] {
  switch (seed.kind) {
    case 'source-candidates':
    case 'source-binary-party':
    case 'source-two-party':
    case 'source-three-party':
      return [seed.sourceId]
    case 'derived-vp':
      return [seed.demVpSourceId, seed.repVpSourceId, seed.partySourceId]
    case 'ev-buckets':
      return [seed.partySourceId]
    case 'margin-buckets':
      return [seed.popularVoteSourceId]
    case 'flattened-nominee':
      return [seed.nomineeSourceId]
    default:
      return []
  }
}

export const needsOnline = (entry: Entry) =>
  seedSourceIds(entry.seed).length > 0

const fromCandidates = (s: CandidateSeeds, basis: string): ResolvedSeed => ({
  outcome: 'MULTIPLE_CHOICE',
  answers: s.seeds.map((x) => x.text),
  answerProbs: s.seeds.map((x) => x.pct),
  otherPct: s.otherPct,
  basis,
})

async function readOpen(
  read: SourceReader,
  id: string,
  kind: 'multi' | 'binary'
): Promise<SourceMarket> {
  const m = await read(id)
  if (!m) throw new Error(`Seed source ${id} not found`)
  if (m.isResolved) throw new Error(`Seed source ${id} is resolved`)
  if (kind === 'multi' && !m.answers?.length)
    throw new Error(`Seed source ${id} has no answers`)
  if (kind === 'binary' && !Number.isFinite(m.probability))
    throw new Error(`Seed source ${id} has no probability`)
  return m
}

const traders = (m: SourceMarket) =>
  m.uniqueBettorCount !== undefined ? `, ${m.uniqueBettorCount} traders` : ''

// Opening odds for an entry. Static seeds need no reader; the rest read
// Manifold's own community markets.
export async function resolveSeed(
  entry: Entry,
  read?: SourceReader
): Promise<ResolvedSeed> {
  const seed = entry.seed
  const need = () => {
    if (!read) throw new Error(`${entry.key}: seed needs --online`)
    return read
  }
  switch (seed.kind) {
    case 'static-binary':
      return { outcome: 'BINARY', initialProb: seed.pct, basis: seed.note }
    case 'static-fixed':
      return {
        outcome: 'MULTIPLE_CHOICE',
        answers: (entry as MultiEntry).answers ?? [],
        answerProbs: seed.pcts,
        basis: seed.note,
      }
    case 'static-candidates': {
      const total = seed.seeds.reduce((s, x) => s + x.pct, 0)
      return {
        outcome: 'MULTIPLE_CHOICE',
        answers: seed.seeds.map((s) => s.text),
        answerProbs: seed.seeds.map((s) => s.pct),
        otherPct: Math.round((100 - total) * 10) / 10,
        basis: seed.note,
      }
    }
    case 'source-candidates': {
      const m = await readOpen(need(), seed.sourceId, 'multi')
      return fromCandidates(
        candidateSeeds(m.answers!, seed),
        `copied from ${seed.sourceId} (${m.question}${traders(m)})`
      )
    }
    case 'derived-vp': {
      const [d, r, p] = await Promise.all([
        readOpen(need(), seed.demVpSourceId, 'multi'),
        readOpen(need(), seed.repVpSourceId, 'multi'),
        readOpen(need(), seed.partySourceId, 'multi'),
      ])
      const party = partyShares(p.answers!)
      return fromCandidates(
        derivedVpSeeds(d.answers!, r.answers!, party, seed),
        `derived: VP nominee markets ${seed.demVpSourceId}/${seed.repVpSourceId} × party ${seed.partySourceId} (D ${(party.dem * 100).toFixed(1)}%, R ${(party.rep * 100).toFixed(1)}%)`
      )
    }
    case 'source-binary-party': {
      const m = await readOpen(need(), seed.sourceId, 'binary')
      const { dem, rep } = binaryPartySeeds(m.probability!, seed.yesParty)
      return {
        outcome: 'MULTIPLE_CHOICE',
        answers: [DEM, REP],
        answerProbs: [dem, rep],
        basis: `from binary ${seed.sourceId} (YES = ${seed.yesParty} at ${(
          m.probability! * 100
        ).toFixed(1)}%${traders(m)})`,
      }
    }
    case 'source-two-party': {
      const m = await readOpen(need(), seed.sourceId, 'multi')
      const { dem, rep } = twoPartySeeds(partyShares(m.answers!))
      return {
        outcome: 'MULTIPLE_CHOICE',
        answers: [DEM, REP],
        answerProbs: [dem, rep],
        basis: `copied from ${seed.sourceId} (${m.question}${traders(m)})`,
      }
    }
    case 'source-three-party': {
      const m = await readOpen(need(), seed.sourceId, 'multi')
      const { dem, rep, other } = threePartySeeds(
        partyShares(m.answers!),
        seed.otherPct
      )
      return {
        outcome: 'MULTIPLE_CHOICE',
        answers: [DEM, REP, THIRD],
        answerProbs: [dem, rep, other],
        basis: `copied from ${seed.sourceId} (${m.question}${traders(m)}), third answer at ${seed.otherPct}%`,
      }
    }
    case 'ev-buckets': {
      const m = await readOpen(need(), seed.partySourceId, 'multi')
      const s = partyShares(m.answers!)
      const pDem = s.dem / (s.dem + s.rep)
      return {
        outcome: 'MULTIPLE_CHOICE',
        answers: EV_BUCKETS.map((b) => b.label),
        answerProbs: evBucketSeeds(pDem, seed.sigma),
        basis: `Normal(σ=${seed.sigma}) with P(≥270) = ${(pDem * 100).toFixed(
          1
        )}% (D share of D+R in ${seed.partySourceId})`,
      }
    }
    case 'margin-buckets': {
      const m = await readOpen(need(), seed.popularVoteSourceId, 'multi')
      const s = partyShares(m.answers!)
      const pDem = s.dem / (s.dem + s.rep)
      return {
        outcome: 'MULTIPLE_CHOICE',
        answers: MARGIN_BUCKETS.map((b) => b.label),
        answerProbs: marginBucketSeeds(pDem, seed.sigma),
        basis: `Normal(σ=${seed.sigma} pts) with P(D>0) = ${(
          pDem * 100
        ).toFixed(1)}% (${seed.popularVoteSourceId})`,
      }
    }
    case 'flattened-nominee': {
      const m = await readOpen(need(), seed.nomineeSourceId, 'multi')
      return fromCandidates(
        flattenedSeeds(m.answers!, seed.power, seed.maxAnswers),
        `nominee market ${seed.nomineeSourceId} flattened (p^${seed.power}, top ${seed.maxAnswers})`
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/
const KEY_RE = /^(2027|2028|2030|2032)-[a-z0-9-]+$/

const hasOther = (entry: Entry) =>
  entry.outcome === 'MULTIPLE_CHOICE' && entry.addAnswersMode !== 'DISABLED'

// Static checks on the manifest (no network). Returns error messages.
export function validateEntries(
  entries: Entry[],
  now: number,
  series = SERIES
): string[] {
  const errors: string[] = []
  const keys = new Set<string>()
  const ids = new Set<string>()
  const questions = new Set<string>()
  const nominationClose: Partial<Record<Cycle, number>> = {}
  for (const e of entries)
    if (e.phase === 'nomination')
      nominationClose[e.cycle] = Math.min(
        nominationClose[e.cycle] ?? Infinity,
        Date.parse(e.closeTime)
      )

  for (const e of entries) {
    const at = (m: string) => errors.push(`${e.key}: ${m}`)
    if (!KEY_RE.test(e.key)) at('bad key')
    if (!e.key.startsWith(`${e.cycle}-`)) at('key must start with the cycle')
    if (keys.has(e.key)) at('duplicate key')
    keys.add(e.key)
    const id = reservedIdFor(series, e.key)
    if (ids.has(id)) at(`reserved id collision ${id}`)
    ids.add(id)

    if (!e.question.trim()) at('empty question')
    if (e.question.length > MAX_QUESTION_LENGTH)
      at(`question is ${e.question.length} chars (max ${MAX_QUESTION_LENGTH})`)
    const nq = normalizeName(e.question)
    if (questions.has(nq)) at('duplicate question')
    questions.add(nq)
    if (!e.description.trim()) at('empty description')
    if (!/resolve/i.test(e.description)) at('description lacks resolution criteria')

    if (e.topics.length === 0) at('no topics')
    if (e.topics.length > MAX_GROUPS_PER_MARKET)
      at(`${e.topics.length} topics (max ${MAX_GROUPS_PER_MARKET})`)
    if (new Set(e.topics).size !== e.topics.length) at('duplicate topic')
    for (const t of e.topics) if (!SLUG_RE.test(t)) at(`bad topic slug ${t}`)

    if (!(liquidityTiers as readonly number[]).includes(e.liquidityTier))
      at(`liquidityTier ${e.liquidityTier} is not a tier`)

    const close = Date.parse(e.closeTime)
    const day = Date.parse(`${ELECTION_DAYS[e.cycle]}T00:00:00Z`)
    if (!Number.isFinite(close)) at('bad closeTime')
    else {
      if (close <= now) at('closeTime is in the past')
      if ((e.phase === 'general' || e.phase === 'offyear') && close <= day + 86_400_000)
        at('election market must close after election day (UTC)')
      if ((e.phase === 'nomination' || e.phase === 'primary') && close >= day)
        at('nomination/primary market must close before election day')
      const nom = nominationClose[e.cycle]
      if (e.phase === 'primary' && nom !== undefined && close > nom)
        at('primary contest must close no later than the nomination markets')
    }

    if (e.outcome === 'BINARY') {
      const p = e.seed.pct
      if (!(p >= 1 && p <= 99)) at(`initialProb ${p} outside [1, 99]`)
      continue
    }
    if (e.addAnswersMode === 'DISABLED' && !e.answers?.length)
      at('fixed-answer market without answers')
    if (e.answers) {
      if (e.answers.length < 2) at('fewer than 2 answers')
      const norm = e.answers.map(normalizeName)
      if (new Set(norm).size !== norm.length) at('duplicate answers')
      for (const a of e.answers)
        if (a.length > MAX_ANSWER_LENGTH) at(`answer too long: ${a}`)
    }
    if (e.seed.kind === 'static-fixed') {
      const n = e.answers?.length ?? 0
      if (e.seed.pcts.length !== n)
        at(`static seed has ${e.seed.pcts.length} values for ${n} answers`)
    }
    if (e.seed.kind === 'static-fixed' || e.seed.kind === 'static-candidates') {
      const err = seedError(e, {
        outcome: 'MULTIPLE_CHOICE',
        answers:
          e.seed.kind === 'static-fixed'
            ? e.answers ?? []
            : e.seed.seeds.map((s) => s.text),
        answerProbs:
          e.seed.kind === 'static-fixed'
            ? e.seed.pcts
            : e.seed.seeds.map((s) => s.pct),
        basis: e.seed.note,
      })
      if (err) at(err)
    }
  }
  return errors
}

// Checks resolved opening odds the way the API does (getAnswerProbsError),
// plus answer-count/uniqueness limits. Returns an error message or undefined.
export function seedError(entry: Entry, seed: ResolvedSeed): string | undefined {
  if (entry.outcome === 'BINARY') {
    if (seed.outcome !== 'BINARY') return 'seed/outcome mismatch'
    return seed.initialProb >= 1 && seed.initialProb <= 99
      ? undefined
      : `initialProb ${seed.initialProb} outside [1, 99]`
  }
  if (seed.outcome !== 'MULTIPLE_CHOICE') return 'seed/outcome mismatch'
  const other = hasOther(entry)
  const n = seed.answers.length + (other ? 1 : 0)
  if (n > MAX_ANSWERS) return `${n} answers (max ${MAX_ANSWERS})`
  if (seed.answers.length < (other ? 1 : 2)) return 'too few answers'
  const norm = seed.answers.map(normalizeName)
  if (new Set(norm).size !== norm.length) return 'duplicate answers in seed'
  if (entry.answers && entry.answers.join('\n') !== seed.answers.join('\n'))
    return 'seed answers differ from the fixed answers'
  return getAnswerProbsError({
    answerProbs: seed.answerProbs,
    numAnswers: seed.answers.length,
    shouldAnswersSumToOne: true,
    hasOtherAnswer: other,
  })
}

// ---------------------------------------------------------------------------
// Payloads and cost
// ---------------------------------------------------------------------------

export function costOf(entry: Entry, seed?: ResolvedSeed): number | undefined {
  if (entry.outcome === 'BINARY') return getAnte('BINARY', undefined, entry.liquidityTier)
  if (!seed || seed.outcome !== 'MULTIPLE_CHOICE') return undefined
  const n = seed.answers.length + (hasOther(entry) ? 1 : 0)
  return getAnte('MULTIPLE_CHOICE', n, entry.liquidityTier)
}

export type CreatePayload = Record<string, unknown> & {
  question: string
  idempotencyKey: string
  visibility: 'public' | 'unlisted'
}

// The POST /v0/market body. `imageUrls` must be index-aligned with the
// answers and is cut at the first answer without a photo (the API rejects
// empty strings, so a gap can't be expressed).
export function buildPayload(opts: {
  entry: Entry
  seed: ResolvedSeed
  groupIds: string[]
  reservedId: string
  quiet: boolean
  imageUrls?: (string | undefined)[]
}): CreatePayload {
  const { entry, seed, groupIds, reservedId, quiet } = opts
  const base = {
    question: entry.question,
    descriptionMarkdown: entry.description,
    closeTime: Date.parse(entry.closeTime),
    groupIds,
    visibility: quiet ? ('unlisted' as const) : ('public' as const),
    liquidityTier: entry.liquidityTier,
    idempotencyKey: reservedId,
  }
  if (entry.outcome === 'BINARY') {
    if (seed.outcome !== 'BINARY') throw new Error(`${entry.key}: seed mismatch`)
    return { ...base, outcomeType: 'BINARY', initialProb: seed.initialProb }
  }
  if (seed.outcome !== 'MULTIPLE_CHOICE')
    throw new Error(`${entry.key}: seed mismatch`)
  const prefix: string[] = []
  for (const url of opts.imageUrls ?? []) {
    if (!url) break
    prefix.push(url)
  }
  return {
    ...base,
    outcomeType: 'MULTIPLE_CHOICE',
    answers: seed.answers,
    answerProbs: seed.answerProbs,
    addAnswersMode: entry.addAnswersMode,
    shouldAnswersSumToOne: true,
    ...(prefix.length ? { answerImageUrls: prefix.slice(0, seed.answers.length) } : {}),
  }
}

// Opening prices read back from the created market, compared to the seed.
// Returns mismatch descriptions (empty = verified).
export function priceMismatches(
  seed: ResolvedSeed,
  market: SourceMarket,
  tolerancePts = 1.5
): string[] {
  const out: string[] = []
  const off = (label: string, want: number, got: number | undefined) => {
    if (got === undefined || !Number.isFinite(got))
      out.push(`${label}: missing price`)
    else if (Math.abs(got * 100 - want) > tolerancePts)
      out.push(`${label}: want ${want}%, got ${(got * 100).toFixed(1)}%`)
  }
  if (seed.outcome === 'BINARY') {
    off('YES', seed.initialProb, market.probability)
    return out
  }
  const answers = market.answers ?? []
  seed.answers.forEach((text, i) => {
    const a = answers.find((x) => !x.isOther && x.text.trim() === text.trim())
    off(text, seed.answerProbs[i], a?.probability)
  })
  if (seed.otherPct !== undefined) {
    const other = answers.find((x) => x.isOther)
    off('Other', seed.otherPct, other?.probability)
  }
  return out
}
