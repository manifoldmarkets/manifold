import {
  currentSenate2026,
  senateHeldSeats2026,
} from 'web/public/data/senate-state-data'
import houseSnapshot from 'web/public/data/election-house-incumbents.json'

export type Officeholder = {
  name: string
  party: 'Democrat' | 'Republican' | 'Independent'
}
export type HeldOffice = {
  control: 'dem' | 'rep' | 'split'
  members: Officeholder[]
}

// Governors not on the 2026 ballot. Names and affiliations checked October 3,
// 2026 against https://www.nga.org/governors/ and its linked governors roster.
// This is incumbent context, never a substitute for missing election odds.
const governorsNotOnBallot: Record<string, Officeholder> = {
  DE: { name: 'Matt Meyer', party: 'Democrat' },
  IN: { name: 'Mike Braun', party: 'Republican' },
  KY: { name: 'Andy Beshear', party: 'Democrat' },
  LA: { name: 'Jeff Landry', party: 'Republican' },
  MS: { name: 'Tate Reeves', party: 'Republican' },
  MO: { name: 'Mike Kehoe', party: 'Republican' },
  MT: { name: 'Greg Gianforte', party: 'Republican' },
  NC: { name: 'Josh Stein', party: 'Democrat' },
  ND: { name: 'Kelly Armstrong', party: 'Republican' },
  NJ: { name: 'Mikie Sherrill', party: 'Democrat' },
  UT: { name: 'Spencer Cox', party: 'Republican' },
  VA: { name: 'Abigail Spanberger', party: 'Democrat' },
  WA: { name: 'Bob Ferguson', party: 'Democrat' },
  WV: { name: 'Patrick Morrisey', party: 'Republican' },
}

// Same NGA directory/roster snapshot as the off-ballot governors above.
const governorsOnBallot: Record<string, Officeholder> = {
  AK: { name: 'Mike Dunleavy', party: 'Republican' },
  AL: { name: 'Kay Ivey', party: 'Republican' },
  AR: { name: 'Sarah Huckabee Sanders', party: 'Republican' },
  AZ: { name: 'Katie Hobbs', party: 'Democrat' },
  CA: { name: 'Gavin Newsom', party: 'Democrat' },
  CO: { name: 'Jared Polis', party: 'Democrat' },
  CT: { name: 'Ned Lamont', party: 'Democrat' },
  FL: { name: 'Ron DeSantis', party: 'Republican' },
  GA: { name: 'Brian Kemp', party: 'Republican' },
  HI: { name: 'Josh Green', party: 'Democrat' },
  IA: { name: 'Kim Reynolds', party: 'Republican' },
  ID: { name: 'Brad Little', party: 'Republican' },
  IL: { name: 'JB Pritzker', party: 'Democrat' },
  KS: { name: 'Laura Kelly', party: 'Democrat' },
  MA: { name: 'Maura Healey', party: 'Democrat' },
  MD: { name: 'Wes Moore', party: 'Democrat' },
  ME: { name: 'Janet Mills', party: 'Democrat' },
  MI: { name: 'Gretchen Whitmer', party: 'Democrat' },
  MN: { name: 'Tim Walz', party: 'Democrat' },
  NE: { name: 'Jim Pillen', party: 'Republican' },
  NH: { name: 'Kelly Ayotte', party: 'Republican' },
  NM: { name: 'Michelle Lujan Grisham', party: 'Democrat' },
  NV: { name: 'Joe Lombardo', party: 'Republican' },
  NY: { name: 'Kathy Hochul', party: 'Democrat' },
  OH: { name: 'Mike DeWine', party: 'Republican' },
  OK: { name: 'Kevin Stitt', party: 'Republican' },
  OR: { name: 'Tina Kotek', party: 'Democrat' },
  PA: { name: 'Josh Shapiro', party: 'Democrat' },
  RI: { name: 'Dan McKee', party: 'Democrat' },
  SC: { name: 'Henry McMaster', party: 'Republican' },
  SD: { name: 'Larry Rhoden', party: 'Republican' },
  TN: { name: 'Bill Lee', party: 'Republican' },
  TX: { name: 'Greg Abbott', party: 'Republican' },
  VT: { name: 'Phil Scott', party: 'Republican' },
  WI: { name: 'Tony Evers', party: 'Democrat' },
  WY: { name: 'Mark Gordon', party: 'Republican' },
}

