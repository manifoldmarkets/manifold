// The @ManifoldPolitics national/headline election markets for 2027–2036:
// the 2028 nominees and running mates, VP winner, popular vote, electoral
// votes, margin, tipping point and contested conventions; a 2028 presidential
// primary for each party in every state and DC; balance of power for every
// cycle 2028–2036; the 2032 nominees and winner; and the 2027 off-year races.
// Per-state presidential, Senate-seat, governor and House-district markets are
// NOT here: the generic party-market pipeline on branch `elections-2028-2036`
// covers those.
//
// Pure data + pure helpers (validation, seed resolution, payloads). The CLI is
// create-national-markets.ts; tests are national-markets.test.ts.

import { createHash } from 'crypto'
import { DOWNBALLOT_2028, DownballotRace } from './primaries-2028'
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
  HOUSE_SEAT_BUCKETS,
  normalizeName,
  partyShares,
  reservedIdFor,
  seatBucketSeeds,
  SENATE_SEAT_BUCKETS,
  SourceAnswer,
  threePartySeeds,
  twoPartySeeds,
} from './seeds'

export const SERIES = 'us-national-2028-v1'
export const MANIFOLD_POLITICS_ID = 'vuI5upWB8yU00rP7yxj95J2zd952'
export const MANIFOLD_POLITICS_USERNAME = 'ManifoldPolitics'

export type Cycle = 2027 | 2028 | 2029 | 2030 | 2032 | 2034 | 2036
// primary: early-state contests; nomination: conventions/nominees;
// general: decided on (or after) election day; offyear: 2027 races.
export type Phase = 'primary' | 'nomination' | 'general' | 'offyear'

// Election days, the reference for close-time ordering checks.
export const ELECTION_DAYS: Record<Cycle, string> = {
  2027: '2027-11-02',
  2028: '2028-11-07',
  2029: '2029-11-06',
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

// One counting convention for every national popular-vote market (winner,
// margin, and the popular-vote winner losing): the sum of each state's
// certified first-preference totals, as national tallies are usually
// reported. Where ballots are ranked (Maine, Alaska), first choices count.
// The per-state popular-vote markets instead follow each state's own
// certified winner, final ranked-choice round included.
const NATIONAL_VOTES = 'certified first-preference vote totals from the 50 states and DC'

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
    } in ${inText(s)}, per certified state or party results, or an AP call once the outcome is settled. Caucuses and ranked-choice contests count final-round votes. If no vote totals are reported, the one awarded the most delegates wins.`,
    // Without this, "the candidate with the most votes" would pass over a
    // winning Uncommitted line to the top named candidate.
    `If the state and the party hold separate contests, the one that awards delegates counts. Uncommitted resolves to its own answer if listed, otherwise Other. N/A if no ${party} contest is held in ${inText(s)} before the nominee is chosen.`
  )

// Balance of power (Tod, 5 Nov 2026: "do balance of power markets instead
// [of control of Congress], mimicking" JonasVollmer's 2026 market): who holds
// the presidency, the Senate and the House after each election, as eight
// fixed answers. Midterms ask about the President in office then.
type BopCycle = 2028 | 2030 | 2032 | 2034 | 2036
const BOP_ANSWERS = [
  'D President, D Senate, D House (Democratic trifecta)',
  'R President, R Senate, R House (Republican trifecta)',
  'D President, R Senate, R House',
  'D President, D Senate, R House',
  'D President, R Senate, D House',
  'R President, D Senate, D House',
  'R President, R Senate, D House',
  'R President, D Senate, R House',
]

// The Congress each cycle elects, and the year it convenes.
const CONGRESS: Record<BopCycle, string> = { 2028: '121st', 2030: '122nd', 2032: '123rd', 2034: '124th', 2036: '125th' }
const CONVENES: Record<BopCycle, string> = { 2028: '2029', 2030: '2031', 2032: '2033', 2034: '2035', 2036: '2037' }
const electionDay = (year: BopCycle) =>
  `November ${ELECTION_DAYS[year].slice(-2).replace(/^0/, '')}, ${year}`

const bopDescription = (year: BopCycle) => {
  const congress = CONGRESS[year]
  const convenes = CONVENES[year]
  const midterm = year === 2030 || year === 2034
  const day = electionDay(year)
  // Congress organizes on January 3, before the inauguration. In a
  // presidential year a 50–50 Senate follows the incoming Vice President, as
  // it did on January 20, 2001, when control passed from Gore's party to
  // Cheney's.
  const tie = midterm
    ? "the Vice President's party"
    : `the party of the Vice President inaugurated on January 20, ${convenes}`
  return desc(
    midterm
      ? `Resolves to the parties holding the presidency, Senate and House when the ${congress} Congress organizes in January ${convenes}, after the ${day} elections.`
      : `Resolves to the parties holding the presidency, Senate and House after the ${day} elections: the President inaugurated on January 20, ${convenes}, and the majority in each chamber when the ${congress} Congress organizes.`,
    `Independents count with the party they caucus with. A 50–50 Senate goes to ${tie}; a House with no majority, to the Speaker's. It waits for any runoffs or special elections that decide control.`,
    'N/A if no listed combination applies.'
  )
}

