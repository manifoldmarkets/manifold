export type CandidateDataType = {
  party: 'Democrat' | 'Republican' | 'Libertarian' | 'Green' | 'Independent'
  photo: string
}

export const CANDIDATE_DATA: Record<string, CandidateDataType> = {
  'Joe Biden': {
    party: 'Democrat',
    photo: 'web/components/us-elections/candidates/photos/biden.avif',
  },
  'Kamala Harris': {
    party: 'Democrat',
    photo: 'web/components/us-elections/candidates/photos/harris.png',
  },
  'Gretchen Whitmer': {
    party: 'Democrat',
    photo: 'web/components/us-elections/candidates/photos/whitmer.png',
  },
  'Gavin Newsom': {
    party: 'Democrat',
    photo: 'web/components/us-elections/candidates/photos/newsom.png',
  },
  'Robert F. Kennedy': {
    party: 'Democrat',
    photo: 'web/components/us-elections/candidates/photos/kennedy.png',
  },
  'Dean Phillips': {
    party: 'Democrat',
    photo: 'web/components/us-elections/candidates/photos/phillips.png',
  },
  'Donald Trump': {
    party: 'Republican',
    photo: 'web/components/us-elections/candidates/photos/trump.png',
  },
  'Nikki Haley': {
    party: 'Republican',
    photo: 'web/components/us-elections/candidates/photos/haley.png',
  },
  'Ron DeSantis': {
    party: 'Republican',
    photo: 'web/components/us-elections/candidates/photos/desantis.png',
  },
  'Vivek Ramaswamy': {
    party: 'Republican',
    photo: 'web/components/us-elections/candidates/photos/ramaswamy.png',
  },
  'Hillary Clinton': {
    party: 'Democrat',
    photo: 'web/components/us-elections/candidates/photos/clinton.png',
  },
  'Chris Christie': {
    party: 'Republican',
    photo: 'web/components/us-elections/candidates/photos/christie.png',
  },
  'Mike Pence': {
    party: 'Republican',
    photo: 'web/components/us-elections/candidates/photos/pence.avif',
  },
  'Tucker Carlson': {
    party: 'Republican',
    photo: 'web/components/us-elections/candidates/photos/carlson.png',
  },
  'Tim Scott': {
    party: 'Republican',
    photo: 'web/components/us-elections/candidates/photos/scott.png',
  },
  'Asa Hutchinson': {
    party: 'Republican',
    photo: 'web/components/us-elections/candidates/photos/hutchinson.png',
  },
  'Ted Cruz': {
    party: 'Republican',
    photo: 'web/components/us-elections/candidates/photos/cruz.png',
  },
}
