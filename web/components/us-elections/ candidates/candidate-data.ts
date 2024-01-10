export type CandidateDataType = {
  party: 'Democrat' | 'Republican' | 'Libertarian' | 'Green' | 'Independent'
  photo: string
}

export const CANDIDATE_DATA: Record<string, CandidateDataType> = {
  'Joe Biden': {
    party: 'Democrat',
    photo: '/political-candidates/biden.avif',
  },
  'Kamala Harris': {
    party: 'Democrat',
    photo: '/political-candidates/harris.png',
  },
  'Gretchen Whitmer': {
    party: 'Democrat',
    photo: '/political-candidates/whitmer.png',
  },
  'Gavin Newsom': {
    party: 'Democrat',
    photo: '/political-candidates/newsom.png',
  },
  'Robert F. Kennedy': {
    party: 'Democrat',
    photo: '/political-candidates/kennedy.png',
  },
  'Dean Phillips': {
    party: 'Democrat',
    photo: '/political-candidates/phillips.png',
  },
  'Donald Trump': {
    party: 'Republican',
    photo: '/political-candidates/trump.png',
  },
  'Nikki Haley': {
    party: 'Republican',
    photo: '/political-candidates/haley.png',
  },
  'Ron DeSantis': {
    party: 'Republican',
    photo: '/political-candidates/desantis.png',
  },
  'Vivek Ramaswamy': {
    party: 'Republican',
    photo: '/political-candidates/ramaswamy.png',
  },
  'Hillary Clinton': {
    party: 'Democrat',
    photo: '/political-candidates/clinton.png',
  },
  'Chris Christie': {
    party: 'Republican',
    photo: '/political-candidates/christie.png',
  },
  'Mike Pence': {
    party: 'Republican',
    photo: '/political-candidates/pence.avif',
  },
  'Tucker Carlson': {
    party: 'Republican',
    photo: '/political-candidates/carlson.png',
  },
  'Tim Scott': {
    party: 'Republican',
    photo: '/political-candidates/scott.png',
  },
  'Asa Hutchinson': {
    party: 'Republican',
    photo: '/political-candidates/hutchinson.png',
  },
  'Ted Cruz': {
    party: 'Republican',
    photo: '/political-candidates/cruz.png',
  },
}
