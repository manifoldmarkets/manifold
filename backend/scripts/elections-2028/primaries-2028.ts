// Seed data for each party's 2028 primary in every 2028 U.S. Senate and
// governor race (Tod, 6 Nov 2026: "a few people + Other with the ability to
// add answers"). Researched from public reporting in November 2026; the
// candidates are starting points, and anyone can add more on the market.
//
// party: one market per party ("who will be the nominee"). top-two/top-four:
// one market per race ("who finishes first in the primary").

export type DownballotRace = {
  // 2028 unless set: Minnesota's Senate special is in 2027 (Minn. Stat.
  // 204D.28 holds it at the next November election, odd years included).
  year?: 2027 | 2028
  office: 'senate' | 'governor'
  state: string
  code: string
  special?: boolean
  system: 'party' | 'top-two' | 'top-four'
  // ISO date of the primary (or the runoff, where one decides the nominee);
  // markets close the day after. Unknown: the default close.
  decidedBy?: string
  markets: {
    party: 'Democratic' | 'Republican' | null
    candidates: { name: string; pct: number }[]
  }[]
  // Why these names and odds, in a sentence (the seed's basis).
  note: string
}

export const DOWNBALLOT_2028: DownballotRace[] = [
  {
    office: 'senate',
    state: 'Alabama',
    code: 'AL',
    system: 'party',
    decidedBy: '2028-05-16',
    markets: [
      {
        party: 'Democratic',
        candidates: [],
      },
      {
        party: 'Republican',
        candidates: [
          {
            name: 'Katie Britt',
            pct: 85,
          },
          {
            name: 'Dale Shelton Deas Jr.',
            pct: 2,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Katie Britt, running: unknown)',
  },
  {
    office: 'senate',
    state: 'Alaska',
    code: 'AK',
    system: 'top-four',
    decidedBy: '2028-08-16',
    markets: [
      {
        party: null,
        candidates: [
          {
            name: 'Lisa Murkowski',
            pct: 35,
          },
          {
            name: 'Mike Dunleavy',
            pct: 20,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Lisa Murkowski, running: unknown)',
  },
  {
    office: 'senate',
    state: 'Arizona',
    code: 'AZ',
    system: 'party',
    decidedBy: '2028-07-19',
    markets: [
      {
        party: 'Democratic',
        candidates: [
          {
            name: 'Mark Kelly',
            pct: 70,
          },
        ],
      },
      {
        party: 'Republican',
        candidates: [],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Mark Kelly, running: unknown)',
  },
  {
    office: 'senate',
    state: 'Arkansas',
    code: 'AR',
    system: 'party',
    decidedBy: '2028-05-16',
    markets: [
      {
        party: 'Democratic',
        candidates: [],
      },
      {
        party: 'Republican',
        candidates: [
          {
            name: 'John Boozman',
            pct: 75,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent John Boozman, running: unknown)',
  },
  {
    office: 'senate',
    state: 'California',
    code: 'CA',
    system: 'top-two',
    decidedBy: '2028-03-08',
    markets: [
      {
        party: null,
        candidates: [
          {
            name: 'Alex Padilla',
            pct: 75,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Alex Padilla, running: unknown)',
  },
  {
    office: 'senate',
    state: 'Colorado',
    code: 'CO',
    system: 'party',
    decidedBy: '2028-06-28',
    markets: [
      {
        party: 'Democratic',
        candidates: [
          {
            name: 'Michael Bennet',
            pct: 55,
          },
        ],
      },
      {
        party: 'Republican',
        candidates: [],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Michael Bennet, running: unknown)',
  },
  {
    office: 'senate',
    state: 'Connecticut',
    code: 'CT',
    system: 'party',
    decidedBy: '2028-09-29',
    markets: [
      {
        party: 'Democratic',
        candidates: [
          {
            name: 'Richard Blumenthal',
            pct: 82,
          },
        ],
      },
      {
        party: 'Republican',
        candidates: [],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Richard Blumenthal, running: yes)',
  },
  {
    office: 'senate',
    state: 'Florida',
    code: 'FL',
    system: 'party',
    decidedBy: '2028-08-23',
    markets: [
      {
        party: 'Democratic',
        candidates: [
          {
            name: 'Angie Nixon',
            pct: 20,
          },
          {
            name: 'Jared Moskowitz',
            pct: 20,
          },
        ],
      },
      {
        party: 'Republican',
        candidates: [
          {
            name: 'Ashley Moody',
            pct: 85,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Ashley Moody, running: unknown)',
  },
  {
    office: 'senate',
    state: 'Georgia',
    code: 'GA',
    system: 'party',
    decidedBy: '2028-08-01',
    markets: [
      {
        party: 'Democratic',
        candidates: [
          {
            name: 'Raphael Warnock',
            pct: 75,
          },
        ],
      },
      {
        party: 'Republican',
        candidates: [
          {
            name: 'Rich McCormick',
            pct: 20,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Raphael Warnock, running: unknown)',
  },
  {
    office: 'senate',
    state: 'Hawaii',
    code: 'HI',
    system: 'party',
    decidedBy: '2028-08-13',
    markets: [
      {
        party: 'Democratic',
        candidates: [
          {
            name: 'Brian Schatz',
            pct: 85,
          },
        ],
      },
      {
        party: 'Republican',
        candidates: [],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Brian Schatz, running: unknown)',
  },
  {
    office: 'senate',
    state: 'Idaho',
    code: 'ID',
    system: 'party',
    decidedBy: '2028-05-17',
    markets: [
      {
        party: 'Democratic',
        candidates: [],
      },
      {
        party: 'Republican',
        candidates: [
          {
            name: 'Mike Crapo',
            pct: 75,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Mike Crapo, running: unknown)',
  },
  {
    office: 'senate',
    state: 'Illinois',
    code: 'IL',
    system: 'party',
    decidedBy: '2028-03-22',
    markets: [
      {
        party: 'Democratic',
        candidates: [
          {
            name: 'Tammy Duckworth',
            pct: 82,
          },
        ],
      },
      {
        party: 'Republican',
        candidates: [],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Tammy Duckworth, running: unknown)',
  },
  {
    office: 'senate',
    state: 'Indiana',
    code: 'IN',
    system: 'party',
    decidedBy: '2028-05-03',
    markets: [
      {
        party: 'Democratic',
        candidates: [],
      },
      {
        party: 'Republican',
        candidates: [
          {
            name: 'Todd Young',
            pct: 72,
          },
          {
            name: 'Carlin Yoder',
            pct: 8,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Todd Young, running: unknown)',
  },
  {
    office: 'senate',
    state: 'Iowa',
    code: 'IA',
    system: 'party',
    decidedBy: '2028-08-15',
    markets: [
      {
        party: 'Democratic',
        candidates: [],
      },
      {
        party: 'Republican',
        candidates: [
          {
            name: 'Chuck Grassley',
            pct: 50,
          },
          {
            name: 'Pat Grassley',
            pct: 8,
          },
          {
            name: 'Kari Lake',
            pct: 5,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Chuck Grassley, running: unknown)',
  },
  {
    office: 'senate',
    state: 'Kansas',
    code: 'KS',
    system: 'party',
    decidedBy: '2028-08-02',
    markets: [
      {
        party: 'Democratic',
        candidates: [],
      },
      {
        party: 'Republican',
        candidates: [
          {
            name: 'Jerry Moran',
            pct: 82,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Jerry Moran, running: unknown)',
  },
  {
    office: 'senate',
    state: 'Kentucky',
    code: 'KY',
    system: 'party',
    decidedBy: '2028-05-17',
    markets: [
      {
        party: 'Democratic',
        candidates: [],
      },
      {
        party: 'Republican',
        candidates: [
          {
            name: 'Rand Paul',
            pct: 60,
          },
          {
            name: 'Nate Morris',
            pct: 7,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Rand Paul, running: unknown)',
  },
  {
    office: 'senate',
    state: 'Louisiana',
    code: 'LA',
    system: 'party',
    decidedBy: '2028-06-03',
    markets: [
      {
        party: 'Democratic',
        candidates: [],
      },
      {
        party: 'Republican',
        candidates: [
          {
            name: 'John Kennedy',
            pct: 82,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent John Kennedy, running: yes)',
  },
  {
    office: 'senate',
    state: 'Maryland',
    code: 'MD',
    system: 'party',
    decidedBy: '2028-04-26',
    markets: [
      {
        party: 'Democratic',
        candidates: [
          {
            name: 'Chris Van Hollen',
            pct: 75,
          },
        ],
      },
      {
        party: 'Republican',
        candidates: [],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Chris Van Hollen, running: unknown)',
  },
  {
    office: 'senate',
    state: 'Missouri',
    code: 'MO',
    system: 'party',
    decidedBy: '2028-08-09',
    markets: [
      {
        party: 'Democratic',
        candidates: [],
      },
      {
        party: 'Republican',
        candidates: [
          {
            name: 'Eric Schmitt',
            pct: 85,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Eric Schmitt, running: unknown)',
  },
  {
    office: 'senate',
    state: 'Nevada',
    code: 'NV',
    system: 'party',
    decidedBy: '2028-06-14',
    markets: [
      {
        party: 'Democratic',
        candidates: [
          {
            name: 'Catherine Cortez Masto',
            pct: 80,
          },
        ],
      },
      {
        party: 'Republican',
        candidates: [],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Catherine Cortez Masto, running: unknown)',
  },
  {
    office: 'senate',
    state: 'New Hampshire',
    code: 'NH',
    system: 'party',
    decidedBy: '2028-06-14',
    markets: [
      {
        party: 'Democratic',
        candidates: [
          {
            name: 'Maggie Hassan',
            pct: 82,
          },
        ],
      },
      {
        party: 'Republican',
        candidates: [],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Maggie Hassan, running: unknown)',
  },
  {
    office: 'senate',
    state: 'New York',
    code: 'NY',
    system: 'party',
    decidedBy: '2028-06-28',
    markets: [
      {
        party: 'Democratic',
        candidates: [
          {
            name: 'Alexandria Ocasio-Cortez',
            pct: 34,
          },
          {
            name: 'Chuck Schumer',
            pct: 30,
          },
          {
            name: 'Ritchie Torres',
            pct: 6,
          },
        ],
      },
      {
        party: 'Republican',
        candidates: [],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Chuck Schumer, running: unknown)',
  },
  {
    office: 'senate',
    state: 'North Carolina',
    code: 'NC',
    system: 'party',
    decidedBy: '2028-05-16',
    markets: [
      {
        party: 'Democratic',
        candidates: [],
      },
      {
        party: 'Republican',
        candidates: [
          {
            name: 'Ted Budd',
            pct: 85,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Ted Budd, running: yes)',
  },
  {
    office: 'senate',
    state: 'North Dakota',
    code: 'ND',
    system: 'party',
    decidedBy: '2028-06-14',
    markets: [
      {
        party: 'Democratic',
        candidates: [],
      },
      {
        party: 'Republican',
        candidates: [
          {
            name: 'John Hoeven',
            pct: 82,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent John Hoeven, running: unknown)',
  },
  {
    office: 'senate',
    state: 'Ohio',
    code: 'OH',
    system: 'party',
    decidedBy: '2028-03-22',
    markets: [
      {
        party: 'Democratic',
        candidates: [
          {
            name: 'Sherrod Brown',
            pct: 75,
          },
        ],
      },
      {
        party: 'Republican',
        candidates: [],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Sherrod Brown, running: unknown)',
  },
  {
    office: 'senate',
    state: 'Oklahoma',
    code: 'OK',
    system: 'party',
    decidedBy: '2028-08-29',
    markets: [
      {
        party: 'Democratic',
        candidates: [],
      },
      {
        party: 'Republican',
        candidates: [
          {
            name: 'James Lankford',
            pct: 72,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent James Lankford, running: unknown)',
  },
  {
    office: 'senate',
    state: 'Oregon',
    code: 'OR',
    system: 'party',
    decidedBy: '2028-05-17',
    markets: [
      {
        party: 'Democratic',
        candidates: [
          {
            name: 'Ron Wyden',
            pct: 82,
          },
        ],
      },
      {
        party: 'Republican',
        candidates: [],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Ron Wyden, running: yes)',
  },
  {
    office: 'senate',
    state: 'Pennsylvania',
    code: 'PA',
    system: 'party',
    decidedBy: '2028-04-26',
    markets: [
      {
        party: 'Democratic',
        candidates: [
          {
            name: 'John Fetterman',
            pct: 25,
          },
          {
            name: 'Chris Deluzio',
            pct: 25,
          },
          {
            name: 'Summer Lee',
            pct: 12,
          },
        ],
      },
      {
        party: 'Republican',
        candidates: [],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent John Fetterman, running: unknown)',
  },
  {
    office: 'senate',
    state: 'South Carolina',
    code: 'SC',
    system: 'party',
    decidedBy: '2028-08-22',
    markets: [
      {
        party: 'Democratic',
        candidates: [],
      },
      {
        party: 'Republican',
        candidates: [
          {
            name: 'Tim Scott',
            pct: 85,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Tim Scott, running: yes)',
  },
  {
    office: 'senate',
    state: 'South Dakota',
    code: 'SD',
    system: 'party',
    decidedBy: '2028-08-15',
    markets: [
      {
        party: 'Democratic',
        candidates: [],
      },
      {
        party: 'Republican',
        candidates: [
          {
            name: 'John Thune',
            pct: 78,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent John Thune, running: yes)',
  },
  {
    office: 'senate',
    state: 'Utah',
    code: 'UT',
    system: 'party',
    decidedBy: '2028-09-05',
    markets: [
      {
        party: 'Democratic',
        candidates: [],
      },
      {
        party: 'Republican',
        candidates: [
          {
            name: 'Mike Lee',
            pct: 60,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Mike Lee, running: unknown)',
  },
  {
    office: 'senate',
    state: 'Vermont',
    code: 'VT',
    system: 'party',
    decidedBy: '2028-08-09',
    markets: [
      {
        party: 'Democratic',
        candidates: [
          {
            name: 'Peter Welch',
            pct: 75,
          },
        ],
      },
      {
        party: 'Republican',
        candidates: [],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Peter Welch, running: unknown)',
  },
  {
    office: 'senate',
    state: 'Washington',
    code: 'WA',
    system: 'top-two',
    decidedBy: '2028-08-02',
    markets: [
      {
        party: null,
        candidates: [
          {
            name: 'Patty Murray',
            pct: 80,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Patty Murray, running: yes)',
  },
  {
    office: 'senate',
    state: 'Wisconsin',
    code: 'WI',
    system: 'party',
    decidedBy: '2028-08-09',
    markets: [
      {
        party: 'Democratic',
        candidates: [
          {
            name: 'Ben Wikler',
            pct: 20,
          },
        ],
      },
      {
        party: 'Republican',
        candidates: [
          {
            name: 'Ron Johnson',
            pct: 30,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Ron Johnson, running: unknown)',
  },
  {
    year: 2027,
    office: 'senate',
    state: 'Minnesota',
    code: 'MN',
    special: true,
    system: 'party',
    decidedBy: '2027-08-11',
    markets: [
      {
        party: 'Democratic',
        candidates: [
          {
            name: 'Angie Craig',
            pct: 20,
          },
          {
            name: 'Steve Simon',
            pct: 10,
          },
          {
            name: 'Kelly Morrison',
            pct: 10,
          },
        ],
      },
      {
        party: 'Republican',
        candidates: [],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Amy Klobuchar, running: no)',
  },
  {
    office: 'senate',
    state: 'Tennessee',
    code: 'TN',
    special: true,
    system: 'party',
    decidedBy: '2028-08-04',
    markets: [
      {
        party: 'Democratic',
        candidates: [],
      },
      {
        party: 'Republican',
        candidates: [
          {
            name: 'Tim Burchett',
            pct: 30,
          },
          {
            name: 'Glenn Jacobs',
            pct: 15,
          },
          {
            name: 'Damon Hininger',
            pct: 10,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Marsha Blackburn, running: no)',
  },
  {
    office: 'governor',
    state: 'Delaware',
    code: 'DE',
    system: 'party',
    decidedBy: '2028-09-13',
    markets: [
      {
        party: 'Democratic',
        candidates: [
          {
            name: 'Matt Meyer',
            pct: 72,
          },
        ],
      },
      {
        party: 'Republican',
        candidates: [],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Matt Meyer, running: unknown)',
  },
  {
    office: 'governor',
    state: 'Indiana',
    code: 'IN',
    system: 'party',
    decidedBy: '2028-05-03',
    markets: [
      {
        party: 'Democratic',
        candidates: [],
      },
      {
        party: 'Republican',
        candidates: [
          {
            name: 'Mike Braun',
            pct: 85,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Mike Braun, running: yes)',
  },
  {
    office: 'governor',
    state: 'Missouri',
    code: 'MO',
    system: 'party',
    decidedBy: '2028-08-09',
    markets: [
      {
        party: 'Democratic',
        candidates: [],
      },
      {
        party: 'Republican',
        candidates: [
          {
            name: 'Mike Kehoe',
            pct: 87,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Mike Kehoe, running: yes)',
  },
  {
    office: 'governor',
    state: 'Montana',
    code: 'MT',
    system: 'party',
    decidedBy: '2028-06-07',
    markets: [
      {
        party: 'Democratic',
        candidates: [],
      },
      {
        party: 'Republican',
        candidates: [
          {
            name: 'Austin Knudsen',
            pct: 25,
          },
          {
            name: 'Kristen Juras',
            pct: 10,
          },
          {
            name: 'Troy Downing',
            pct: 10,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Greg Gianforte, running: no)',
  },
  {
    office: 'governor',
    state: 'New Hampshire',
    code: 'NH',
    system: 'party',
    decidedBy: '2028-06-14',
    markets: [
      {
        party: 'Democratic',
        candidates: [],
      },
      {
        party: 'Republican',
        candidates: [
          {
            name: 'Kelly Ayotte',
            pct: 68,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Kelly Ayotte, running: unknown)',
  },
  {
    office: 'governor',
    state: 'North Carolina',
    code: 'NC',
    system: 'party',
    decidedBy: '2028-05-16',
    markets: [
      {
        party: 'Democratic',
        candidates: [
          {
            name: 'Josh Stein',
            pct: 80,
          },
        ],
      },
      {
        party: 'Republican',
        candidates: [
          {
            name: 'Dave Boliek',
            pct: 30,
          },
          {
            name: 'Robert Burns',
            pct: 8,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Josh Stein, running: unknown)',
  },
  {
    office: 'governor',
    state: 'North Dakota',
    code: 'ND',
    system: 'party',
    decidedBy: '2028-06-14',
    markets: [
      {
        party: 'Democratic',
        candidates: [],
      },
      {
        party: 'Republican',
        candidates: [
          {
            name: 'Kelly Armstrong',
            pct: 80,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Kelly Armstrong, running: unknown)',
  },
  {
    office: 'governor',
    state: 'Utah',
    code: 'UT',
    system: 'party',
    decidedBy: '2028-09-05',
    markets: [
      {
        party: 'Democratic',
        candidates: [],
      },
      {
        party: 'Republican',
        candidates: [
          {
            name: 'Jason Chaffetz',
            pct: 28,
          },
          {
            name: 'John Curtis',
            pct: 18,
          },
          {
            name: 'Deidre Henderson',
            pct: 7,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Spencer Cox, running: no)',
  },
  {
    office: 'governor',
    state: 'Vermont',
    code: 'VT',
    system: 'party',
    decidedBy: '2028-08-09',
    markets: [
      {
        party: 'Democratic',
        candidates: [],
      },
      {
        party: 'Republican',
        candidates: [
          {
            name: 'Phil Scott',
            pct: 60,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Phil Scott, running: unknown)',
  },
  {
    office: 'governor',
    state: 'Washington',
    code: 'WA',
    system: 'top-two',
    decidedBy: '2028-08-02',
    markets: [
      {
        party: null,
        candidates: [
          {
            name: 'Bob Ferguson',
            pct: 70,
          },
          {
            name: 'Jim Walsh',
            pct: 12,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Bob Ferguson, running: unknown)',
  },
  {
    office: 'governor',
    state: 'West Virginia',
    code: 'WV',
    system: 'party',
    decidedBy: '2028-05-10',
    markets: [
      {
        party: 'Democratic',
        candidates: [],
      },
      {
        party: 'Republican',
        candidates: [
          {
            name: 'Patrick Morrisey',
            pct: 55,
          },
          {
            name: 'Jim Justice',
            pct: 25,
          },
          {
            name: 'Larry Pack',
            pct: 5,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Patrick Morrisey, running: unknown)',
  },
]
