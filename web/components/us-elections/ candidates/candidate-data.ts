export type CandidateDataType = {
  party: 'Democrat' | 'Republican' | 'Libertarian' | 'Green' | 'Independent'
  photo: string
  shortName: string
}

export const CANDIDATE_DATA: Record<string, CandidateDataType> = {
  'Joe Biden': {
    party: 'Democrat',
    photo: '/political-candidates/biden.png',
    shortName: 'Biden',
  },
  'Kamala Harris': {
    party: 'Democrat',
    photo: '/political-candidates/harris.png',
    shortName: 'Harris',
  },
  'Gretchen Whitmer': {
    party: 'Democrat',
    photo: '/political-candidates/whitmer.png',
    shortName: 'Whitmer',
  },
  'Gavin Newsom': {
    party: 'Democrat',
    photo: '/political-candidates/newsom.png',
    shortName: 'Newsom',
  },
  'Robert F. Kennedy': {
    party: 'Democrat',
    photo: '/political-candidates/kennedy.png',
    shortName: 'Kennedy',
  },
  'Dean Phillips': {
    party: 'Democrat',
    photo: '/political-candidates/phillips.png',
    shortName: 'Phillips',
  },
  'Donald Trump': {
    party: 'Republican',
    photo: '/political-candidates/trump.png',
    shortName: 'Trump',
  },
  'Nikki Haley': {
    party: 'Republican',
    photo: '/political-candidates/haley.png',
    shortName: 'Haley',
  },
  'Ron DeSantis': {
    party: 'Republican',
    photo: '/political-candidates/desantis.png',
    shortName: 'DeSantis',
  },
  'Vivek Ramaswamy': {
    party: 'Republican',
    photo: '/political-candidates/ramaswamy.png',
    shortName: 'Ramaswamy',
  },
  'Hillary Clinton': {
    party: 'Democrat',
    photo: '/political-candidates/clinton.png',
    shortName: 'Clinton',
  },
  'Chris Christie': {
    party: 'Republican',
    photo: '/political-candidates/christie.png',
    shortName: 'Christie',
  },
  'Mike Pence': {
    party: 'Republican',
    photo: '/political-candidates/pence.avif',
    shortName: 'Pence',
  },
  'Tucker Carlson': {
    party: 'Republican',
    photo: '/political-candidates/carlson.png',
    shortName: 'Carlson',
  },
  'Tim Scott': {
    party: 'Republican',
    photo: '/political-candidates/scott.png',
    shortName: 'Scott',
  },
  'Asa Hutchinson': {
    party: 'Republican',
    photo: '/political-candidates/hutchinson.png',
    shortName: 'Hutchinson',
  },
  'Ted Cruz': {
    party: 'Republican',
    photo: '/political-candidates/cruz.png',
    shortName: 'Cruz',
  },
}
