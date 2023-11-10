import { invert } from 'lodash'

// label -> backend
export const Races = {
  'Black/African origin': 'african',
  'East Asian': 'asian',
  'South/Southeast Asian': 'south_asian',
  'White/Caucasian': 'caucasian',
  'Hispanic/Latino': 'hispanic',
  'Middle Eastern': 'middle_eastern',
  'Native American/Indigenous': 'native_american',
  Other: 'other',
} as const

export type Race = typeof Races[keyof typeof Races]

const raceTolabel = invert(Races)

export function convertRace(race: Race) {
  return raceTolabel[race]
}