const balanceOfPower = (
  year: BopCycle,
  closeTime: string,
  pcts: number[],
  note: string,
  topic: string
): MultiEntry => ({
  key: `${year}-balance-of-power`,
  cycle: year,
  phase: 'general',
  outcome: 'MULTIPLE_CHOICE',
  addAnswersMode: 'DISABLED',
  answers: BOP_ANSWERS,
  question: `Balance of power: who will control the presidency, Senate and House after the ${year} US elections?`,
  description: bopDescription(year),
  topics: ['us-politics', 'elections', 'us-congress', topic],
  liquidityTier: 10000,
  closeTime,
  seed: { kind: 'static-fixed', pcts, note },
})

// Opening odds: a Gaussian copula on the three marginals (P(Democrat) for the
// presidency, Senate and House), correlation 0.6 in presidential years; in
// midterms the presidency and Congress pull apart (-0.2 Senate, -0.3 House)
// while the chambers move together (0.6). 1% floor, one decimal.
const bopNote = (pDem: string, midterm: boolean) =>
  `Prior from P(Democrat) for the presidency, Senate and House of ${pDem}, linked by a Gaussian copula (correlation 0.6${
    midterm
      ? ' between the chambers; -0.2 and -0.3 between the presidency and each chamber, the midterm penalty'
      : ''
  }).`

// How many seats the Democrats hold in each chamber after each election
// (Tod, 9 Nov 2026: "add markets on how many senate seats and how many house
// seats are won … for future years too"). Fixed ranges (SENATE_SEAT_BUCKETS,
// HOUSE_SEAT_BUCKETS), no Other: independents count with the party they
// caucus with. The Senate counts every seat, not only those up that year,
// since that's what decides control.
type Chamber = 'senate' | 'house'

const seatsDescription = (chamber: Chamber, year: BopCycle) =>
  chamber === 'senate'
    ? desc(
        `Resolves to the range containing the number of senators in the Democratic caucus when the ${CONGRESS[year]} Congress convenes in January ${CONVENES[year]}, after the ${electionDay(year)} elections: Democrats, and independents who caucus with them. Every seat counts, not only those up in ${year}.`,
        'A seat still undecided then (a recount or runoff) counts for the party that wins it. A seat vacant for any other reason counts for the party of the senator who last held it.'
      )
    : desc(
        `Resolves to the range containing the number of House seats Democrats win in the ${electionDay(year)} elections, per certified results, runoffs included. Independents count with the party they caucus with when the ${CONGRESS[year]} Congress convenes in January ${CONVENES[year]}.`,
        'A seat still undecided then (a recount or runoff) counts once it is decided.'
      )

