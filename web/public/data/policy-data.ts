import { Contract } from 'common/contract'

type PolicyDataType = {
  title: string
  harrisSlug: string
  trumpSlug: string
}

export type PolicyContractType = {
  title: string
  harrisContract: Contract | null
  trumpContract: Contract | null
}

export const PolicyData: PolicyDataType[] = [
  {
    title: 'Will undocumented immigration at the southern border go down?',
    harrisSlug: 'if-harris-wins-will-undocumented-im',
    trumpSlug: 'if-trump-wins-will-immigration-go-d',
  },
  {
    title: 'Will the president appoint another SCOTUS Justice before 2027?',
    harrisSlug: 'if-harris-wins-will-she-appoint-ano',
    trumpSlug: 'if-trump-wins-will-he-appoint-anoth',
  },
  {
    title: 'Will marijuana be federally rescheduled from Schedule 1 drug?',
    harrisSlug: 'if-harris-wins-will-marijuana-be-fe',
    trumpSlug: 'if-trump-wins-will-marijuana-be-fed',
  },
  {
    title: 'Will there be a ceasefire in Ukraine before the 2026 midterms?',
    harrisSlug: 'if-harris-is-elected-will-there-be-1bw27ghde1',
    trumpSlug: 'if-trump-is-elected-will-there-be-a-40ca39e5dcec',
  },
  {
    title:
      'Will there be an executive order or legislation focused on AI before the 2026 midterms?',
    harrisSlug: 'if-harris-is-elected-will-there-be-uve99bjbbo',
    trumpSlug: 'if-trump-is-elected-will-there-be-a-01a15c4aa239',
  },
  // {
  //   title: 'Will gas prices go under $3 a gallon before the midterms?',
  //   bidenSlug: 'if-biden-is-reelected-president-wil-8dff8b112d5',
  //   trumpSlug: 'if-trump-becomes-president-will-gas-1c526c9c6b65',
  // },
  {
    title: 'Will gas prices stay under $4 a gallon before the midterms?',
    harrisSlug: 'if-harris-becomes-president-will-ga-rpkm0uqss8',
    trumpSlug: 'if-trump-becomes-president-will-gas',
  },
  {
    title: 'Will the inflation rate in 2025 be below 2.5%? (Current 3.2%)',
    harrisSlug: 'if-harris-wins-the-election-will-th',
    trumpSlug: 'if-trump-wins-the-election-will-the',
  },
  {
    title:
      'Will the US enter a recession before 2027? (as measured by Sahm rule)',
    harrisSlug: 'if-harris-wins-will-the-us-enter-a',
    trumpSlug: 'if-trump-wins-will-the-us-enter-a-r',
  },
  {
    title: 'Gallup satisfaction poll greater than Obama',
    harrisSlug: 'if-harris-becomes-president-will-sh',
    trumpSlug: 'if-trump-becomes-president-will-he',
  },
  {
    title: 'Will annual US CO2 emissions be below 4.5 billion tons in 2030?',
    harrisSlug: 'carbon-brief-forecast-if-harris-win',
    trumpSlug: 'carbon-brief-forecast-if-trump-wins',
  },
  {
    title: 'Will Donald Trump serve time in 2025?',
    harrisSlug: 'if-donald-trump-loses-the-election',
    trumpSlug: 'if-donald-trump-wins-the-election-w',
  },
]
