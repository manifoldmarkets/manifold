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

export type Cycle = 2027 | 2028 | 2030 | 2032 | 2034 | 2036
// primary: early-state contests; nomination: conventions/nominees;
// general: decided on (or after) election day; offyear: 2027 races.
export type Phase = 'primary' | 'nomination' | 'general' | 'offyear'

// Election days, the reference for close-time ordering checks.
export const ELECTION_DAYS: Record<Cycle, string> = {
  2027: '2027-11-02',
  2028: '2028-11-07',
  2030: '2030-11-05',
  2032: '2032-11-02',
  2034: '2034-11-07',
  2036: '2036-11-04',
}

export const DEM = 'Democratic Party'
export const REP = 'Republican Party'

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
  | {
      kind: 'flattened-nominee'
      nomineeSourceId: string
      power: number
      maxAnswers: number
      // Postal code of the contest's state; its own candidates get homeBoost.
      homeState?: string
      homeBoost?: number
    }

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
  // DISABLED: a fixed set of answers (no "Other"); ONLY_CREATOR: answers
  // @ManifoldPolitics curates (candidates, or parties it may add to), with an
  // "Other" answer; ANYONE: open answers for fields nobody knows yet (state
  // primaries), with an "Other" answer.
  addAnswersMode: 'DISABLED' | 'ONLY_CREATOR' | 'ANYONE'
  // The fixed answers (DISABLED markets); candidate markets take theirs from
  // the seed.
  answers?: string[]
  seed: Exclude<SeedSpec, { kind: 'static-binary' }>
}

export type Entry = BinaryEntry | MultiEntry

// ---------------------------------------------------------------------------
// Description building blocks
// ---------------------------------------------------------------------------

// Descriptions say only what decides the market: which election, what
// counts, and when it's N/A (Tod, 5 Nov 2026: "massively simplify"). Nothing
// about who adds answers, how the odds opened, or links elsewhere.

// Who counts as which answer in a race between parties. Same wording as the
// per-race pipeline's markets.
const PARTY_RULE =
  "Only the party matters: a Democratic or Republican nominee counts as that party even if also listed on other parties' lines. Anyone else resolves to Other, or to their own answer if one has been added."

const desc = (...paragraphs: string[]) => paragraphs.join('\n\n')

const TOPICS_2028 = [
  'us-politics',
  'elections',
  '2028-us-presidential-election-6tdsp26zly',
]

const nomineeDescription = (party: 'Democratic' | 'Republican', year: number) =>
  `Resolves to the person the ${party} Party formally nominates for President in ${year}: the winner of the roll call at its ${year} national convention (or an equivalent formal vote). If that nominee later withdraws or is replaced, it still resolves to the person first nominated. N/A if the party nominates no one.`

const contestedDescription = (party: 'Democratic' | 'Republican') =>
  `Resolves YES if no one wins the ${party} presidential nomination on the first roll-call ballot at the 2028 ${party} National Convention (or an equivalent formal vote), so a second ballot is held; NO if the nominee is chosen on the first ballot or by acclamation. N/A if the party nominates no one.`

const vpNomineeDescription = (party: 'Democratic' | 'Republican') =>
  `Resolves to the person the ${party} Party formally nominates for Vice President in 2028, at its national convention or an equivalent formal vote. If that nominee is later replaced, it still resolves to the person first nominated. N/A if the party nominates no one.`