// Current holders of Class II seats and the FL/OH Class III special-election
// seats, checked October 3, 2026: https://www.senate.gov/senators/.
// Being the incumbent does not imply that this person is running again.
const senatorsOnBallot: Record<string, Officeholder> = {
  AL: { name: 'Tommy Tuberville', party: 'Republican' },
  AK: { name: 'Dan Sullivan', party: 'Republican' },
  AR: { name: 'Tom Cotton', party: 'Republican' },
  CO: { name: 'John Hickenlooper', party: 'Democrat' },
  DE: { name: 'Chris Coons', party: 'Democrat' },
  FL: { name: 'Ashley Moody', party: 'Republican' },
  GA: { name: 'Jon Ossoff', party: 'Democrat' },
  ID: { name: 'Jim Risch', party: 'Republican' },
  IL: { name: 'Dick Durbin', party: 'Democrat' },
  IA: { name: 'Joni Ernst', party: 'Republican' },
  KS: { name: 'Roger Marshall', party: 'Republican' },
  KY: { name: 'Mitch McConnell', party: 'Republican' },
  LA: { name: 'Bill Cassidy', party: 'Republican' },
  ME: { name: 'Susan Collins', party: 'Republican' },
  MA: { name: 'Ed Markey', party: 'Democrat' },
  MI: { name: 'Gary Peters', party: 'Democrat' },
  MN: { name: 'Tina Smith', party: 'Democrat' },
  MS: { name: 'Cindy Hyde-Smith', party: 'Republican' },
  MT: { name: 'Steve Daines', party: 'Republican' },
  NE: { name: 'Pete Ricketts', party: 'Republican' },
  NH: { name: 'Jeanne Shaheen', party: 'Democrat' },
  NJ: { name: 'Cory Booker', party: 'Democrat' },
  NM: { name: 'Ben Ray Luján', party: 'Democrat' },
  NC: { name: 'Thom Tillis', party: 'Republican' },
  OH: { name: 'Jon Husted', party: 'Republican' },
  OK: { name: 'Alan Armstrong', party: 'Republican' },
  OR: { name: 'Jeff Merkley', party: 'Democrat' },
  RI: { name: 'Jack Reed', party: 'Democrat' },
  SC: { name: 'Darline Graham', party: 'Republican' },
  SD: { name: 'Mike Rounds', party: 'Republican' },
  TN: { name: 'Bill Hagerty', party: 'Republican' },
  TX: { name: 'John Cornyn', party: 'Republican' },
  VA: { name: 'Mark Warner', party: 'Democrat' },
  WV: { name: 'Shelley Moore Capito', party: 'Republican' },
  WY: { name: 'Cynthia Lummis', party: 'Republican' },
}

export type IncumbentGroup = { label: string; members: Officeholder[] }

export function getIncumbentGroups(
  mode: string,
  state: string,
  district?: number
): IncumbentGroup[] {
  if (mode === 'house') {
    const key = `${state}-${district}`
    const members = houseSnapshot.members as Record<string, Officeholder | null>
    if (!(key in members)) return []
    const member = members[key]
    return [
      {
        // This roster uses current district numbers; the atlas uses the next
        // Congress's boundaries. Do not imply a retiring/relocated member is a candidate.
        label: `Current ${state}-${district || 'AL'} representative`,
        members: member ? [member] : [],
      },
    ]
  }
  if (mode === 'governor') {
    const governor = governorsOnBallot[state] ?? governorsNotOnBallot[state]
    return governor ? [{ label: 'Current governor', members: [governor] }] : []
  }
  if (mode !== 'senate') return []
  const incumbent = senatorsOnBallot[state]
  if (incumbent) {
    const other = senateHeldSeats2026[state]
    return [
      { label: 'Current senator · seat up in 2026', members: [incumbent] },
      ...(other
        ? [{ label: 'Other senator · not on ballot', members: [other] }]
        : []),
    ]
  }
  const held = getHeldOffice(mode, state)
  return held
    ? [{ label: 'Current senators · not on ballot', members: held.members }]
    : []
}

export function getHeldOffice(
  mode: string,
  state: string
): HeldOffice | undefined {
  if (mode === 'governor') {
    const governor = governorsNotOnBallot[state]
    return governor
      ? {
          control: governor.party === 'Democrat' ? 'dem' : 'rep',
          members: [governor],
        }
      : undefined
  }
  if (mode !== 'senate') return undefined
  const senate = currentSenate2026.find((s) => s.state === state)
  if (!senate) return undefined
  return {
    // The existing Senate snapshot groups Sanders with his Democratic caucus
    // for control, but show his actual affiliation in the incumbent details.
    control:
      senate.party1 !== senate.party2
        ? 'split'
        : senate.party1 === 'Democrat'
        ? 'dem'
        : 'rep',
    members: [
      {
        name: senate.name1,
        party:
          senate.name1 === 'Bernie Sanders' ? 'Independent' : senate.party1,
      },
      { name: senate.name2, party: senate.party2 },
    ],
  }
}

export const HELD_COLORS = {
  dem: { background: '#4a5fa8', hatch: '#262c45' },
  rep: { background: '#9d3336', hatch: '#3e1316' },
  split: { background: '#73496f', hatch: '#321f2d' },
}