const seatCount = (
  chamber: Chamber,
  year: BopCycle,
  closeTime: string,
  seed: { pDem: number; sigma: number; note: string },
  topic: string
): MultiEntry => ({
  key: `${year}-dem-${chamber}-seats`,
  cycle: year,
  phase: 'general',
  outcome: 'MULTIPLE_CHOICE',
  addAnswersMode: 'DISABLED',
  answers: (chamber === 'senate' ? SENATE_SEAT_BUCKETS : HOUSE_SEAT_BUCKETS).map(
    (b) => b.label
  ),
  question:
    chamber === 'senate'
      ? `How many Senate seats will Democrats hold after the ${year} elections?`
      : `How many House seats will Democrats win in the ${year} elections?`,
  description: seatsDescription(chamber, year),
  topics: [
    'us-politics',
    'elections',
    chamber === 'senate' ? 'us-senate' : 'house-of-representatives',
    topic,
  ],
  // The 2028 pair sits beside the balance of power on /election; later
  // cycles' stay small until they're near.
  liquidityTier: year === 2028 ? 10000 : 1000,
  closeTime,
  seed: {
    kind: 'static-fixed',
    pcts: seatBucketSeeds(chamber, seed.pDem, seed.sigma),
    note: seed.note,
  },
})

// Opening odds: Normal(σ seats) placed so a Democratic majority (half a
// 50–50 Senate) has the chance given.
const seatNote = (pDem: number, sigma: number, basis: string) =>
  `Prior: Normal(σ ${sigma} seats) with a Democratic majority at ${Math.round(
    pDem * 100
  )}%: ${basis}`
const seatSeed = (pDem: number, sigma: number, basis: string) => ({
  pDem,
  sigma,
  note: seatNote(pDem, sigma, basis),
})
const EVEN_SEATS = 'no market to read yet, so even.'

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

// Territories and Democrats Abroad hold 2028 presidential contests too
// (Tod, 6 Nov 2026: create everything before November 2028 now). Same shape
// as the state primaries; no home-state boost.
type TerritoryContest = {
  slug: string
  name: string // as it reads in a sentence
  code: string
  democraticOnly?: boolean
}
export const TERRITORY_CONTESTS: TerritoryContest[] = [
  { slug: 'puerto-rico', name: 'Puerto Rico', code: 'PR' },
  { slug: 'guam', name: 'Guam', code: 'GU' },
  { slug: 'us-virgin-islands', name: 'the U.S. Virgin Islands', code: 'VI' },
  { slug: 'american-samoa', name: 'American Samoa', code: 'AS' },
  { slug: 'northern-mariana-islands', name: 'the Northern Mariana Islands', code: 'MP' },
  { slug: 'democrats-abroad', name: 'Democrats Abroad', code: 'DA', democraticOnly: true },
]

const territoryPrimary = (
  t: TerritoryContest,
  party: 'Democratic' | 'Republican'
): MultiEntry => {
  const abroad = t.code === 'DA'
  const contest = abroad
    ? 'the 2028 Democrats Abroad global presidential primary'
    : `the 2028 ${party} presidential primary or caucus in ${t.name}`
  return {
    key: `2028-${party === 'Democratic' ? 'dem' : 'gop'}-${t.slug}`,
    cycle: 2028,
    phase: 'primary',
    outcome: 'MULTIPLE_CHOICE',
    addAnswersMode: 'ANYONE',
    question: abroad
      ? 'Who will win the 2028 Democrats Abroad presidential primary?'
      : `Who will win ${t.name} in the 2028 ${party} presidential primaries?`,
    description: desc(
      `Resolves to the candidate with the most votes in ${contest}, per certified party or territorial results, or an AP call once the outcome is settled. Caucuses and ranked-choice contests count final-round votes. If no vote totals are reported, the one awarded the most delegates wins.`,
      `${
        abroad ? '' : 'If the territory and the party hold separate contests, the one that awards delegates counts. '
      }Uncommitted resolves to its own answer if listed, otherwise Other. N/A if no such contest is held before the nominee is chosen.`
    ),
    topics: [
      'us-politics',
      'elections',
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
      maxAnswers: 3,
      homeState: t.code,
      homeBoost: HOME_BOOST,
    },
  }
}

// Each party's 2028 primary for Senate and governor (or one top-two/top-four
// primary per race). Open answers, seeded with researched candidates; Other
// takes the rest. A market closes the day after the contest that decides
// it, or at the end of September (the latest 2028 primaries) if that date
// isn't set yet.
const DOWNBALLOT_DEFAULT_CLOSE = '2028-09-30T00:00:00Z'

