import { currentSenate2026 } from 'web/public/data/senate-state-data'

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
