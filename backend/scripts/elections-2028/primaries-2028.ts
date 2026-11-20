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
  // ISO date of the contest that decides it: the primary, or the latest a
  // runoff or convention could fall (primary + 10 weeks, capped at Sep 29).
  // Where the date is in doubt, the later candidate date. Markets close the
  // day after; closing late is harmless, closing early is not.
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
    decidedBy: '2028-08-15',
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
    decidedBy: '2028-08-01',
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
        // Added 18 Nov 2026. No one has declared, and the field waits on
        // whether Kelly runs for president. Biggs lost the 2026 governor
        // race, Lake was the 2024 nominee and Hamadeh holds AZ-8.
        candidates: [
          {
            name: 'Andy Biggs',
            pct: 15,
          },
          {
            name: 'Kari Lake',
            pct: 15,
          },
          {
            name: 'Abe Hamadeh',
            pct: 10,
          },
        ],
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
    decidedBy: '2028-03-07',
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
    decidedBy: '2028-06-27',
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
    decidedBy: '2028-08-22',
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
    decidedBy: '2028-08-12',
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
    decidedBy: '2028-03-21',
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
    decidedBy: '2028-05-02',
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
        // Added 18 Nov 2026. No one has declared for Grassley's seat. These
        // are the candidates Josh Turek beat in the 2026 Senate primary.
        candidates: [
          {
            name: 'Zach Wahls',
            pct: 20,
          },
          {
            name: 'Nathan Sage',
            pct: 12,
          },
          {
            name: 'Jackie Norris',
            pct: 5,
          },
        ],
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
    decidedBy: '2028-08-01',
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
    decidedBy: '2028-04-25',
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
    decidedBy: '2028-08-08',
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
    decidedBy: '2028-06-13',
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
        // Added 18 Nov 2026. No one has declared. Lombardo lost the 2026
        // governor race to Aaron Ford, Brown was the 2024 Senate nominee and
        // Laxalt lost to Cortez Masto in 2022.
        candidates: [
          {
            name: 'Joe Lombardo',
            pct: 20,
          },
          {
            name: 'Sam Brown',
            pct: 15,
          },
          {
            name: 'Adam Laxalt',
            pct: 10,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Catherine Cortez Masto, running: unknown)',
  },
  {
    office: 'senate',
    state: 'New Hampshire',
    code: 'NH',
    system: 'party',
    decidedBy: '2028-09-12',
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
        // Added 18 Nov 2026. No one has declared. Chris Sununu passed on the
        // 2026 race; John E. Sununu lost it to Chris Pappas after beating
        // Scott Brown in the primary.
        candidates: [
          {
            name: 'Chris Sununu',
            pct: 15,
          },
          {
            name: 'John E. Sununu',
            pct: 12,
          },
          {
            name: 'Scott Brown',
            pct: 8,
          },
        ],
      },
    ],
    note: 'Seeds from public reporting as of November 2026 (incumbent Maggie Hassan, running: unknown)',
  },
  {
    office: 'senate',
    state: 'New York',
    code: 'NY',
    system: 'party',
    decidedBy: '2028-06-27',
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
        // Added 18 Nov 2026. No one has declared. Davis (NC-1, held in 2026)
        // has shown interest; Attorney General Jackson said "Nope" in January
        // 2026 but is the most-named; Nickel was just elected Wake County DA.
        candidates: [
          {
            name: 'Don Davis',
            pct: 25,
          },
          {
            name: 'Jeff Jackson',
            pct: 20,
          },
          {
            name: 'Wiley Nickel',
            pct: 10,
          },
        ],
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
    decidedBy: '2028-06-13',
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
    decidedBy: '2028-05-02',
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
        // Added 18 Nov 2026. No one has declared. Husted lost this seat to
        // Brown in the 2026 special, Ramaswamy lost the 2026 governor race
        // to Amy Acton and LaRose ran in the 2024 Senate primary.
        candidates: [
          {
            name: 'Jon Husted',
            pct: 20,
          },
          {
            name: 'Vivek Ramaswamy',
            pct: 15,
          },
          {
            name: 'Frank LaRose',
            pct: 8,
          },
        ],
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
    decidedBy: '2028-05-16',
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
    decidedBy: '2028-04-25',
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
        // Added 18 Nov 2026. No one has declared. The names in November 2026
        // coverage: Meuser (PA-9), Fitzpatrick (lost PA-1 in 2026), Attorney
        // General Sunday, and Fetterman if he switches parties (he says he
        // won't).
        candidates: [
          {
            name: 'Dan Meuser',
            pct: 20,
          },
          {
            name: 'Brian Fitzpatrick',
            pct: 15,
          },
          {
            name: 'John Fetterman',
            pct: 10,
          },
          {
            name: 'Dave Sunday',
            pct: 8,
          },
        ],
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
        // Added 18 Nov 2026. Zack Nelson (JerryRigEverything) hinted at a run
        // against Lee in November 2026, party unconfirmed; Yahne is listed as
        // a Democratic candidate. Democrats backed an independent in 2022.
        candidates: [
          {
            name: 'Zack Nelson',
            pct: 20,
          },
          {
            name: 'Jay Yahne',
            pct: 15,
          },
        ],
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
    decidedBy: '2028-08-08',
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
    decidedBy: '2028-08-01',
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
    decidedBy: '2028-08-08',
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
    decidedBy: '2027-08-10',
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
        // Added 18 Nov 2026. No one has declared. Tafoya lost the 2026 Senate
        // race to Peggy Flanagan, Demuth lost the 2026 governor race to
        // Klobuchar (both named as possible 2027 candidates), and White was
        // the 2024 Senate nominee.
        candidates: [
          {
            name: 'Michele Tafoya',
            pct: 25,
          },
          {
            name: 'Lisa Demuth',
            pct: 20,
          },
          {
            name: 'Royce White',
            pct: 5,
          },
        ],
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
    decidedBy: '2028-08-03',
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
    decidedBy: '2028-09-12',
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
    decidedBy: '2028-05-02',
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
    decidedBy: '2028-08-08',
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
    decidedBy: '2028-06-06',
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
    decidedBy: '2028-09-12',
    markets: [
      {
        party: 'Democratic',
        // Added 18 Nov 2026. No one has declared. Warmington lost to Ayotte
        // in 2026 and Craig lost to her in 2024.
        candidates: [
          {
            name: 'Cinde Warmington',
            pct: 25,
          },
          {
            name: 'Joyce Craig',
            pct: 15,
          },
        ],
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
    decidedBy: '2028-06-13',
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
    decidedBy: '2028-08-08',
    markets: [
      {
        party: 'Democratic',
        // Added 18 Nov 2026. No one has declared. Gray was just elected
        // lieutenant governor, Janoo lost to Phil Scott by 6.6 points in 2026,
        // and Pieciak is the state treasurer.
        candidates: [
          {
            name: 'Molly Gray',
            pct: 25,
          },
          {
            name: 'Amanda Janoo',
            pct: 20,
          },
          {
            name: 'Mike Pieciak',
            pct: 10,
          },
        ],
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
    decidedBy: '2028-08-01',
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
    decidedBy: '2028-05-09',
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