// States whose Democratic Party runs under another name.
const PARTY_LINE_ALIAS: Record<string, string> = {
  MN: ' The DFL counts as the Democratic Party.',
  ND: ' The Democratic-NPL Party counts as the Democratic Party.',
}

const downballotPrimaries = (race: DownballotRace): MultiEntry[] =>
  race.markets
    .filter((m) => m.candidates.length > 0)
    .map((m) => {
      const year = race.year ?? 2028
      const slug = race.state.toLowerCase().replace(/[^a-z]+/g, '-')
      const seat = race.office === 'senate' ? 'U.S. Senate' : `governor`
      const where =
        race.office === 'senate'
          ? `${race.special ? `the ${year} U.S. Senate special election` : 'U.S. Senate'} in ${race.state}`
          : `governor of ${race.state}`
      const naIfNone = race.special
        ? `N/A if no special election for this seat is held in ${year}.`
        : `N/A if no election for this office is held in ${year}.`
      const decided = race.decidedBy
        ? new Date(Date.parse(`${race.decidedBy}T12:00:00Z`) + 86_400_000).toISOString()
        : DOWNBALLOT_DEFAULT_CLOSE
      const base = {
        cycle: year,
        phase: 'primary' as const,
        outcome: 'MULTIPLE_CHOICE' as const,
        addAnswersMode: 'ANYONE' as const,
        topics: [
          'us-politics',
          'elections',
          `${year}-us-elections`,
          race.office === 'senate' ? 'us-senate' : 'governor',
          ...(m.party === 'Democratic'
            ? ['democratic-party']
            : m.party === 'Republican'
            ? ['republican-party']
            : []),
        ],
        liquidityTier: 1000 as const,
        closeTime: decided,
        seed: {
          kind: 'static-candidates' as const,
          note: `${race.note}: ${m.candidates.map((c) => `${c.name} ${c.pct}%`).join(', ')}.`,
          seeds: m.candidates.map((c) => ({ text: c.name, pct: c.pct })),
        },
      }
      if (!m.party) {
        const kind = race.system === 'top-four' ? 'top-four' : 'top-two'
        return {
          ...base,
          key: `${year}-${race.office}${race.special ? '-special' : ''}-${slug}-primary`,
          question: `Who will finish first in the ${year} ${kind} primary for ${seat} in ${race.state}?`,
          // If the state drops its open primary (Alaska's repeal of top-four
          // was on the 2026 ballot), there's nothing to count: N/A.
          description: desc(
            `Resolves to the candidate with the most votes in the ${year} ${kind} primary for ${where}, per certified results or an AP call once the outcome is settled. Party labels don't matter, only the vote count.`,
            `N/A if ${race.state} holds no ${kind} primary for this seat in ${year}.`
          ),
        }
      }
      const p = m.party === 'Democratic' ? 'dem' : 'gop'
      return {
        ...base,
        key: `${year}-${race.office}${race.special ? '-special' : ''}-${slug}-${p}`,
        question: race.special
          ? `Who will be the ${m.party} nominee in the ${year} U.S. Senate special election in ${race.state}?`
          : race.office === 'senate'
          ? `Who will be the ${year} ${m.party} nominee for U.S. Senate in ${race.state}?`
          : `Who will be the ${year} ${m.party} nominee for governor of ${race.state}?`,
        description: desc(
          // A special's `where` already names its year.
          `Resolves to the person the ${m.party} Party nominates for ${where}${
            race.special ? '' : ` in ${year}`
          }: the winner of its primary, runoff or convention, whichever decides the nomination, per certified results or an AP call once the outcome is settled.`,
          `If the nominee later withdraws or is replaced, it still resolves to the person first nominated. ${
            race.special ? naIfNone.replace('.', ', or if the party nominates no one.') : 'N/A if the party nominates no one for this race.'
          }${m.party === 'Democratic' ? PARTY_LINE_ALIAS[race.code] ?? '' : ''}`
        ),
      }
    })

