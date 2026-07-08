import { StateElectionMarket } from './elections-data'

export const senate2024: StateElectionMarket[] = [
  {
    state: 'AZ',
    slug: 'which-party-will-win-the-us-senate',
  },
  {
    state: 'CA',
    slug: 'which-party-will-win-the-us-senate-2b64764fca8f',
    additionalSlugs: ['which-party-will-win-the-us-senate-9e94af964b01'],
  },
  {
    state: 'CT',
    slug: 'which-party-will-win-the-us-senate-321c568d093a',
  },
  {
    state: 'DE',
    slug: 'which-party-will-win-the-us-senate-89874b11ebec',
  },
  {
    state: 'FL',
    slug: 'which-party-will-win-the-us-senate-3e1923e2f7b1',
  },
  {
    state: 'HI',
    slug: 'which-party-will-win-the-us-senate-441f0e4d88f7',
  },
  {
    state: 'IN',
    slug: 'which-party-will-win-the-us-senate-f415a4f01ca7',
  },
  {
    state: 'MA',
    slug: 'which-party-will-win-the-us-senate-008840091f7f',
  },
  {
    state: 'MD',
    slug: 'which-party-will-win-the-us-senate-f86a540383d7',
  },
  {
    state: 'ME',
    slug: 'which-party-will-win-the-us-senate-0c5f42942065',
    otherParty: 'Democratic Party',
  },
  {
    state: 'MI',
    slug: 'which-party-will-win-the-us-senate-7f74a016ea6d',
  },
  {
    state: 'MN',
    slug: 'which-party-will-win-the-us-senate-54b354ef1d48',
  },
  {
    state: 'MO',
    slug: 'which-party-will-win-the-us-senate-5002222f91cf',
  },
  {
    state: 'MS',
    slug: 'which-party-will-win-the-us-senate-1aefd5764365',
  },
  {
    state: 'MT',
    slug: 'which-party-will-win-the-us-senate-1487b7135606',
  },
  {
    state: 'ND',
    slug: 'which-party-will-win-the-us-senate-6435fa51f138',
  },
  {
    state: 'NE',
    slug: 'which-party-will-win-the-us-senate-e04ebb9536b1',
    additionalSlugs: ['which-party-will-win-the-us-senate-78078f7ff791'],
  },
  {
    state: 'NJ',
    slug: 'which-party-will-win-the-us-senate-9f25a0cb649f',
  },
  {
    state: 'NM',
    slug: 'which-party-will-win-the-us-senate-5337f3d2b9f3',
  },
  {
    state: 'NV',
    slug: 'which-party-will-win-the-us-senate-c37346690ded',
  },
  {
    state: 'NY',
    slug: 'which-party-will-win-the-us-senate-3a6777bbcdc0',
  },
  {
    state: 'OH',
    slug: 'which-party-will-win-the-us-senate-dc2772a021f2',
  },
  {
    state: 'PA',
    slug: 'which-party-will-win-the-us-senate-f532d1911a4a',
  },
  {
    state: 'RI',
    slug: 'which-party-will-win-the-us-senate-54a3abdb7d30',
  },
  {
    state: 'TN',
    slug: 'which-party-will-win-the-us-senate-60334dd279e7',
  },
  {
    state: 'TX',
    slug: 'which-party-will-win-the-us-senate-a20d3315c939',
  },
  {
    state: 'UT',
    slug: 'which-party-will-win-the-us-senate-53ad17f67f8f',
  },
  {
    state: 'VA',
    slug: 'which-party-will-win-the-us-senate-82b0f2f38917',
  },
  {
    state: 'VT',
    slug: 'which-party-will-win-the-us-senate-671f45a6f661',
    otherParty: 'Democratic Party',
  },
  {
    state: 'WA',
    slug: 'which-party-will-win-the-us-senate-c49351e24df6',
  },
  {
    state: 'WI',
    slug: 'which-party-will-win-the-us-senate-64264277f438',
  },
  {
    state: 'WV',
    slug: 'which-party-will-win-the-us-senate-8a2cb35530af',
  },
  {
    state: 'WY',
    slug: 'which-party-will-win-the-us-senate-38fbe6b30c6e',
  },
]

