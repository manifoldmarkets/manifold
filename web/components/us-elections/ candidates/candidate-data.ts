export type CandidateDataType = {
  party: 'Democrat' | 'Republican' | 'Other'
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
  'Robert F. Kennedy Jr.': {
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
  'Ron Desantis': {
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
    photo: '/political-candidates/pence.png',
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
  'Elise Stefanik': {
    party: 'Republican',
    photo: '/political-candidates/stefanik.png',
    shortName: 'Stefanik',
  },
  'Kristi Noem': {
    party: 'Republican',
    photo: '/political-candidates/noem.png',
    shortName: 'Noem',
  },
  'J.D. Vance': {
    party: 'Republican',
    photo: '/political-candidates/vance.png',
    shortName: 'Vance',
  },
  'Lee Zeldin': {
    party: 'Republican',
    photo: '/political-candidates/zeldin.png',
    shortName: 'Zeldin',
  },
  'Sarah Huckabee Sanders': {
    party: 'Republican',
    photo: '/political-candidates/sanders.png',
    shortName: 'Sanders',
  },
  'Doug Burgum': {
    party: 'Republican',
    photo: '/political-candidates/burgum.png',
    shortName: 'Burgum',
  },
  'Tulsi Gabbard': {
    party: 'Other',
    photo: '/political-candidates/gabbard.png',
    shortName: 'Gabbard',
  },
  'Ben Carson': {
    party: 'Republican',
    photo: '/political-candidates/carson.png',
    shortName: 'Carson',
  },
  'Kari Lake': {
    party: 'Republican',
    photo: '/political-candidates/lake.png',
    shortName: 'Lake',
  },
  'Pete Buttigieg': {
    party: 'Democrat',
    photo: '/political-candidates/buttigieg.png',
    shortName: 'Buttigieg',
  },
  'Raphael Warnock': {
    party: 'Democrat',
    photo: '/political-candidates/warnock.png',
    shortName: 'Warnock',
  },
  'Michelle Obama': {
    party: 'Democrat',
    photo: '/political-candidates/mobama.png',
    shortName: 'M. Obama',
  },
  'Beto O’Rourke': {
    party: 'Democrat',
    photo: '/political-candidates/orourke.png',
    shortName: 'O’Rourke',
  },
  'Barack Obama': {
    party: 'Democrat',
    photo: '/political-candidates/bobama.png',
    shortName: 'Obama',
  },
  'Andy Beshear': {
    party: 'Democrat',
    photo: '/political-candidates/beshear.png',
    shortName: 'Beshear',
  },
  'Hakeem Jeffries': {
    party: 'Democrat',
    photo: '/political-candidates/jeffries.png',
    shortName: 'Jeffries',
  },
  'J.B. Pritzker': {
    party: 'Democrat',
    photo: '/political-candidates/pritzker.png',
    shortName: 'Pritzker',
  },
  'Josh Shapiro': {
    party: 'Democrat',
    photo: '/political-candidates/shapiro.png',
    shortName: 'Shapiro',
  },
  'Jared Polis': {
    party: 'Democrat',
    photo: '/political-candidates/polis.png',
    shortName: 'Polis',
  },
  'Glenn Youngkin': {
    party: 'Republican',
    photo: '/political-candidates/youngkin.png',
    shortName: 'Youngkin',
  },
  'Greg Abbott': {
    party: 'Republican',
    photo: '/political-candidates/abbott.png',
    shortName: 'Abbott',
  },
  'Marco Rubio': {
    party: 'Republican',
    photo: '/political-candidates/rubio.png',
    shortName: 'Rubio',
  },
  'Mark Kelly': {
    party: 'Democrat',
    photo: '/political-candidates/kelly.png',
    shortName: 'Kelly',
  },
  'Roy Cooper': {
    party: 'Democrat',
    photo: '/political-candidates/cooper.png',
    shortName: 'Cooper',
  },
  'Tim Walz': {
    party: 'Democrat',
    photo: '/political-candidates/walz.png',
    shortName: 'Walz',
  },
  'JD Vance': {
    party: 'Republican',
    photo: '/political-candidates/vance.png',
    shortName: 'Vance',
  },
  'William McRaven': {
    party: 'Other',
    photo: '/political-candidates/mcraven.png',
    shortName: 'McRaven',
  },
  'Alexandria Ocasio-Cortez': {
    party: 'Democrat',
    photo: '/political-candidates/aoc.png',
    shortName: 'AOC',
  },
  'Jon Ossoff': {
    party: 'Democrat',
    photo: '/political-candidates/ossoff.png',
    shortName: 'Ossoff',
  },
  // Added Nov 2026 for the 2028 page. Photos and licences:
  // web/public/political-candidates/credits.json.
  'Ro Khanna': {
    party: 'Democrat',
    photo: '/political-candidates/khanna.png',
    shortName: 'Khanna',
  },
  'Wes Moore': {
    party: 'Democrat',
    photo: '/political-candidates/moore.png',
    shortName: 'Moore',
  },
  'Bernie Sanders': {
    party: 'Democrat',
    photo: '/political-candidates/bsanders.png',
    shortName: 'Bernie',
  },
  'Hunter Biden': {
    party: 'Democrat',
    photo: '/political-candidates/hbiden.png',
    shortName: 'H. Biden',
  },
  'Donald Trump Jr.': {
    party: 'Republican',
    photo: '/political-candidates/trumpjr.png',
    shortName: 'Trump Jr.',
  },
  'Thomas Massie': {
    party: 'Republican',
    photo: '/political-candidates/massie.png',
    shortName: 'Massie',
  },
  'Brian Kemp': {
    party: 'Republican',
    photo: '/political-candidates/kemp.png',
    shortName: 'Kemp',
  },
  'Ivanka Trump': {
    party: 'Republican',
    photo: '/political-candidates/itrump.png',
    shortName: 'Ivanka',
  },
  'Marjorie Taylor Greene': {
    party: 'Republican',
    photo: '/political-candidates/greene.png',
    shortName: 'Greene',
  },
  'Josh Hawley': {
    party: 'Republican',
    photo: '/political-candidates/hawley.png',
    shortName: 'Hawley',
  },
  'Chris Van Hollen': {
    party: 'Democrat',
    photo: '/political-candidates/vanhollen.png',
    shortName: 'Van Hollen',
  },
  'Amy Klobuchar': {
    party: 'Democrat',
    photo: '/political-candidates/klobuchar.png',
    shortName: 'Klobuchar',
  },
  'Mike Johnson': {
    party: 'Republican',
    photo: '/political-candidates/mjohnson.png',
    shortName: 'Johnson',
  },
  'Abigail Spanberger': {
    party: 'Democrat',
    photo: '/political-candidates/spanberger.png',
    shortName: 'Spanberger',
  },
  'Chris Murphy': {
    party: 'Democrat',
    photo: '/political-candidates/cmurphy.png',
    shortName: 'C. Murphy',
  },
  'James Talarico': {
    party: 'Democrat',
    photo: '/political-candidates/talarico.png',
    shortName: 'Talarico',
  },
  'Elissa Slotkin': {
    party: 'Democrat',
    photo: '/political-candidates/slotkin.png',
    shortName: 'Slotkin',
  },
  'Ruben Gallego': {
    party: 'Democrat',
    photo: '/political-candidates/gallego.png',
    shortName: 'Gallego',
  },
  'Cory Booker': {
    party: 'Democrat',
    photo: '/political-candidates/booker.png',
    shortName: 'Booker',
  },
  'Tom Cotton': {
    party: 'Republican',
    photo: '/political-candidates/cotton.png',
    shortName: 'Cotton',
  },
  'Elizabeth Warren': {
    party: 'Democrat',
    photo: '/political-candidates/warren.png',
    shortName: 'Warren',
  },
  'Jasmine Crockett': {
    party: 'Democrat',
    photo: '/political-candidates/crockett.png',
    shortName: 'Crockett',
  },
  'Eric Trump': {
    party: 'Republican',
    photo: '/political-candidates/etrump.png',
    shortName: 'E. Trump',
  },
  'Adam Kinzinger': {
    party: 'Other',
    photo: '/political-candidates/kinzinger.png',
    shortName: 'Kinzinger',
  },
  'Rahm Emanuel': {
    party: 'Democrat',
    photo: '/political-candidates/emanuel.png',
    shortName: 'Emanuel',
  },
  'Gina Raimondo': {
    party: 'Democrat',
    photo: '/political-candidates/raimondo.png',
    shortName: 'Raimondo',
  },
  'Mitch Landrieu': {
    party: 'Democrat',
    photo: '/political-candidates/landrieu.png',
    shortName: 'Landrieu',
  },
  'John N. Kennedy': {
    party: 'Republican',
    photo: '/political-candidates/jnkennedy.png',
    shortName: 'J.N. Kennedy',
  },
  'Rand Paul': {
    party: 'Republican',
    photo: '/political-candidates/paul.png',
    shortName: 'Paul',
  },
  'Josh Green': {
    party: 'Democrat',
    photo: '/political-candidates/green.png',
    shortName: 'Green',
  },
  'Kirsten Gillibrand': {
    party: 'Democrat',
    photo: '/political-candidates/gillibrand.png',
    shortName: 'Gillibrand',
  },
  'Greg Casar': {
    party: 'Democrat',
    photo: '/political-candidates/casar.png',
    shortName: 'Casar',
  },
  'Ritchie Torres': {
    party: 'Democrat',
    photo: '/political-candidates/torres.png',
    shortName: 'Torres',
  },
  'Andrew Yang': {
    party: 'Other',
    photo: '/political-candidates/yang.png',
    shortName: 'Yang',
  },
  'Mitt Romney': {
    party: 'Republican',
    photo: '/political-candidates/romney.png',
    shortName: 'Romney',
  },
  'Byron Donalds': {
    party: 'Republican',
    photo: '/political-candidates/donalds.png',
    shortName: 'Donalds',
  },
  'Phil Murphy': {
    party: 'Democrat',
    photo: '/political-candidates/pmurphy.png',
    shortName: 'P. Murphy',
  },
  'Josh Stein': {
    party: 'Democrat',
    photo: '/political-candidates/stein.png',
    shortName: 'Stein',
  },
  'Andy Kim': {
    party: 'Democrat',
    photo: '/political-candidates/kim.png',
    shortName: 'Kim',
  },
  'Pete Hegseth': {
    party: 'Republican',
    photo: '/political-candidates/hegseth.png',
    shortName: 'Hegseth',
  },
}