// Every state and DC holds a 2028 presidential contest for each party. The
// first four keep the names they're known by; the rest say "primaries", which
// covers a caucus too (whichever a state holds is set in its own description).
type PrimaryState = {
  state: string
  code: string
  contest?: 'caucuses' | 'primary' | 'contest'
}
export const PRIMARY_STATES: PrimaryState[] = [
  { state: 'Iowa', code: 'IA', contest: 'caucuses' },
  { state: 'New Hampshire', code: 'NH', contest: 'primary' },
  { state: 'South Carolina', code: 'SC', contest: 'primary' },
  { state: 'Nevada', code: 'NV', contest: 'contest' },
  ...(
    [
      ['Alabama', 'AL'], ['Alaska', 'AK'], ['Arizona', 'AZ'], ['Arkansas', 'AR'],
      ['California', 'CA'], ['Colorado', 'CO'], ['Connecticut', 'CT'], ['Delaware', 'DE'],
      ['District of Columbia', 'DC'], ['Florida', 'FL'], ['Georgia', 'GA'], ['Hawaii', 'HI'],
      ['Idaho', 'ID'], ['Illinois', 'IL'], ['Indiana', 'IN'], ['Kansas', 'KS'],
      ['Kentucky', 'KY'], ['Louisiana', 'LA'], ['Maine', 'ME'], ['Maryland', 'MD'],
      ['Massachusetts', 'MA'], ['Michigan', 'MI'], ['Minnesota', 'MN'], ['Mississippi', 'MS'],
      ['Missouri', 'MO'], ['Montana', 'MT'], ['Nebraska', 'NE'], ['New Jersey', 'NJ'],
      ['New Mexico', 'NM'], ['New York', 'NY'], ['North Carolina', 'NC'], ['North Dakota', 'ND'],
      ['Ohio', 'OH'], ['Oklahoma', 'OK'], ['Oregon', 'OR'], ['Pennsylvania', 'PA'],
      ['Rhode Island', 'RI'], ['South Dakota', 'SD'], ['Tennessee', 'TN'], ['Texas', 'TX'],
      ['Utah', 'UT'], ['Vermont', 'VT'], ['Virginia', 'VA'], ['Washington', 'WA'],
      ['West Virginia', 'WV'], ['Wisconsin', 'WI'], ['Wyoming', 'WY'],
    ] as const
  ).map(([state, code]) => ({ state, code })),
]

// "the District of Columbia" reads right in a sentence; states don't take "the".
const inText = (s: PrimaryState) =>
  s.code === 'DC' ? 'the District of Columbia' : s.state

const primaryDescription = (
  s: PrimaryState,
  party: 'Democratic' | 'Republican'
) =>
  desc(
    `Resolves to the candidate with the most votes in the 2028 ${party} presidential ${
      s.contest ?? 'primary or caucus'
    } in ${inText(s)}, per certified results (or the AP count if not certified within a week). If no vote totals are reported, the one awarded the most delegates wins.`,
    `If the state and the party hold separate contests, the one that awards delegates counts. "Uncommitted" counts as Other. N/A if no ${party} contest is held in ${inText(s)} before the nominee is chosen.`
  )

const controlDescription = (
  chamber: 'Senate' | 'House',
  year: 2028 | 2030 | 2032 | 2034 | 2036
) => {
  const congress = { 2028: '121st', 2030: '122nd', 2032: '123rd', 2034: '124th', 2036: '125th' }[year]
  const convenes = { 2028: '2029', 2030: '2031', 2032: '2033', 2034: '2035', 2036: '2037' }[year]
  // Midterms keep the sitting Vice President; presidential years swear one in.
  const vp =
    year === 2030 || year === 2034
      ? 'the Vice President in office then'
      : `the Vice President inaugurated on January 20, ${convenes}`
  return chamber === 'Senate'
    ? `Resolves to the party with a Senate majority when the ${congress} Congress organizes in January ${convenes}, after any runoffs, counting independents with the party they caucus with. A 50–50 Senate goes to the party of ${vp}. Later vacancies or party switches don't change it.`
    : `Resolves to the party with a House majority (218 or more members-elect) when the ${congress} Congress convenes on January 3, ${convenes}, counting independents with the party they caucus with. If no party has a majority, it resolves to the party of the Speaker elected then.`
}

// ---------------------------------------------------------------------------
// The manifest
// ---------------------------------------------------------------------------

const AFTER_2028 = '2028-11-08T12:00:00Z'
const NOMINATION_2028 = '2028-09-30T12:00:00Z'
const EARLY_2028 = '2028-06-30T12:00:00Z'

// How strongly a state favors its own candidates in the primary seeds.
const HOME_BOOST = 3