// 2026 midterm Senate races (Class 2 seats + the OH/VA/FL specials). These are
// community-created "which party will win" markets — the best-trafficked
// party-outcome market per state as of the 2026 rebuild. Answer labels vary
// across creators ("Democrats" / "Democratic party" / "Democratic"); the map's
// getPartyProbs() normalizes them, so any of these render correctly.
export const senate2026: StateElectionMarket[] = [
  { state: 'AL', slug: 'which-party-will-win-the-2026-alaba' },
  { state: 'AK', slug: 'which-party-will-win-the-2026-alask' },
  { state: 'AR', slug: 'what-party-will-win-the-2026-arkans' },
  { state: 'CO', slug: 'which-party-will-win-the-2026-color' },
  { state: 'DE', slug: 'which-party-will-win-the-2026-delaw' },
  // FL: special election for Marco Rubio's seat (Ashley Moody appointed).
  // Binary market — YES = Republican wins, which getPartyProbs handles.
  { state: 'FL', slug: 'will-a-republican-win-the-us-senate' },
  { state: 'GA', slug: 'which-party-will-win-the-2026-us-se' },
  { state: 'ID', slug: 'which-party-will-win-the-2026-idaho' },
  { state: 'IL', slug: 'which-party-will-win-the-2026-illin' },
  { state: 'IA', slug: 'which-party-will-win-the-2026-iowa' },
  { state: 'KS', slug: 'which-party-will-win-the-2026-kansa' },
  { state: 'KY', slug: 'which-party-will-win-the-kentucky-s' },
  { state: 'LA', slug: 'which-party-will-win-the-2026-louis' },
  { state: 'ME', slug: 'which-party-will-win-the-2026-maine' },
  { state: 'MA', slug: 'which-party-will-win-the-2026-us-se-dqI00SN65q' },
  { state: 'MI', slug: 'which-party-will-win-the-2026-michi' },
  { state: 'MN', slug: 'which-party-will-win-the-2026-senat-RLNdnAsdEg' },
  { state: 'MS', slug: 'which-party-will-win-the-2026-missi' },
  { state: 'MT', slug: 'which-party-will-win-the-2026-monta' },
  // NE: front-runner is independent Dan Osborn, who reads as "other" on the
  // map rather than a party color — known imperfection of reusing this market.
  { state: 'NE', slug: 'which-party-will-win-the-2026-nebra' },
  { state: 'NH', slug: 'which-party-will-win-the-2026-new-h' },
  { state: 'NJ', slug: 'which-party-will-win-the-2026-senat-L2SAyPRu9l' },
  { state: 'NM', slug: 'which-party-will-win-the-2026-new-m' },
  { state: 'NC', slug: 'which-party-will-win-the-2026-north' },
  // OH: special election for JD Vance's seat.
  { state: 'OH', slug: 'which-party-will-win-the-2026-us-se-pUEyL0RC5y' },
  { state: 'OK', slug: 'which-party-will-win-the-2026-senat-uSIZt2dAUq' },
  { state: 'OR', slug: 'which-party-will-win-the-2026-us-se-ltdn9uyhqI' },
  { state: 'RI', slug: 'which-party-will-win-the-2026-us-se-npU0Adq2gh' },
  { state: 'SC', slug: 'which-party-will-win-the-2026-south' },
  { state: 'SD', slug: 'which-party-will-win-the-2026-senat-OCp8sREOUZ' },
  { state: 'TN', slug: 'which-party-will-win-the-2026-senat-I2ZRR8czlU' },
  { state: 'TX', slug: 'which-party-will-win-the-2026-texas' },
  { state: 'VA', slug: 'which-party-will-win-the-2026-senat-p2Q8cz2qqZ' },
  { state: 'WV', slug: 'which-party-will-will-the-2026-us-s' },
  { state: 'WY', slug: 'which-party-will-win-the-2026-senat-OdACN5q9PP' },
]

// Candidate ("who will win") markets for marquee Senate races, surfaced in the
// state detail card so people see and trade the actual candidates, not just the
// party. Only races with a liquid general-election candidate market.
export const senateCandidates2026: StateElectionMarket[] = [
  { state: 'TX', slug: 'who-will-win-the-2026-senate-electi' },
  { state: 'ME', slug: 'who-will-maines-us-senate-election' },
  { state: 'MN', slug: 'who-will-win-minnesotas-2026-senate' },
  { state: 'OH', slug: 'who-will-win-the-2026-united-states' },
  { state: 'IA', slug: 'who-will-win-the-2026-united-states-u09U0PqQSn' },
  { state: 'MT', slug: 'who-will-the-2026-montana-senate-el' },
]

export interface CurrentSenateState {
  state: string
  name1: string
  name2: string
  party1: 'Democrat' | 'Republican'
  party2: 'Democrat' | 'Republican'
}

