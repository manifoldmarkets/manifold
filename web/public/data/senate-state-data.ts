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
