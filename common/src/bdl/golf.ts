export type GolfTour = 'pga' | 'lpga'
export type GolfTournament = {
  tour: GolfTour
  id: number
  season: number
  eventId: string
  name: string
  course: string | null
  startDate: string | null
  endDate: string | null
  state: 'scheduled' | 'live' | 'suspended' | 'final' | 'unavailable'
  round: number | null
  format: string | null
}
export type GolfPlayer = {
  playerId: number
  competitorId: number
  name: string
  state: 'entered' | 'active' | 'cut' | 'withdrawn' | 'disqualified' | 'unknown'
  fieldPresent: boolean | null
  position: { rank: number; tied: boolean } | null
  toPar: number | null
  through: string | null
}
export type GolfField = {
  tournament: GolfTournament
  players: GolfPlayer[]
  readStartedAt: number
  hasResults: boolean
  incomplete: boolean
}

// The API calendar includes unofficial and team events with no tour identifier.
// Match season, event ID, calendar name and individual format. The 2026 PGA
// TOUR FedExCup regular-season/playoff and Fall schedules identify the events.
// Exclude team formats, Q-School and the unofficial post-season invitations.
const official2026: Readonly<Record<number, string>> = {
  7: 'Sony Open in Hawaii',
  8: 'The American Express',
  9: 'Farmers Insurance Open',
  10: 'WM Phoenix Open',
  11: 'AT&T Pebble Beach Pro-Am',
  12: 'The Genesis Invitational',
  13: 'Cognizant Classic in The Palm Beaches',
  14: 'Arnold Palmer Invitational presented by Mastercard',
  15: 'Puerto Rico Open',
  16: 'THE PLAYERS Championship',
  17: 'Valspar Championship',
  18: "Texas Children's Houston Open",
  19: 'Valero Texas Open',
  20: 'Masters Tournament',
  21: 'RBC Heritage',
  23: 'Cadillac Championship',
  24: 'Truist Championship',
  25: 'ONEflight Myrtle Beach Classic',
  26: 'PGA Championship',
  27: 'THE CJ CUP Byron Nelson',
  28: 'Charles Schwab Challenge',
  29: 'the Memorial Tournament presented by Workday',
  30: 'RBC Canadian Open',
  31: 'U.S. Open',
  32: 'Travelers Championship',
  33: 'John Deere Classic',
  34: 'Genesis Scottish Open',
  35: 'ISCO Championship',
  36: 'The Open Championship',
  37: 'Corales Puntacana Championship',
  38: '3M Open',
  39: 'Rocket Classic',
  40: 'Wyndham Championship',
  41: 'FedEx St. Jude Championship',
  42: 'BMW Championship',
  43: 'TOUR Championship',
  6896: 'Biltmore Championship Asheville',
  6898: 'Bank of Utah Championship',
  6899: 'Baycurrent Classic',
  6900: 'Butterfield Bermuda Championship',
  6901: 'VidantaWorld Mexico Open',
  6902: 'World Wide Technology Championship',
  6903: 'Austin Championship presented by Compliance Solutions',
  6904: 'The RSM Classic',
}
export const isListedPgaTournament = (season: number, id: number) =>
  season === 2026 && Object.prototype.hasOwnProperty.call(official2026, id)
export function isOfficialGolfTournament(t: GolfTournament) {
  return (
    t.tour === 'pga' &&
    isListedPgaTournament(t.season, t.id) &&
    t.format === 'STROKE_PLAY' &&
    official2026[t.id] === t.name
  )
}

export const golfRank = (value: string | null) => {
  const match = /^(T?)([1-9][0-9]{0,2})$/.exec(value ?? '')
  return match ? { rank: Number(match[2]), tied: match[1] === 'T' } : null
}
export const golfThrough = (value: string | null) =>
  value && /^(?:[1-9]|1[0-8]|F)$/.test(value) ? value : null