// Party control of a state legislative chamber: the two parties, fixed (no
// Other: independents count with the caucus they join).
const chamberControl = (opts: {
  key: string
  cycle: Cycle
  question: string
  // "the 40 New Jersey Senate seats in the November 2, 2027 election"
  seats: string
  majority: number
  tie: string
  topics: string[]
  closeTime: string
  pcts: [number, number]
  note: string
}): MultiEntry => ({
  key: opts.key,
  cycle: opts.cycle,
  phase: 'offyear',
  outcome: 'MULTIPLE_CHOICE',
  addAnswersMode: 'DISABLED',
  answers: [DEM, REP],
  question: opts.question,
  description: `Resolves to the party that wins a majority (${opts.majority} or more) of ${opts.seats}, per certified results, counting independents with the caucus they join. ${opts.tie}`,
  topics: opts.topics,
  liquidityTier: 1000,
  closeTime: opts.closeTime,
  seed: { kind: 'static-fixed', pcts: opts.pcts, note: opts.note },
})

// An off-year governor race after 2027 (party market, Other open to
// @ManifoldPolitics, like the 2027 ones).
const offyearGovernor = (
  year: 2029,
  state: 'Virginia' | 'New Jersey',
  race: string,
  pcts: [number, number],
  note: string
): MultiEntry => ({
  key: `${year}-governor-${state.toLowerCase().replace(/\s+/g, '-')}`,
  cycle: year,
  phase: 'offyear',
  outcome: 'MULTIPLE_CHOICE',
  addAnswersMode: 'ONLY_CREATOR',
  answers: [DEM, REP],
  question: `Which party will win the ${year} ${state} governor election?`,
  description: desc(`Resolves to the party that wins the ${race}`, PARTY_RULE),
  topics: ['us-politics', 'elections', 'governor', state.toLowerCase().replace(/\s+/g, '-')],
  liquidityTier: 1000,
  closeTime: `${year}-11-07T12:00:00Z`,
  seed: { kind: 'static-fixed', pcts, note },
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
      `Resolves to the party of the presidential candidate with the most votes nationwide in the November 7, 2028 election, using ${NATIONAL_VOTES}.`,
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
    description: `Resolves to the range containing the national popular-vote margin in the November 7, 2028 election: the Democratic nominee's share minus the Republican nominee's, in percentage points, using ${NATIONAL_VOTES}. A margin exactly on a boundary goes to the range farther from zero; exactly 0 resolves 50/50 between "R+0 to R+3" and "D+0 to D+3".`,
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
    description: `Resolves YES if the candidate with the most votes nationwide in the November 7, 2028 election, using ${NATIONAL_VOTES}, is not the one elected President, however the winner is officially decided, and NO if they are.`,
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
    // Signed margins, and the electoral votes actually awarded to the winner:
    // a state the winner lost adds nothing, and Maine's and Nebraska's
    // statewide votes are counted once, apart from their districts.
    description:
      "Resolves to the state that gives the November 7, 2028 winner their 270th electoral vote. Rank every state and DC by the winner's certified margin, in percentage points, over the candidate with the second-most electoral votes (negative where that candidate got more votes), largest first, and add up the electoral votes each awarded the winner. Maine and Nebraska enter as a statewide unit worth two votes plus one unit per district; a district that tips it resolves to its state. N/A if no one wins 270, or if the President is no longer chosen by electoral votes.",
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
  balanceOfPower(2028, AFTER_2028, [45.3, 13.3, 5.1, 12.5, 4.1, 7.5, 3.1, 9.1], bopNote('67/74/60%', false), '2028-us-elections'),
  seatCount('senate', 2028, AFTER_2028, seatSeed(0.9, 5, 'the community 2028 Senate markets on 9 Nov 2026 (92c0nPtNuE 90%; SUTs1ggYgoddnFyALjjV, YES = Republicans, 10%). Democrats hold 54–56 seats after 2026 and 16 of the 34 regular seats up in 2028.'), '2028-us-elections'),
  seatCount('house', 2028, AFTER_2028, seatSeed(0.8, 15, 'centred near 230; Democrats won 237 seats in 2026 and are favored for the presidency in 2028 (the community trifecta markets read 49–68%).'), '2028-us-elections'),
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
  ...TERRITORY_CONTESTS.flatMap((t) =>
    t.democraticOnly
      ? [territoryPrimary(t, 'Democratic')]
      : [territoryPrimary(t, 'Democratic'), territoryPrimary(t, 'Republican')]
  ),
  ...DOWNBALLOT_2028.flatMap(downballotPrimaries),
  {
    key: '2028-npvic-in-effect',
    cycle: 2028,
    phase: 'general',
    outcome: 'BINARY',
    question:
      'Will the National Popular Vote Interstate Compact be in effect for the 2028 presidential election?',
    description:
      'Resolves YES if the National Popular Vote Interstate Compact governs how its member states appoint their presidential electors for the November 7, 2028 election: its members together hold at least 270 electoral votes and the compact is in effect for that election under its own terms. NO otherwise, including if a court stops it from applying before electors are appointed.',
    topics: [...TOPICS_2028, 'electoral-college'],
    liquidityTier: 10000,
    closeTime: AFTER_2028,
    seed: {
      kind: 'static-binary',
      pct: 4,
      note: 'Prior: members held 222 of the 270 electoral votes after Virginia joined (April 2026); the rest would need states with Republican legislatures before mid-2028.',
    },
  },
  {
    key: '2028-speaker-january-2029',
    cycle: 2028,
    phase: 'general',
    outcome: 'MULTIPLE_CHOICE',
    addAnswersMode: 'ONLY_CREATOR',
    question: 'Who will be elected Speaker of the House when the new Congress meets in January 2029?',
    description:
      'Resolves to the person the U.S. House of Representatives elects Speaker when the 121st Congress first elects one (January 2029 or later), however many ballots it takes. N/A if no Speaker is elected by March 31, 2029.',
    topics: ['us-politics', 'us-congress', 'house-of-representatives', '2028-us-elections'],
    liquidityTier: 1000,
    closeTime: '2029-01-03T17:00:00Z',
    seed: {
      kind: 'static-candidates',
      note: 'Prior: the majority leader usually wins; Democrats are 60% to win the House in 2028 (the balance-of-power input), and the Republican leader in 2029 is less settled.',
      seeds: [
        { text: 'Hakeem Jeffries', pct: 52 },
        { text: 'Mike Johnson', pct: 22 },
      ],
    },
  },

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
  {
    // Klobuchar became governor on January 4, 2027. Minnesota holds the
    // special at the next November election, odd years included (Minn. Stat.
    // 204D.28), so: primary August 10, election November 2, 2027.
    key: '2027-senate-special-minnesota',
    cycle: 2027,
    phase: 'offyear',
    outcome: 'MULTIPLE_CHOICE',
    addAnswersMode: 'ONLY_CREATOR',
    answers: [DEM, REP],
    question: 'Which party will win the 2027 U.S. Senate special election in Minnesota?',
    description: desc(
      "Resolves to the party that wins the November 2, 2027 special election for Amy Klobuchar's former U.S. Senate seat (term ending January 3, 2031), per certified results. If it's held on another date before then, that election decides; N/A if none is.",
      `${PARTY_RULE} The DFL counts as the Democratic Party.`
    ),
    topics: ['us-politics', 'elections', '2027-us-elections', 'us-senate', 'minnesota'],
    liquidityTier: 1000,
    closeTime: '2027-11-03T12:00:00Z',
    seed: {
      kind: 'static-fixed',
      pcts: [78, 21],
      note: 'Prior: Minnesota has elected Democrats statewide since 2008, and off-year specials tend to favor the party out of the White House.',
    },
  },
  chamberControl({
    key: '2027-new-jersey-senate',
    cycle: 2027,
    question: 'Which party will control the New Jersey Senate after the 2027 election?',
    seats: 'the 40 New Jersey Senate seats in the November 2, 2027 election',
    majority: 21,
    tie: 'A 20–20 tie goes to the party of the Senate President elected in January 2028.',
    topics: ['us-politics', 'elections', '2027-us-elections', 'new-jersey'],
    closeTime: '2027-11-03T12:00:00Z',
    pcts: [85, 15],
    note: 'Prior: Democrats have held the New Jersey Senate since 2004.',
  }),
  chamberControl({
    key: '2027-new-jersey-assembly',
    cycle: 2027,
    question: 'Which party will control the New Jersey General Assembly after the 2027 election?',
    seats: 'the 80 General Assembly seats in the November 2, 2027 election',
    majority: 41,
    tie: 'A 40–40 tie goes to the party of the Speaker elected in January 2028.',
    topics: ['us-politics', 'elections', '2027-us-elections', 'new-jersey'],
    closeTime: '2027-11-03T12:00:00Z',
    pcts: [85, 15],
    note: 'Prior: Democrats have held the Assembly since 2002 and gained seats in 2025.',
  }),
  chamberControl({
    key: '2027-mississippi-house',
    cycle: 2027,
    question: 'Which party will control the Mississippi House after the 2027 election?',
    seats: 'the 122 Mississippi House seats in the 2027 election (November 2, 2027, and any runoffs)',
    majority: 62,
    tie: 'A 61–61 tie goes to the party of the Speaker elected in January 2028.',
    topics: ['us-politics', 'elections', '2027-us-elections', 'mississippi'],
    closeTime: '2027-12-01T12:00:00Z',
    pcts: [3, 97],
    note: 'Prior: Republicans hold a supermajority.',
  }),
  chamberControl({
    key: '2027-mississippi-senate',
    cycle: 2027,
    question: 'Which party will control the Mississippi Senate after the 2027 election?',
    seats: 'the 52 Mississippi Senate seats in the 2027 election (November 2, 2027, and any runoffs)',
    majority: 27,
    tie: "A 26–26 tie goes to the Lieutenant Governor's party.",
    topics: ['us-politics', 'elections', '2027-us-elections', 'mississippi'],
    closeTime: '2027-12-01T12:00:00Z',
    pcts: [3, 97],
    note: 'Prior: Republicans hold a supermajority.',
  }),
  chamberControl({
    key: '2027-louisiana-house',
    cycle: 2027,
    question: 'Which party will control the Louisiana House after the 2027 election?',
    seats: "the 105 Louisiana House seats in the 2027 elections (the fall primary and the November general)",
    majority: 53,
    tie: 'A tie goes to the party of the Speaker elected when the new House convenes.',
    topics: ['us-politics', 'elections', '2027-us-elections', 'louisiana'],
    closeTime: '2027-11-21T12:00:00Z',
    pcts: [3, 97],
    note: 'Prior: Republicans hold a supermajority.',
  }),
  chamberControl({
    key: '2027-louisiana-senate',
    cycle: 2027,
    question: 'Which party will control the Louisiana Senate after the 2027 election?',
    seats: "the 39 Louisiana Senate seats in the 2027 elections (the fall primary and the November general)",
    majority: 20,
    tie: 'A tie goes to the party of the Senate President elected when the new Senate convenes.',
    topics: ['us-politics', 'elections', '2027-us-elections', 'louisiana'],
    closeTime: '2027-11-21T12:00:00Z',
    pcts: [3, 97],
    note: 'Prior: Republicans hold a supermajority.',
  }),

  // ----------------------------------------------------------------- 2029
  offyearGovernor(
    2029,
    'Virginia',
    'November 6, 2029 election for Governor of Virginia, per certified results.',
    [55, 44],
    'Prior: Virginia leans Democratic, but the seat is open (no consecutive terms) and the off-year after a presidential election often favors the party out of the White House.'
  ),
  offyearGovernor(
    2029,
    'New Jersey',
    'November 6, 2029 election for Governor of New Jersey, per certified results.',
    [62, 37],
    'Prior: New Jersey leans Democratic and the governor elected in 2025 can run again.'
  ),
  chamberControl({
    key: '2029-virginia-house',
    cycle: 2029,
    question: 'Which party will control the Virginia House of Delegates after the 2029 election?',
    seats: 'the 100 House of Delegates seats in the November 6, 2029 election',
    majority: 51,
    tie: 'A 50–50 tie goes to the party of the Speaker elected in January 2030, or 50/50 if the parties share power under co-speakers.',
    topics: ['us-politics', 'elections', 'virginia'],
    closeTime: '2029-11-07T12:00:00Z',
    pcts: [65, 35],
    note: 'Prior: Democrats hold the chamber; the off-year after a presidential election often favors the party out of the White House.',
  }),

  // ----------------------------------------------------------------- 2030
  balanceOfPower(2030, '2030-11-06T12:00:00Z', [18.2, 8.8, 28.9, 12.4, 7.6, 14.4, 4.8, 4.9], bopNote('67/50/45%', true), 'us-midterm-elections'),
  seatCount('senate', 2030, '2030-11-06T12:00:00Z', seatSeed(0.5, 6, 'the community 2030 Senate market (06GTQ5wGTbIbtEIEfIXh, 50/50).'), 'us-midterm-elections'),
  seatCount('house', 2030, '2030-11-06T12:00:00Z', seatSeed(0.45, 20, 'the balance-of-power House input.'), 'us-midterm-elections'),

  // ----------------------------------------------------------------- 2032
  balanceOfPower(2032, '2032-11-03T12:00:00Z', [27.8, 27.8, 7.4, 7.4, 7.4, 7.4, 7.4, 7.4], bopNote('50/50/50%', false), '2032-us-presidential-election'),
  seatCount('senate', 2032, '2032-11-03T12:00:00Z', seatSeed(0.5, 7, EVEN_SEATS), '2032-us-presidential-election'),
  seatCount('house', 2032, '2032-11-03T12:00:00Z', seatSeed(0.5, 25, EVEN_SEATS), '2032-us-presidential-election'),
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

  // ----------------------------------------------------------------- 2034
  balanceOfPower(2034, '2034-11-08T12:00:00Z', [13.6, 13.6, 21.7, 8.2, 6.5, 21.7, 8.2, 6.5], bopNote('50/50/50%', true), 'us-midterm-elections'),
  seatCount('senate', 2034, '2034-11-08T12:00:00Z', seatSeed(0.5, 7, EVEN_SEATS), 'us-midterm-elections'),
  seatCount('house', 2034, '2034-11-08T12:00:00Z', seatSeed(0.5, 25, EVEN_SEATS), 'us-midterm-elections'),

  // ----------------------------------------------------------------- 2036
  balanceOfPower(2036, '2036-11-05T12:00:00Z', [27.8, 27.8, 7.4, 7.4, 7.4, 7.4, 7.4, 7.4], bopNote('50/50/50%', false), '2036-us-presidential-election'),
  seatCount('senate', 2036, '2036-11-05T12:00:00Z', seatSeed(0.5, 7, EVEN_SEATS), '2036-us-presidential-election'),
  seatCount('house', 2036, '2036-11-05T12:00:00Z', seatSeed(0.5, 25, EVEN_SEATS), '2036-us-presidential-election'),
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
const KEY_RE = /^(2027|2028|2029|2030|2032|2034|2036)-[a-z0-9-]+$/

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

// What a market is created saying: everything from the manifest that goes
// into it. Seeded answers and odds come from live markets and are recorded
// separately (the state file's `seed`). A run saves this when it creates a
// market and refuses to publish that market under different criteria.
export type Criteria = {
  question: string
  description: string
  outcome: Entry['outcome']
  addAnswersMode?: MultiEntry['addAnswersMode']
  answers?: string[]
  closeTime: string
  topics: string[]
  liquidityTier: number
}

export const criteriaOf = (e: Entry): Criteria => ({
  question: e.question,
  description: e.description,
  outcome: e.outcome,
  ...(e.outcome === 'MULTIPLE_CHOICE'
    ? { addAnswersMode: e.addAnswersMode, ...(e.answers ? { answers: e.answers } : {}) }
    : {}),
  closeTime: e.closeTime,
  topics: e.topics,
  liquidityTier: e.liquidityTier,
})

export const criteriaHash = (c: Criteria) =>
  createHash('sha256').update(JSON.stringify(c)).digest('hex').slice(0, 16)

// Which criteria differ, by name ("all" when no earlier snapshot was saved).
export function changedCriteria(saved: Criteria | undefined, now: Criteria) {
  if (!saved) return ['all']
  const keys = new Set([...Object.keys(saved), ...Object.keys(now)]) as Set<keyof Criteria>
  return [...keys].filter((k) => JSON.stringify(saved[k]) !== JSON.stringify(now[k]))
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
  },
  // answerCount: false for a market made by an earlier attempt whose seed
  // (and so its candidate list) isn't recorded.
  opts: { answerCount?: boolean } = {}
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
    if (opts.answerCount !== false && got !== expected)
      out.push(`${got} answers, expected ${expected}`)
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