export const currentSenate: CurrentSenateState[] = [
  {
    state: 'AL',
    name1: 'Tommy Tuberville',
    party1: 'Republican',
    name2: 'Katie Boyd Britt',
    party2: 'Republican',
  },
  {
    state: 'AK',
    name1: 'Lisa Murkowski',
    party1: 'Republican',
    name2: 'Dan Sullivan',
    party2: 'Republican',
  },
  {
    state: 'AR',
    name1: 'Tom Cotton',
    party1: 'Republican',
    name2: 'John Boozman',
    party2: 'Republican',
  },
  {
    state: 'CO',
    name1: 'Michael F. Bennet',
    party1: 'Democrat',
    name2: 'John W. Hickenlooper',
    party2: 'Democrat',
  },
  {
    state: 'GA',
    name1: 'Raphael Warnock',
    party1: 'Democrat',
    name2: 'Jon Ossoff',
    party2: 'Democrat',
  },
  {
    state: 'ID',
    name1: 'Mike Crapo',
    party1: 'Republican',
    name2: 'James E. Risch',
    party2: 'Republican',
  },
  {
    state: 'IL',
    name1: 'Tammy Duckworth',
    party1: 'Democrat',
    name2: 'Richard J. Durbin',
    party2: 'Democrat',
  },
  {
    state: 'IA',
    name1: 'Chuck Grassley',
    party1: 'Republican',
    name2: 'Joni Ernst',
    party2: 'Republican',
  },
  {
    state: 'KS',
    name1: 'Jerry Moran',
    party1: 'Republican',
    name2: 'Roger Marshall',
    party2: 'Republican',
  },
  {
    state: 'KY',
    name1: 'Rand Paul',
    party1: 'Republican',
    name2: 'Mitch McConnell',
    party2: 'Republican',
  },
  {
    state: 'LA',
    name1: 'John Kennedy',
    party1: 'Republican',
    name2: 'Bill Cassidy',
    party2: 'Republican',
  },
  {
    state: 'NH',
    name1: 'Margaret Wood Hassan',
    party1: 'Democrat',
    name2: 'Jeanne Shaheen',
    party2: 'Democrat',
  },
  {
    state: 'NC',
    name1: 'Ted Budd',
    party1: 'Republican',
    name2: 'Tom Tillis',
    party2: 'Republican',
  },
  {
    state: 'OK',
    name1: 'James Lankford',
    party1: 'Republican',
    name2: 'Markwayne Mullin',
    party2: 'Republican',
  },
  {
    state: 'OR',
    name1: 'Ron Wyden',
    party1: 'Democrat',
    name2: 'Jeff Merkley',
    party2: 'Democrat',
  },
  {
    state: 'SC',
    name1: 'Tim Scott',
    party1: 'Republican',
    name2: 'Lindsey Graham',
    party2: 'Republican',
  },
  {
    state: 'SD',
    name1: 'John Thune',
    party1: 'Republican',
    name2: 'Mike Rounds',
    party2: 'Republican',
  },
]

