import { getDisplayProbability } from 'common/calculate'
import { Contract } from 'common/contract'
import {
  MapContractsDictionary,
  StateElectionMarket,
} from 'web/public/data/elections-data'

export const DEM_LIGHT_HEX = '#cedcef'
export const REP_LIGHT_HEX = '#f4dad7'
export const DEM_COLOR = '#5671ba'
export const REP_COLOR = '#c25555'
export const DEM_DARK_HEX = '#4a5fa8'
export const REP_DARK_HEX = '#9d3336'

export const COLOR_MIXED_THRESHOLD = 0.1

export function hexToRgb(hex: string) {
  // Convert hex to RGB
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return { r, g, b }
}

// Independents who caucus with / are scored as Democrats by name.
export const ALSO_DEMOCRATIC = [
  'Angus King (Independent)',
  'Bernie Sanders (Independent)',
]

// Community-created markets label the parties inconsistently: "Democratic
// Party", "Democratic party", "Democratic", "Democrats", "Ashley Hinson
// (Republican)", etc. Match defensively on the party stem rather than an exact
// string so any of these render correctly on the map.
export const isDemocraticAnswer = (text: string) =>
  /democrat/i.test(text) || ALSO_DEMOCRATIC.includes(text)
export const isRepublicanAnswer = (text: string) => /republican/i.test(text)

// Returns the aggregate {dem, rep, other} probabilities for a state market,
// or undefined if the contract can't be interpreted. Summing (rather than
// finding a single answer) tolerates split fields and named independents.
export const getPartyProbs = (
  contract: Contract | null,
  data?: StateElectionMarket
): { dem: number; rep: number; other: number } | undefined => {
  if (!contract) return undefined

  let dem: number
  let rep: number
  let other: number

  if (contract.mechanism === 'cpmm-multi-1') {
    const answers = contract.answers
    dem = answers
      .filter((a) => isDemocraticAnswer(a.text))
      .reduce((sum, a) => sum + a.prob, 0)
    rep = answers
      .filter((a) => isRepublicanAnswer(a.text))
      .reduce((sum, a) => sum + a.prob, 0)
    // Everything not clearly D or R (e.g. "Other", "Independent (Dan Osborn)").
    other = answers
      .filter((a) => !isDemocraticAnswer(a.text) && !isRepublicanAnswer(a.text))
      .reduce((sum, a) => sum + a.prob, 0)
    // No party answer at all (e.g. a candidate-only market) — can't map to a
    // party color, so leave the state uncolored rather than fake a tossup.
    if (dem === 0 && rep === 0) return undefined
  } else if (contract.mechanism === 'cpmm-1') {
    // Binary markets are framed "will the Republican win?" → YES = Republican.
    rep = getDisplayProbability(contract)
    dem = 1 - rep
    other = 0
  } else {
    return undefined
  }

  // A market can pre-assign its "Other" bucket to a party (e.g. a race where
  // the only viable non-major candidate caucuses with one side).
  if (data?.otherParty === 'Democratic Party') {
    dem += other
    other = 0
  } else if (data?.otherParty === 'Republican Party') {
    rep += other
    other = 0
  }

  return { dem, rep, other }
}

export const probToColor = (
  contract: Contract | null,
  data?: StateElectionMarket
) => {
  const probs = getPartyProbs(contract, data)
  if (!probs) return undefined
  return partyProbsToColor(probs.dem, probs.rep)
}

// Maps raw {dem, rep} probabilities to a blended blue/red fill. Exposed so
// aggregate views (e.g. the House map, which averages a state's districts) can
// color without constructing a contract.
export const partyProbsToColor = (
  probDemocratic: number,
  probRepublican: number
) => {
  type Color = { r: number; g: number; b: number }
  function interpolateColor(color1: Color, color2: Color, factor: number) {
    // Linear interpolation between two colors
    const r = Math.round(color1.r + factor * (color2.r - color1.r))
    const g = Math.round(color1.g + factor * (color2.g - color1.g))
    const b = Math.round(color1.b + factor * (color2.b - color1.b))

    // Convert RGB to Hex
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
  }

  // Base colors
  const DEM_LIGHT = hexToRgb(DEM_LIGHT_HEX)
  const REP_LIGHT = hexToRgb(REP_LIGHT_HEX)
  const DEM_DARK = hexToRgb(DEM_DARK_HEX)
  const REP_DARK = hexToRgb(REP_DARK_HEX)

  // Calculate the difference
  const repOverDem = probRepublican - probDemocratic
  const absoluteDifference = Math.abs(repOverDem)

  if (absoluteDifference < COLOR_MIXED_THRESHOLD / 2) {
    // Blend the light colors if difference is less than 5%
    return interpolateColor(
      DEM_LIGHT,
      REP_LIGHT,
      (repOverDem + COLOR_MIXED_THRESHOLD / 2) / COLOR_MIXED_THRESHOLD
    )
  } else {
    // Interpolate towards the darker shade based on the dominant side
    if (repOverDem < 0) {
      return interpolateColor(
        DEM_LIGHT,
        DEM_DARK,
        (absoluteDifference - COLOR_MIXED_THRESHOLD) /
          (1 - COLOR_MIXED_THRESHOLD)
      )
    } else {
      return interpolateColor(
        REP_LIGHT,
        REP_DARK,
        (absoluteDifference - COLOR_MIXED_THRESHOLD) /
          (1 - COLOR_MIXED_THRESHOLD)
      )
    }
  }
}

// Calculates the luminance of an RGB color
function calculateLuminance(rgb: { r: number; g: number; b: number }): number {
  const { r, g, b } = rgb
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

// Determines if the color is light
export function isColorLight(colorHex: string): boolean {
  const rgb = hexToRgb(colorHex)
  if (!rgb) return false // or handle error

  const luminance = calculateLuminance(rgb)
  return luminance > 0.75 // Adjust threshold as needed
}

export function sortByDemocraticDiff(
  unsortedContractsDictionary: MapContractsDictionary,
  data?: StateElectionMarket[]
): MapContractsDictionary {
  return Object.entries(unsortedContractsDictionary)
    .map(([state, contract]) => {
      // Sort by Democratic strength, reusing the shared party-prob helper so
      // the varied community answer labels are handled consistently.
      const probs = getPartyProbs(
        contract,
        data?.find((d) => d.state === state)
      )
      return { state, contract, diff: probs?.dem ?? 0 }
    })
    .sort((a, b) => b.diff - a.diff)
    .reduce((sortedData, data) => {
      sortedData[data.state] = data.contract
      return sortedData
    }, {} as MapContractsDictionary)
}
