import { Contract } from 'common/contract'

type PolicyDataType = {
  title: string
  bidenSlug: string
  trumpSlug: string
}

export type PolicyContractType = {
  title: string
  bidenContract: Contract
  trumpContract: Contract
}

export const PolicyData: PolicyDataType[] = [
  {
    title: 'Will undocumented immigration at the southern border go down?',
    bidenSlug: 'if-biden-wins-will-immigration-go-d',
    trumpSlug: 'if-trump-wins-will-immigration-go-d',
  },
  {
    title: 'Will the president appoint another SCOTUS Justice before 2027?',
    bidenSlug: 'if-biden-wins-will-he-appoint-anoth',
    trumpSlug: 'if-trump-wins-will-he-appoint-anoth',
  },
  {
    title: 'Will marijuana be federally rescheduled from Schedule 1 drug?',
    trumpSlug: 'if-trump-wins-will-marijuana-be-fed',
    bidenSlug: 'if-biden-wins-will-marijuana-be-fed',
  },
  {
    title: 'Will there be a ceasefire in Ukraine before the 2026 midterms?',
    trumpSlug: 'if-trump-is-elected-will-there-be-a-40ca39e5dcec',
    bidenSlug: 'if-biden-is-elected-will-there-be-a-661b053b75e6',
  },
  {
    title:
      'Will there be an executive order or legislation focused on AI before the 2026 midterms?',
    bidenSlug: 'if-biden-is-elected-will-there-be-a-82eff624bd35',
    trumpSlug: 'if-trump-is-elected-will-there-be-a-01a15c4aa239',
  },
  // {
  //   title: 'Will gas prices go under $3 a gallon before the midterms?',
  //   bidenSlug: 'if-biden-is-reelected-president-wil-8dff8b112d5',
  //   trumpSlug: 'if-trump-becomes-president-will-gas-1c526c9c6b65',
  // },
  {
    title: 'Will gas prices stay under $4 a gallon before the midterms?',
    bidenSlug: 'if-biden-is-reelected-president-wil',
    trumpSlug: 'if-trump-becomes-president-will-gas',
  },
  {
    title: 'Will the inflation rate in 2025 be below 2.5%? (Current 3.2%)',
    trumpSlug: 'if-trump-wins-the-election-will-the',
    bidenSlug: 'if-biden-wins-the-election-will-inf',
  },
  {
    title: 'Will the US enter a recession before 2027?',
    trumpSlug: 'if-trump-wins-will-the-us-enter-a-r',
    bidenSlug: 'if-biden-wins-will-the-us-enter-a-r',
  },
  {
    title: 'Gallup satisfaction poll greater than Obama',
    bidenSlug: 'if-biden-is-reelected-will-he-make',
    trumpSlug: 'if-trump-becomes-president-will-he',
  },
  {
    title: 'Will annual US CO2 emissions be below 4.5 billion tons in 2030?',
    trumpSlug: 'carbon-brief-forecast-if-trump-wins',
    bidenSlug: 'carbon-brief-forecast-if-biden-wins',
  },
  {
    title: 'Will Donald Trump serve time in 2025?',
    trumpSlug: 'if-donald-trump-wins-the-election-w',
    bidenSlug: 'if-donald-trump-loses-the-election',
  },
]
