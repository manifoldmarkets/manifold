import { StateElectionMarket } from './elections-data'

export type HouseDataType = {
  incumbent?: string | 'NEW SEAT'
  incumbentShort?: string
  incumbentParty?: 'Democrat' | 'Republican'
  status?: 'OPEN' | 'NEW SEAT'
  winMargin2022?: number
}

export const house2024: Record<string, HouseDataType> = {
  'IA-03 Zach Nunn (R)': {
    incumbent: 'Zach Nunn',
    incumbentShort: 'Nunn',
    incumbentParty: 'Republican',
  },
  'MT-01 Ryan Zinke (R)': {
    incumbent: 'Ryan Zinke',
    incumbentShort: 'Zinke',
    incumbentParty: 'Republican',
  },
  'PA-01 Brian Fitzpatrick (R)': {
    incumbent: 'Brian Fitzpatrick',
    incumbentShort: 'Fitzpatrick',
    incumbentParty: 'Republican',
  },
  'FL-13 Anna Paulina Luna (R)': {
    incumbent: 'Anna Paulina Luna',
    incumbentShort: 'Luna',
    incumbentParty: 'Republican',
  },
  'IA-01 Mariannette Miller-Meeks (R)': {
    incumbent: 'Mariannette Miller-Meeks',
    incumbentShort: 'Miller-Meeks',
    incumbentParty: 'Republican',
  },
  'NY-01 Nick LaLota (R)': {
    incumbent: 'Nick LaLota',
    incumbentShort: 'LaLota',
    incumbentParty: 'Republican',
  },
  'SC-01 Nancy Mace (R)': {
    incumbent: 'Nancy Mace',
    incumbentShort: 'Mace',
    incumbentParty: 'Republican',
  },
  'TX-15 Monica De La Cruz (R)': {
    incumbent: 'Monica De La Cruz',
    incumbentShort: 'De La Cruz',
    incumbentParty: 'Republican',
  },
  'CA-45 Michelle Steel (R) - Lean R': {
    incumbent: 'Michelle Steel',
    incumbentShort: 'Steel',
    incumbentParty: 'Republican',
  },
  'WI-03 Derrick Van Orden (R)': {
    incumbent: 'Derrick Van Orden',
    incumbentShort: 'Van Orden',
    incumbentParty: 'Republican',
  },
  'MI-10 John James (R)': {
    incumbent: 'John James',
    incumbentShort: 'James',
    incumbentParty: 'Republican',
  },
  'CA-03 Kevin Kiley (R) - Likely R': {
    incumbent: 'Kevin Kiley',
    incumbentShort: 'Kiley',
    incumbentParty: 'Republican',
  },
  'CA-40 Young Kim (R)': {
    incumbent: 'Young Kim',
    incumbentShort: 'Kim',
    incumbentParty: 'Republican',
  },
  'CO-03 OPEN (Boebert) (R)': {
    incumbent: 'Lauren Boebert',
    incumbentShort: 'Boebert',
    incumbentParty: 'Republican',
    status: 'OPEN',
  },
  'PA-10 Scott Perry (R)': {
    incumbent: 'Scott Perry',
    incumbentShort: 'Perry',
    incumbentParty: 'Republican',
  },
  'AZ-06 Juan Ciscomani (R) - Won by 1.50%': {
    incumbent: 'Juan Ciscomani',
    incumbentShort: 'Ciscomani',
    incumbentParty: 'Republican',
    winMargin2022: 1.5,
  },
  'VA-02 Jen Kiggans (R)': {
    incumbent: 'Jen Kiggans',
    incumbentShort: 'Kiggans',
    incumbentParty: 'Republican',
  },
  'CA-27 Mike Garcia (R) - Won by 6.48% - Full Toss-up': {
    incumbent: 'Mike Garcia',
    incumbentShort: 'Garcia',
    incumbentParty: 'Republican',
    winMargin2022: 6.48,
  },
  'NE-02 Don Bacon (R)': {
    incumbent: 'Don Bacon',
    incumbentShort: 'Bacon',
    incumbentParty: 'Republican',
  },
  'NJ-07 Thomas Kean Jr. (R) - Won by 2.80%': {
    incumbent: 'Thomas Kean Jr.',
    incumbentShort: 'Kean Jr.',
    incumbentParty: 'Republican',
    winMargin2022: 2.8,
  },
  'CA-41 Ken Calvert (R) - Won by 4.69%': {
    incumbent: 'Ken Calvert',
    incumbentShort: 'Calvert',
    incumbentParty: 'Republican',
    winMargin2022: 4.69,
  },
  'NY-22 Brandon Williams (R)': {
    incumbent: 'Brandon Williams',
    incumbentShort: 'Williams',
    incumbentParty: 'Republican',
  },
  'AZ-01 David Schweikert (R) - Won by 0.88%': {
    incumbent: 'David Schweikert',
    incumbentShort: 'Schweikert',
    incumbentParty: 'Republican',
    winMargin2022: 0.88,
  },
  'MI-07 OPEN (Slotkin) (D) - Won by 5.42% - Full Toss-up': {
    incumbent: 'Elissa Slotkin',
    incumbentShort: 'Slotkin',
    incumbentParty: 'Democrat',
    status: 'OPEN',
    winMargin2022: 5.42,
  },
  'NY-17 Mike Lawler (R) - Won by 0.64% - Full Toss-up': {
    incumbent: 'Mike Lawler',
    incumbentShort: 'Lawler',
    incumbentParty: 'Republican',
    winMargin2022: 0.64,
  },
  'PA-08 Matt Cartwright (D) - Won by 3.55%': {
    incumbent: 'Matt Cartwright',
    incumbentShort: 'Cartwright',
    incumbentParty: 'Democrat',
    winMargin2022: 3.55,
  },
  'NY-19 Marc Molinaro (R) - Won by 1.56%': {
    incumbent: 'Marc Molinaro',
    incumbentShort: 'Molinaro',
    incumbentParty: 'Republican',
    winMargin2022: 1.56,
  },
  'CA-22 David Valadao (R) - Won by 3.05%': {
    incumbent: 'David Valadao',
    incumbentShort: 'Valadao',
    incumbentParty: 'Republican',
    winMargin2022: 3.05,
  },
  'OR-05 Lori Chavez-DeRemer (R) - Won by 2.08% - Full Toss-up': {
    incumbent: 'Lori Chavez-DeRemer',
    incumbentShort: 'Chavez-DeRemer',
    incumbentParty: 'Republican',
    winMargin2022: 2.08,
  },
  'ME-02 Jared Golden (D) - Won by 2.15%': {
    incumbent: 'Jared Golden',
    incumbentShort: 'Golden',
    incumbentParty: 'Democrat',
    winMargin2022: 2.15,
  },
  'PA-07 Susan Wild (D) - Won by 1.97%': {
    incumbent: 'Susan Wild',
    incumbentShort: 'Wild',
    incumbentParty: 'Democrat',
    winMargin2022: 1.97,
  },
  'NC-01 Don Davis (D) - Won by 4.74% - Full Toss-up': {
    incumbent: 'Don Davis',
    incumbentShort: 'Davis',
    incumbentParty: 'Democrat',
    winMargin2022: 4.74,
  },
  'WA-03 Marie Perez (D) - Won by 0.82% - Full Toss-up': {
    incumbent: 'Marie Perez',
    incumbentShort: 'Perez',
    incumbentParty: 'Democrat',
    winMargin2022: 0.82,
  },
  'NM-02 Gabe Vasquez (D) - Won by 0.70%': {
    incumbent: 'Gabe Vasquez',
    incumbentShort: 'Vasquez',
    incumbentParty: 'Democrat',
    winMargin2022: 0.7,
  },
  'CA-13 John Duarte (R) - Won by 0.42% - Full Toss-up': {
    incumbent: 'John Duarte',
    incumbentShort: 'Duarte',
    incumbentParty: 'Republican',
    winMargin2022: 0.42,
  },
  'AK-00 Mary Peltola (D)': {
    incumbent: 'Mary Peltola',
    incumbentShort: 'Peltola',
    incumbentParty: 'Democrat',
  },
  'OH-09 Marcy Kaptur (D) - Won by 13.27%': {
    incumbent: 'Marcy Kaptur',
    incumbentShort: 'Kaptur',
    incumbentParty: 'Democrat',
    winMargin2022: 13.27,
  },
  'OH-13 Emilia Sykes (D) - Won by 5.35%': {
    incumbent: 'Emilia Sykes',
    incumbentShort: 'Sykes',
    incumbentParty: 'Democrat',
    winMargin2022: 5.35,
  },
  'CA-47 OPEN (Porter) (D)': {
    incumbent: 'Katie Porter',
    incumbentShort: 'Porter',
    incumbentParty: 'Democrat',
    status: 'OPEN',
  },
  'VA-07 OPEN (Spanberger) (D) - Lean D': {
    incumbent: 'Abigail Spanberger',
    incumbentShort: 'Spanberger',
    incumbentParty: 'Democrat',
    status: 'OPEN',
  },
  'CO-08 Yadira Caraveo (D) - Won by 0.69%': {
    incumbent: 'Yadira Caraveo',
    incumbentShort: 'Caraveo',
    incumbentParty: 'Democrat',
    winMargin2022: 0.69,
  },
  "NY-04 Anthony D'Esposito (R) - Won by 3.59%": {
    incumbent: "Anthony D'Esposito",
    incumbentShort: "D'Esposito",
    incumbentParty: 'Republican',
    winMargin2022: 3.59,
  },
  'MI-08 OPEN (Kildee) (D) - Won by 10.26%': {
    incumbent: 'Dan Kildee',
    incumbentShort: 'Kildee',
    incumbentParty: 'Democrat',
    status: 'OPEN',
    winMargin2022: 10.26,
  },
  'WA-08 Kim Schrier (D) - Likely D': {
    incumbent: 'Kim Schrier',
    incumbentShort: 'Schrier',
    incumbentParty: 'Democrat',
  },
  'NY-18 Pat Ryan (D)': {
    incumbent: 'Pat Ryan',
    incumbentShort: 'Ryan',
    incumbentParty: 'Democrat',
  },
  'IL-17 Eric Sorensen (D)': {
    incumbent: 'Eric Sorensen',
    incumbentShort: 'Sorensen',
    incumbentParty: 'Democrat',
  },
  'NV-03 Susie Lee (D)': {
    incumbent: 'Susie Lee',
    incumbentShort: 'Lee',
    incumbentParty: 'Democrat',
  },
  'NV-01 Dina Titus (D)': {
    incumbent: 'Dina Titus',
    incumbentShort: 'Titus',
    incumbentParty: 'Democrat',
  },
  'CT-05 Jahana Hayes (D)': {
    incumbent: 'Jahana Hayes',
    incumbentShort: 'Hayes',
    incumbentParty: 'Democrat',
  },
  'MN-02 Angie Craig (D)': {
    incumbent: 'Angie Craig',
    incumbentShort: 'Craig',
    incumbentParty: 'Democrat',
  },
  'TX-34 Vicente Gonzalez (D)': {
    incumbent: 'Vicente Gonzalez',
    incumbentShort: 'Gonzalez',
    incumbentParty: 'Democrat',
  },
  'PA-17 Chris Deluzio (D)': {
    incumbent: 'Chris Deluzio',
    incumbentShort: 'Deluzio',
    incumbentParty: 'Democrat',
  },
  'IN-01 Frank J. Mrvan (D)': {
    incumbent: 'Frank J. Mrvan',
    incumbentShort: 'Mrvan',
    incumbentParty: 'Democrat',
  },
  'NH-02 Annie Kuster (D)': {
    incumbent: 'Annie Kuster',
    incumbentShort: 'Kuster',
    incumbentParty: 'Democrat',
  },
  'NV-04 Steven Horsford (D)': {
    incumbent: 'Steven Horsford',
    incumbentShort: 'Horsford',
    incumbentParty: 'Democrat',
  },
  'NY-03 Tom Suozzi (D)': {
    incumbent: 'Tom Suozzi',
    incumbentShort: 'Suozzi',
    incumbentParty: 'Democrat',
  },
  'OH-01 Greg Landsman (D)': {
    incumbent: 'Greg Landsman',
    incumbentShort: 'Landsman',
    incumbentParty: 'Democrat',
  },
  'TX-28 Henry Cuellar (D)': {
    incumbent: 'Henry Cuellar',
    incumbentShort: 'Cuellar',
    incumbentParty: 'Democrat',
  },
  'FL-09 Darren Soto (D)': {
    incumbent: 'Darren Soto',
    incumbentShort: 'Soto',
    incumbentParty: 'Democrat',
  },
  'CA-09 Josh Harder (D)': {
    incumbent: 'Josh Harder',
    incumbentShort: 'Harder',
    incumbentParty: 'Democrat',
  },
  'KS-03 Sharice Davids (D)': {
    incumbent: 'Sharice Davids',
    incumbentShort: 'Davids',
    incumbentParty: 'Democrat',
  },
  'MI-03 Hillary Scholten (D)': {
    incumbent: 'Hillary Scholten',
    incumbentShort: 'Scholten',
    incumbentParty: 'Democrat',
  },
  'NH-01 Chris Pappas (D)': {
    incumbent: 'Chris Pappas',
    incumbentShort: 'Pappas',
    incumbentParty: 'Democrat',
  },
  'MD-06 OPEN (Trone) (D)': {
    incumbent: 'David Trone',
    incumbentShort: 'Trone',
    incumbentParty: 'Democrat',
    status: 'OPEN',
  },
  'OR-06 Andrea Salinas (D)': {
    incumbent: 'Andrea Salinas',
    incumbentShort: 'Salinas',
    incumbentParty: 'Democrat',
  },
  'CA-49 Mike Levin (D)': {
    incumbent: 'Mike Levin',
    incumbentShort: 'Levin',
    incumbentParty: 'Democrat',
  },
  'OR-04 Val Hoyle (D)': {
    incumbent: 'Val Hoyle',
    incumbentShort: 'Hoyle',
    incumbentParty: 'Democrat',
  },
  'FL-23 Jared Moskowitz (D)': {
    incumbent: 'Jared Moskowitz',
    incumbentShort: 'Moskowitz',
    incumbentParty: 'Democrat',
  },
  'AL-02 NEW SEAT': {
    status: 'NEW SEAT',
  },
}
