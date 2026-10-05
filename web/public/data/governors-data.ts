import { DEV_LAUNCH_GOVERNORS } from './dev-launch-markets'
import { StateElectionMarket } from './elections-data'

export const governors2024: StateElectionMarket[] = [
  {
    state: 'UT',
    slug: 'utah-governors-race-which-party-wil',
  },
  {
    state: 'WV',
    slug: 'west-virginia-governors-race-which',
  },
  {
    state: 'ND',
    slug: 'which-party-will-win-the-governors-4007adbcb110',
  },
  {
    state: 'IN',
    slug: 'which-party-will-win-the-governors-e3bcb216ecb9',
  },
  {
    state: 'MO',
    slug: 'which-party-will-win-the-governors-c5e726842553',
  },
  {
    state: 'MT',
    slug: 'which-party-will-win-the-governors-a2431ec846ad',
  },
  {
    state: 'VT',
    slug: 'which-party-will-win-the-governors-3b86e19d335d',
  },
  {
    state: 'NH',
    slug: 'which-party-will-win-the-governors-22d2d2d83573',
  },
  {
    state: 'NC',
    slug: 'which-party-will-win-the-governors-b6cc6f825385',
  },
  {
    state: 'DE',
    slug: 'which-party-will-win-the-governors',
  },
  {
    state: 'WA',
    slug: 'which-party-will-win-the-governors-db1a96c1cebb',
  },
]

// Curated general-election sources, not an exhaustive inventory of markets.
// Ballot coverage is separate: unlinked states remain visible and unpriced.
// Candidate-winner sources retain their actual answer labels in the bet panel.
export const governors2026: StateElectionMarket[] = [
  { state: 'TX', slug: 'texas-governors-race-which-party-wi' },
  { state: 'GA', slug: 'georgia-governors-race-which-party' },
  { state: 'MA', slug: 'massachusetts-governors-race-which' },
  { state: 'CA', slug: 'california-governors-race-which-par' },
  { state: 'NY', slug: 'new-york-governors-race-which-party' },
  { state: 'AK', slug: 'which-party-will-win-the-alaska-gov' },
  { state: 'AZ', slug: 'arizona-governors-race-which-party' },
  { state: 'IA', slug: 'which-party-will-win-iowas-2026-gub' },
  { state: 'NV', slug: 'which-party-will-win-the-2026-nevad' },
  { state: 'AR', slug: 'which-party-will-win-the-arkansas-g' },
  { state: 'NH', slug: 'which-party-will-win-the-2026-new-h-2UlpPIy0NQ' },
  { state: 'NE', slug: 'which-party-will-win-the-2026-nebra-hCZdznyt5s' },
  { state: 'CO', slug: 'who-will-win-the-2026-colorado-gube' },
  { state: 'NM', slug: 'which-party-will-win-the-2026-new-m-EyudAL0LqQ' },
  // Michigan: party nominees and Other; withdrawn Duggan is unclassified.
  // Florida explicitly asks about a Republican general-election winner.
  { state: 'MI', slug: 'who-will-the-2026-michigan-governor' },
  { state: 'FL', slug: 'will-a-republican-win-the-florida-g' },
  // Named general-election winners. Descriptions link the relevant election;
  // creator comments explicitly request dashboard inclusion. Replacement and
  // cancellation criteria remain unspecified; these are not party contracts.
  // Audit: same creator's described party binary (YES = Republican wins).
  // The named-candidate market had no Other answer or replacement rule.
  { state: 'KS', slug: 'will-the-republicans-win-the-2026-k' },
  { state: 'OH', slug: '2026-ohio-governor-election-winner' },
  { state: 'OR', slug: '2026-oregon-governor-election-winne' },
  // Audit 2026-10-03: previously unlinked states. Title-only "which party"
  // markets (empty descriptions, ~50 mana per answer) — CONDITIONAL sources;
  // see backend/scripts/elections-2026/audit for subsidies and caveats.
  { state: 'AL', slug: 'which-party-will-win-the-2026-alaba-Sg9ROtngq6' },
  { state: 'CT', slug: 'which-party-will-win-the-2026-conne' },
  { state: 'HI', slug: 'which-party-will-win-the-2026-hawai' },
  { state: 'ID', slug: 'which-party-will-win-the-2026-idaho-qdpIthLqnl' },
  { state: 'IL', slug: 'which-party-will-win-the-2026-illin-q5Nnz0zzcd' },
  { state: 'ME', slug: 'which-party-will-in-the-2026-maine' },
  { state: 'MD', slug: 'which-party-will-win-the-2026-maryl' },
  { state: 'OK', slug: 'which-party-will-win-the-2026-oklah' },
  { state: 'PA', slug: 'which-party-will-win-the-2026-penns' },
  { state: 'SC', slug: 'which-party-will-win-the-2026-south-E22N0t2lNg' },
  { state: 'SD', slug: 'which-party-will-win-the-2026-south-IPqyQsUU0z' },
  { state: 'TN', slug: 'which-party-will-win-the-2026-tenne' },
  // VT: majority required, else the legislature picks in January (Vt. Const.
  // ch. II §47); the market does not say how that round is treated.
  { state: 'VT', slug: 'which-party-will-win-the-2026-vermo' },
  { state: 'WI', slug: 'which-party-will-win-the-2026-wisco' },
  { state: 'WY', slug: 'what-party-will-win-the-2026-wyomin' },
  // MN: YES = Democratic (DFL) nominee wins; usable only through
  // audited-sources' binaryYes 'D'; DFL interpretation is noted in the audit.
  { state: 'MN', slug: 'democrats-win-2026-minnesota-gubern' },
  // RI has no usable market (independent Ken Block polls second); see the
  // creation manifest.
]

// Candidate ("who will be elected") markets for marquee governor races, surfaced
// in the state detail card so people see and trade the actual candidates.
export const governorCandidates2026: StateElectionMarket[] = [
  // Audit: Conflux's market has stated call/certification rules and real depth.
  { state: 'CA', slug: 'who-will-win-the-2026-california-gu' },
  // NY card removed: it lists Delgado and Stefanik (both out) and not the
  // Republican nominee Bruce Blakeman.
]

// DEV REHEARSAL ONLY: prefer the markets create-election-markets.ts made on dev.
for (const m of DEV_LAUNCH_GOVERNORS) {
  const i = governors2026.findIndex((x) => x.state === m.state)
  if (i >= 0) governors2026.splice(i, 1, m)
  else governors2026.push(m)
}