// States with NO Senate seat on the 2026 ballot (neither senator is up). These
// are the "safe" seats that flank the contested races in the projection bar and
// fill the map where there's no race. Parties reflect the Senate after the 2024
// election. Independents who caucus with Democrats (Sanders) are listed as
// 'Democrat' so the bar partitions them correctly.
export const currentSenate2026: CurrentSenateState[] = [
  {
    state: 'AZ',
    name1: 'Mark Kelly',
    party1: 'Democrat',
    name2: 'Ruben Gallego',
    party2: 'Democrat',
  },
  {
    state: 'CA',
    name1: 'Alex Padilla',
    party1: 'Democrat',
    name2: 'Adam Schiff',
    party2: 'Democrat',
  },
  {
    state: 'CT',
    name1: 'Richard Blumenthal',
    party1: 'Democrat',
    name2: 'Chris Murphy',
    party2: 'Democrat',
  },
  {
    state: 'HI',
    name1: 'Brian Schatz',
    party1: 'Democrat',
    name2: 'Mazie Hirono',
    party2: 'Democrat',
  },
  {
    state: 'IN',
    name1: 'Todd Young',
    party1: 'Republican',
    name2: 'Jim Banks',
    party2: 'Republican',
  },
  {
    state: 'MD',
    name1: 'Chris Van Hollen',
    party1: 'Democrat',
    name2: 'Angela Alsobrooks',
    party2: 'Democrat',
  },
  {
    state: 'MO',
    name1: 'Josh Hawley',
    party1: 'Republican',
    name2: 'Eric Schmitt',
    party2: 'Republican',
  },
  {
    state: 'NV',
    name1: 'Catherine Cortez Masto',
    party1: 'Democrat',
    name2: 'Jacky Rosen',
    party2: 'Democrat',
  },
  {
    state: 'NY',
    name1: 'Chuck Schumer',
    party1: 'Democrat',
    name2: 'Kirsten Gillibrand',
    party2: 'Democrat',
  },
  {
    state: 'ND',
    name1: 'John Hoeven',
    party1: 'Republican',
    name2: 'Kevin Cramer',
    party2: 'Republican',
  },
  {
    // Split delegation: Fetterman (D) and McCormick (R, won 2024).
    state: 'PA',
    name1: 'John Fetterman',
    party1: 'Democrat',
    name2: 'Dave McCormick',
    party2: 'Republican',
  },
  {
    state: 'UT',
    name1: 'Mike Lee',
    party1: 'Republican',
    name2: 'John Curtis',
    party2: 'Republican',
  },
  {
    // Sanders is an independent who caucuses with Democrats.
    state: 'VT',
    name1: 'Bernie Sanders',
    party1: 'Democrat',
    name2: 'Peter Welch',
    party2: 'Democrat',
  },
  {
    state: 'WA',
    name1: 'Patty Murray',
    party1: 'Democrat',
    name2: 'Maria Cantwell',
    party2: 'Democrat',
  },
  {
    // Split delegation: Baldwin (D) and Johnson (R).
    state: 'WI',
    name1: 'Tammy Baldwin',
    party1: 'Democrat',
    name2: 'Ron Johnson',
    party2: 'Republican',
  },
]

// For states WITH a 2026 Senate race: the OTHER seat (not on the 2026 ballot)
// and the party that currently holds it — so the state card can say "they
// already hold a seat, and this one is up for grabs". Parties reflect the
// Senate after the 2024 election.
export const senateHeldSeats2026: Record<
  string,
  { name: string; party: 'Democrat' | 'Republican' | 'Independent' }
> = {
  AL: { name: 'Katie Britt', party: 'Republican' },
  AK: { name: 'Lisa Murkowski', party: 'Republican' },
  AR: { name: 'John Boozman', party: 'Republican' },
  CO: { name: 'Michael Bennet', party: 'Democrat' },
  DE: { name: 'Lisa Blunt Rochester', party: 'Democrat' },
  FL: { name: 'Rick Scott', party: 'Republican' },
  GA: { name: 'Raphael Warnock', party: 'Democrat' },
  ID: { name: 'Mike Crapo', party: 'Republican' },
  IL: { name: 'Tammy Duckworth', party: 'Democrat' },
  IA: { name: 'Chuck Grassley', party: 'Republican' },
  KS: { name: 'Jerry Moran', party: 'Republican' },
  KY: { name: 'Rand Paul', party: 'Republican' },
  LA: { name: 'John Kennedy', party: 'Republican' },
  ME: { name: 'Angus King', party: 'Independent' },
  MA: { name: 'Elizabeth Warren', party: 'Democrat' },
  MI: { name: 'Elissa Slotkin', party: 'Democrat' },
  MN: { name: 'Amy Klobuchar', party: 'Democrat' },
  MS: { name: 'Roger Wicker', party: 'Republican' },
  MT: { name: 'Tim Sheehy', party: 'Republican' },
  NE: { name: 'Deb Fischer', party: 'Republican' },
  NH: { name: 'Maggie Hassan', party: 'Democrat' },
  NJ: { name: 'Andy Kim', party: 'Democrat' },
  NM: { name: 'Martin Heinrich', party: 'Democrat' },
  NC: { name: 'Ted Budd', party: 'Republican' },
  OH: { name: 'Bernie Moreno', party: 'Republican' },
  OK: { name: 'James Lankford', party: 'Republican' },
  OR: { name: 'Ron Wyden', party: 'Democrat' },
  RI: { name: 'Sheldon Whitehouse', party: 'Democrat' },
  SC: { name: 'Tim Scott', party: 'Republican' },
  SD: { name: 'John Thune', party: 'Republican' },
  TN: { name: 'Marsha Blackburn', party: 'Republican' },
  TX: { name: 'Ted Cruz', party: 'Republican' },
  VA: { name: 'Tim Kaine', party: 'Democrat' },
  WV: { name: 'Jim Justice', party: 'Republican' },
  WY: { name: 'John Barrasso', party: 'Republican' },
}
