// Reference index of 2026 races → who's running, so the UI can show candidate
// names on bet buttons / detail cards, e.g. "(D) Allred" vs "(R) Cornyn".
//
// STATUS: scaffold. The schema + helpers are ready; RACE_CANDIDATES is empty
// and must be populated from a reliable source (see "Populating" below).
// Do NOT guess names — primaries are unsettled and wrong data here is worse
// than none.
//
// Keys:
//   senate:   `senate-${stateCode}`              e.g. 'senate-TX'
//   governor: `governor-${stateCode}`            e.g. 'governor-GA'
//   house:    `house-${stateCode}-${district}`   e.g. 'house-CA-22'
//
// Populating — three options (see backend/scripts/2026-market-coverage.md):
//   1. Hand-curate this file (accurate snapshot; needs upkeep as primaries
//      resolve).
//   2. Derive from existing candidate markets where they exist (partial, and
//      party isn't reliably encoded in answer text).
//   3. Remake the per-race markets as candidate (multiple-choice) markets — then
//      names live in the market answers and this index isn't needed at all.
//      This is the strongest argument for remaking the markets.

export type RaceCandidate = {
  name: string
  party: 'D' | 'R' | 'I'
  incumbent?: boolean
  // How settled the candidacy is — useful for showing "(likely)" etc.
  status?: 'declared' | 'primary' | 'nominee'
}

export const raceKey = (
  office: 'senate' | 'governor' | 'house',
  stateCode: string,
  district?: string
) => (district ? `house-${stateCode}-${district}` : `${office}-${stateCode}`)

// Empty until populated. Example shape (commented so it isn't mistaken for data):
//   'senate-TX': [
//     { name: 'John Cornyn', party: 'R', incumbent: true, status: 'primary' },
//     { name: 'Colin Allred', party: 'D', status: 'primary' },
//   ],
export const RACE_CANDIDATES: Record<string, RaceCandidate[]> = {}

// The two major-party front-runners for a race, if known. Bet buttons can fall
// back to "Democratic"/"Republican" when a side is absent.
export function getMajorPartyCandidates(key: string): {
  dem?: RaceCandidate
  rep?: RaceCandidate
} {
  const candidates = RACE_CANDIDATES[key]
  if (!candidates) return {}
  return {
    dem: candidates.find((c) => c.party === 'D'),
    rep: candidates.find((c) => c.party === 'R'),
  }
}
