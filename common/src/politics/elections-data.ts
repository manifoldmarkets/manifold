import { Bet } from 'common/bet'
import { MultiSerializedPoints, SerializedPoint } from 'common/chart'
import { Contract } from 'common/contract'
import { LinkPreviews } from 'common/link-preview'
import { ChartAnnotation } from 'common/supabase/chart-annotations'

export interface StateElectionMarket {
  slug: string
  state: string
  additionalSlugs?: string[]
}
export const ELECTION_DASHBOARD_TITLE = '2024 Election Forecast'
export const ELECTION_DASHBOARD_DESCRIPTION =
  'Live market odds for the US presidential election'

export const NH_LINK =
  'https://www.cnn.com/2024/01/09/politics/cnn-new-hampshire-poll/index.html'
export const presidency2024: StateElectionMarket[] = [
  {
    state: 'AL',
    slug: 'which-party-will-win-the-us-preside-98654274ab42',
  },
  {
    state: 'AK',
    slug: 'which-party-will-win-the-us-preside-3834d8e5168f',
  },
  {
    state: 'AZ',
    slug: 'which-party-will-win-the-us-preside-c1307cf9f69a',
  },
  {
    state: 'AR',
    slug: 'which-party-will-win-the-us-preside-e845a612e2a4',
  },
  {
    state: 'CA',
    slug: 'which-party-will-win-the-us-preside-26a1eb1b8ce6',
  },
  {
    state: 'CO',
    slug: 'which-party-will-win-the-us-preside-995251995021',
  },
  {
    state: 'CT',
    slug: 'which-party-will-win-the-us-preside-12e8e8ae4aee',
  },
  {
    state: 'DC',
    slug: 'which-party-will-win-the-us-preside-11704714dec4',
  },
  {
    state: 'DE',
    slug: 'which-party-will-win-the-us-preside-86216dcc6ec8',
  },
  {
    state: 'FL',
    slug: 'which-party-will-win-the-us-preside-a0c0e217efb2',
  },
  {
    state: 'GA',
    slug: 'which-party-will-win-the-us-preside-9d5b554982a7',
  },
  {
    state: 'HI',
    slug: 'which-party-will-win-the-us-preside-878851234156',
  },
  {
    state: 'IA',
    slug: 'which-party-will-win-the-us-preside-31c9af68dec9',
  },
  {
    state: 'ID',
    slug: 'which-party-will-win-the-us-preside-e762820f4b34',
  },
  {
    state: 'IL',
    slug: 'which-party-will-win-the-us-preside-c506aa98d74d',
  },
  {
    state: 'IN',
    slug: 'which-party-will-win-the-us-preside-5414030a4a48',
  },
  {
    state: 'KS',
    slug: 'which-party-will-win-the-us-preside-4df471a7f5e3',
  },
  {
    state: 'KY',
    slug: 'which-party-will-win-the-us-preside-52290675de33',
  },
  {
    state: 'LA',
    slug: 'which-party-will-win-the-us-preside-7047ba212e02',
  },
  {
    state: 'MA',
    slug: 'which-party-will-win-the-us-preside-dcff5d64dbc8',
  },
  {
    state: 'MD',
    slug: 'which-party-will-win-the-us-preside-e43222661719',
  },
  // MAINE HAS MULTIPLES
  {
    state: 'ME',
    slug: 'which-party-will-win-the-us-preside-af574b601b0f',
  },
  {
    state: 'MI',
    slug: 'which-party-will-win-the-us-preside-7e7362326c95',
  },
  {
    state: 'MN',
    slug: 'which-party-will-win-the-us-preside-052a52f54c0e',
  },
  {
    state: 'MO',
    slug: 'which-party-will-win-the-us-preside-1ccd026993f1',
  },
  {
    state: 'MS',
    slug: 'which-party-will-win-the-us-preside-859f4dab533d',
  },
  {
    state: 'MT',
    slug: 'which-party-will-win-the-us-preside-5406455b109d',
  },
  {
    state: 'NC',
    slug: 'which-party-will-win-the-us-preside-c2b132de8821',
  },
  {
    state: 'ND',
    slug: 'which-party-will-win-the-us-preside-fab2b645d9d3',
  },
  // NEBRASKA HAS MULTIPLES
  {
    state: 'NE',
    slug: 'which-party-will-win-the-us-preside-3c332029e300',
  },
  {
    state: 'NH',
    slug: 'which-party-will-win-the-us-preside-458f2140827c',
  },
  {
    state: 'NJ',
    slug: 'which-party-will-win-the-us-preside-96f0176fbd5a',
  },
  {
    state: 'NM',
    slug: 'which-party-will-win-the-us-preside-c98c13402468',
  },
  {
    state: 'NV',
    slug: 'which-party-will-win-the-us-preside-5777ea10ce2a',
  },
  {
    state: 'NY',
    slug: 'which-party-will-win-the-us-preside-7c957d5b5e4c',
  },
  {
    state: 'OH',
    slug: 'which-party-will-win-the-us-preside-f2f89eddc252',
  },
  {
    state: 'OK',
    slug: 'which-party-will-win-the-us-preside-8144295e678c',
  },
  {
    state: 'OR',
    slug: 'which-party-will-win-the-us-preside-c24796f7ea73',
  },
  {
    state: 'PA',
    slug: 'which-party-will-win-the-us-preside',
  },
  {
    state: 'RI',
    slug: 'which-party-will-win-the-us-preside-f7998626f959',
  },
  {
    state: 'SC',
    slug: 'which-party-will-win-the-us-preside-f0e933a475d1',
  },
  {
    state: 'SD',
    slug: 'which-party-will-win-the-us-preside-bc361a1e7ca0',
  },
  {
    state: 'TN',
    slug: 'which-party-will-win-the-us-preside-a870c481a5ce',
  },
  {
    state: 'TX',
    slug: 'which-party-will-win-the-us-preside-2ad2e0596c59',
  },
  {
    state: 'UT',
    slug: 'which-party-will-win-the-us-preside-9cd88c5b9389',
  },
  {
    state: 'VA',
    slug: 'which-party-will-win-the-us-preside-6db80c968e21',
  },
  {
    state: 'VT',
    slug: 'which-party-will-win-the-us-preside-7b9db14c6562',
  },

  {
    state: 'WA',
    slug: 'which-party-will-win-the-us-preside-8b4af904766d',
  },
  {
    state: 'WI',
    slug: 'which-party-will-win-the-us-preside-ee07598f45ea',
  },
  {
    state: 'WV',
    slug: 'which-party-will-win-the-us-preside-3ffb4d1203a0',
  },
  {
    state: 'WY',
    slug: 'which-party-will-win-the-us-preside-686f75d3998e',
  },
]

export type MapContractsDictionary = {
  [key: string]: Contract | null
}

export type ElectionsPageProps = {
  rawMapContractsDictionary: MapContractsDictionary
  electionPartyContract: Contract | null
  electionCandidateContract: Contract | null
  republicanCandidateContract: Contract | null
  democratCandidateContract: Contract | null
  newHampshireContract: Contract | null
  republicanVPContract: Contract | null
  democraticVPContract: Contract | null
  linkPreviews: LinkPreviews
  partyChartParams?: ChartParams
}

export type ChartParams = {
  historyData: {
    bets: Bet[]
    points: MultiSerializedPoints | SerializedPoint<Partial<Bet>>[]
  }
  chartAnnotations: ChartAnnotation[]
}