const statePrimary = (
  s: PrimaryState,
  party: 'Democratic' | 'Republican'
): MultiEntry => ({
  key: `2028-${party === 'Democratic' ? 'dem' : 'gop'}-${s.state
    .toLowerCase()
    .replace(/\s+/g, '-')}`,
  cycle: 2028,
  phase: 'primary',
  outcome: 'MULTIPLE_CHOICE',
  addAnswersMode: 'ANYONE',
  question: s.contest
    ? `Who will win the 2028 ${s.state} ${party} presidential ${s.contest}?`
    : `Who will win ${inText(s)} in the 2028 ${party} presidential primaries?`,
  description: primaryDescription(s, party),
  topics: [
    'us-politics',
    s.state === 'New Hampshire' ? 'new-hampshire-primary' : 'elections',
    '2028-us-presidential-election-6tdsp26zly',
    '2028-presidential-primaries',
    party === 'Democratic' ? 'democratic-party' : 'republican-party',
  ],
  liquidityTier: s.contest ? 10000 : 1000,
  closeTime: EARLY_2028,
  seed: {
    kind: 'flattened-nominee',
    nomineeSourceId:
      party === 'Democratic' ? SOURCES.demNominee2028 : SOURCES.gopNominee2028,
    power: 0.8,
    maxAnswers: 3,
    homeState: s.code,
    homeBoost: HOME_BOOST,
  },
})

const partyControl = (
  key: string,
  cycle: 2028 | 2030 | 2032 | 2034 | 2036,
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
  liquidityTier: 10000,
  closeTime,
  seed,
})

