import { invert } from 'lodash'

// label -> backend
export const Races = {
  Black: 'african',
  Asian: 'asian',
  Desi: 'south_asian',
  White: 'caucasian',
  Hispanic: 'hispanic',
  Arab: 'middle_eastern',
  Indigenous: 'native_american',
  Other: 'other',
} as const

export type Race = typeof Races[keyof typeof Races]

const raceTolabel = invert(Races)

export function convertRace(race: Race) {
  return raceTolabel[race]
}
