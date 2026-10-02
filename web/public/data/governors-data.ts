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
  { state: 'IA', slug: 'which-party-wins-the-2026-iowa-gove' },
  { state: 'NV', slug: 'which-party-will-win-the-2026-nevad' },
  { state: 'AR', slug: 'which-party-will-win-the-arkansas-g' },
  { state: 'NH', slug: 'which-party-will-win-the-2026-new-h-2UlpPIy0NQ' },
  { state: 'NE', slug: 'which-party-will-win-the-2026-nebra-hCZdznyt5s' },
  { state: 'CO', slug: 'which-party-will-in-the-2026-colora' },
  { state: 'NM', slug: 'which-party-will-win-the-2026-new-m-EyudAL0LqQ' },
  // Reviewed October 2: Michigan includes party nominees, Duggan and Other;
  // Florida explicitly asks about a Republican general-election winner.
  { state: 'MI', slug: 'who-will-the-2026-michigan-governor' },
  { state: 'FL', slug: 'will-a-republican-win-the-florida-g' },
  // Named general-election winners. Descriptions link the relevant election;
  // creator comments explicitly request dashboard inclusion. Replacement and
  // cancellation criteria remain unspecified; these are not party contracts.
  { state: 'KS', slug: '2026-kansas-governor-election-winne' },
  { state: 'OH', slug: '2026-ohio-governor-election-winner' },
  { state: 'OR', slug: '2026-oregon-governor-election-winne' },
]

// Candidate ("who will be elected") markets for marquee governor races, surfaced
// in the state detail card so people see and trade the actual candidates.
export const governorCandidates2026: StateElectionMarket[] = [
  { state: 'CA', slug: 'who-will-be-elected-governor-of-cal' },
  { state: 'NY', slug: 'who-will-be-elected-governor-of-new' },
]