const governor2027 = (
  state: 'Kentucky' | 'Mississippi' | 'Louisiana',
  closeTime: string,
  // Democratic and Republican; "Other" opens with the rest.
  pcts: [number, number],
  // The rest of "Resolves to the party that wins the …": the election, its
  // date, and the state's round rule if it has one.
  race: string
): MultiEntry => ({
  key: `2027-governor-${state.toLowerCase()}`,
  cycle: 2027,
  phase: 'offyear',
  outcome: 'MULTIPLE_CHOICE',
  addAnswersMode: 'ONLY_CREATOR',
  answers: [DEM, REP],
  question: `Which party will win the 2027 ${state} governor election?`,
  description: desc(
    `Resolves to the party that wins the ${race}`,
    PARTY_RULE
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
    note: `Static prior (D/R, Other gets the rest) for ${state}; no deep community market to copy.`,
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
    liquidityTier: 10000,
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
    liquidityTier: 10000,
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
    description:
      'Resolves to the person elected Vice President in the November 7, 2028 election, however the winner is officially decided. N/A if no 2028 presidential election is held.',
    topics: [...TOPICS_2028, 'vice-president'],
    liquidityTier: 10000,
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
    addAnswersMode: 'ONLY_CREATOR',
    answers: [DEM, REP],
    question:
      'Which party will win the national popular vote in the 2028 presidential election?',
    description: desc(
      'Resolves to the party of the presidential candidate with the most votes nationwide (50 states and DC) in the November 7, 2028 election, per certified results.',
      PARTY_RULE
    ),
    topics: [...TOPICS_2028, 'electoral-college'],
    liquidityTier: 10000,
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
    description:
      "Resolves to the range containing the number of electoral votes the Democratic nominee wins on November 7, 2028: the electors pledged to them by each state's certified results, including Maine's and Nebraska's districts. Faithless electors are ignored. If the nominee is replaced on the ballot, the replacement's electoral votes count. N/A if the President is no longer chosen by electoral votes.",
    topics: [...TOPICS_2028, 'electoral-college'],
    liquidityTier: 10000,
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
    description:
      'Resolves to the range containing the national popular-vote margin in the November 7, 2028 election: the Democratic nominee\'s share minus the Republican nominee\'s, in percentage points, from certified results (50 states and DC). A margin exactly on a boundary goes to the range farther from zero; exactly 0 resolves 50/50 between "R+0 to R+3" and "D+0 to D+3".',
    topics: [...TOPICS_2028, 'electoral-college'],
    liquidityTier: 10000,
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
    question: 'Will the 2028 popular vote winner lose the presidential election?',
    description:
      'Resolves YES if the candidate with the most votes nationwide in the November 7, 2028 election (certified results, 50 states and DC) is not the one elected President, however the winner is officially decided, and NO if they are.',
    topics: [...TOPICS_2028, 'electoral-college'],
    liquidityTier: 10000,
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
    description:
      "Resolves to the state that gives the November 7, 2028 winner their 270th electoral vote, when every state and DC is ranked by the winner's margin there, widest first, using certified results. Maine's and Nebraska's districts are ranked on their own and count as their state. N/A if no one wins 270, or if the President is no longer chosen by electoral votes.",
    topics: [...TOPICS_2028, 'electoral-college'],
    liquidityTier: 10000,
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
    description:
      'Resolves to "Democratic trifecta" if a Democrat is inaugurated President on January 20, 2029 and Democrats control both the Senate and the House (as in the 2028 Senate and House control markets); "Republican trifecta" likewise; otherwise "Divided government".',
    topics: [...TOPICS_2028, 'us-congress', '2028-us-elections'],
    liquidityTier: 10000,
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
    description: contestedDescription('Democratic'),
    topics: [...TOPICS_2028, '2028-presidential-primaries', 'democratic-party'],
    liquidityTier: 10000,
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
    description: contestedDescription('Republican'),
    topics: [...TOPICS_2028, '2028-presidential-primaries', 'republican-party'],
    liquidityTier: 10000,
    closeTime: NOMINATION_2028,
    seed: {
      kind: 'static-binary',
      pct: 3,
      note: 'Prior: the last multi-ballot Republican convention was 1948; the field has a clear front-runner.',
    },
  },
  ...PRIMARY_STATES.flatMap((s) => [
    statePrimary(s, 'Democratic'),
    statePrimary(s, 'Republican'),
  ]),

  // ----------------------------------------------------------------- 2027
  governor2027(
    'Kentucky',
    '2027-11-03T12:00:00Z',
    [24, 75],
    'November 2, 2027 election for Governor of Kentucky, per certified results.'
  ),
  governor2027(
    'Mississippi',
    '2027-11-03T12:00:00Z',
    [17, 82],
    'November 2, 2027 election for Governor of Mississippi, per certified results. If no candidate gets a majority, the runoff decides.'
  ),
  governor2027(
    'Louisiana',
    '2027-11-21T12:00:00Z',
    [9, 90],
    "2027 election for Governor of Louisiana, per certified results, whether it's decided in the October primary or the November runoff."
  ),
  {
    key: '2027-virginia-senate',
    cycle: 2027,
    phase: 'offyear',
    outcome: 'MULTIPLE_CHOICE',
    addAnswersMode: 'DISABLED',
    answers: [DEM, REP],
    question: 'Which party will control the Virginia Senate after the 2027 election?',
    description:
      'Resolves to the party that wins a majority (21 or more) of the 40 Virginia Senate seats in the November 2, 2027 election, per certified results, counting independents with the caucus they join. A 20–20 tie goes to the party of the Lieutenant Governor in office when the Senate convenes in January 2028.',
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
    description:
      'Resolves to the party that wins a majority (51 or more) of the 100 House of Delegates seats in the November 2, 2027 election, per certified results, counting independents with the caucus they join. A 50–50 tie goes to the party of the Speaker elected in January 2028, or 50/50 if the parties share power under co-speakers.',
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
    description: nomineeDescription('Republican', 2032),
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
    description:
      'Resolves to the person elected President in the November 2, 2032 election, however the winner is officially decided. N/A if no 2032 presidential election is held.',
    topics: ['us-politics', 'elections', '2032-us-presidential-election'],
    liquidityTier: 10000,
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

  // ----------------------------------------------------------------- 2034
  // Tod, 5 Nov 2026: cover every cycle through 2036.
  partyControl(
    '2034-senate-control',
    2034,
    'Senate',
    '2034-11-08T12:00:00Z',
    { kind: 'static-fixed', pcts: [50, 50], note: 'Prior: eight years out, no informative market.' },
    'us-midterm-elections'
  ),
  partyControl(
    '2034-house-control',
    2034,
    'House',
    '2034-11-08T12:00:00Z',
    { kind: 'static-fixed', pcts: [50, 50], note: 'Prior: eight years out, on maps drawn after the 2030 census.' },
    'us-midterm-elections'
  ),

  // ----------------------------------------------------------------- 2036
  partyControl(
    '2036-senate-control',
    2036,
    'Senate',
    '2036-11-05T12:00:00Z',
    { kind: 'static-fixed', pcts: [50, 50], note: 'Prior: ten years out, no informative market.' },
    '2036-us-presidential-election'
  ),
  partyControl(
    '2036-house-control',
    2036,
    'House',
    '2036-11-05T12:00:00Z',
    { kind: 'static-fixed', pcts: [50, 50], note: 'Prior: ten years out, on maps drawn after the 2030 census.' },
    '2036-us-presidential-election'
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
    case 'static-fixed': {
      // With an "Other" answer (party markets), it opens with the rest.
      const rest = Math.round((100 - seed.pcts.reduce((s, x) => s + x, 0)) * 10) / 10
      return {
        outcome: 'MULTIPLE_CHOICE',
        answers: (entry as MultiEntry).answers ?? [],
        answerProbs: seed.pcts,
        ...(hasOther(entry) ? { otherPct: rest } : {}),
        basis: seed.note,
      }
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
      // Democratic and Republican; the market's own "Other" opens with the rest.
      return {
        outcome: 'MULTIPLE_CHOICE',
        answers: [DEM, REP],
        answerProbs: [dem, rep],
        otherPct: other,
        basis: `copied from ${seed.sourceId} (${m.question}${traders(m)}), Other at ${seed.otherPct}%`,
      }
    }
    case 'ev-buckets': {
      const m = await readOpen(need(), seed.partySourceId, 'multi')
      const s = partyShares(m.answers!)
      // P(D reaches 270) is P(D wins): a third-party win leaves D short too,
      // so the raw Democratic share, not its share of D+R.
      const pDem = s.dem
      return {
        outcome: 'MULTIPLE_CHOICE',
        answers: EV_BUCKETS.map((b) => b.label),
        answerProbs: evBucketSeeds(pDem, seed.sigma),
        basis: `Normal(σ=${seed.sigma}) with P(≥270) = ${(pDem * 100).toFixed(
          1
        )}% (Democratic share in ${seed.partySourceId})`,
      }
    }
    case 'margin-buckets': {
      const m = await readOpen(need(), seed.popularVoteSourceId, 'multi')
      const s = partyShares(m.answers!)
      // P(D wins the popular vote), raw: the margin is D minus R, and a
      // third-party plurality isn't a D lead.
      const pDem = s.dem
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
      const home = seed.homeState
        ? { state: seed.homeState, boost: seed.homeBoost ?? 1 }
        : undefined
      return fromCandidates(
        flattenedSeeds(m.answers!, seed.power, seed.maxAnswers, home),
        `nominee market ${seed.nomineeSourceId} flattened (p^${seed.power}, top ${seed.maxAnswers}${
          home ? `, ×${home.boost} for ${home.state} candidates` : ''
        })`
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/
const KEY_RE = /^(2027|2028|2030|2032|2034|2036)-[a-z0-9-]+$/

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

// The created market's shape, read back before publishing: type, close time,
// answer mode, sum-to-one and answer count must be what we sent. (The public
// API doesn't return visibility; the create payload sets it unlisted.)
export function shapeMismatches(
  entry: Entry,
  seed: ResolvedSeed,
  market: {
    outcomeType: string
    closeTime?: number
    addAnswersMode?: string
    shouldAnswersSumToOne?: boolean
    answers?: unknown[]
  }
): string[] {
  const out: string[] = []
  if (market.outcomeType !== entry.outcome)
    out.push(`outcomeType ${market.outcomeType}, expected ${entry.outcome}`)
  const close = Date.parse(entry.closeTime)
  if (
    market.closeTime === undefined ||
    Math.abs(market.closeTime - close) > 60_000
  )
    out.push(`closeTime ${market.closeTime}, expected ${close}`)
  if (entry.outcome === 'MULTIPLE_CHOICE' && seed.outcome === 'MULTIPLE_CHOICE') {
    if (market.addAnswersMode !== entry.addAnswersMode)
      out.push(`addAnswersMode ${market.addAnswersMode}, expected ${entry.addAnswersMode}`)
    if (market.shouldAnswersSumToOne !== true)
      out.push(`shouldAnswersSumToOne ${market.shouldAnswersSumToOne}, expected true`)
    const expected = seed.answers.length + (entry.addAnswersMode !== 'DISABLED' ? 1 : 0)
    const got = market.answers?.length ?? 0
    if (got !== expected) out.push(`${got} answers, expected ${expected}`)
  }
  return out
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
