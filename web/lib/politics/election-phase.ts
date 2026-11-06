// Which stage of the election calendar /election is in, and what it leads
// with. A pure function of the date, so the page reorders itself through
// 2028 and into the 2030 midterms with no edits.

export type ElectionPhase =
  | 'nomination' // until 2028: who'll be nominated, the 2026 recap
  | 'primaries' // January–June 2028: state-by-state contests
  | 'conventions' // July–August 2028: nominees and running mates
  | 'general' // September 2028 to the morning of Election Day
  | 'results' // Election Day 2028 to the inauguration
  | 'midterms2030' // from the inauguration: 2030 up top, 2028 results below

// Boundaries in UTC. Election Day starts when the first polls open on the
// East Coast (6am ET, 11:00 UTC); the 2028 race board freezes its columns
// at that moment.
export const PHASE_STARTS = {
  primaries: Date.UTC(2028, 0, 1),
  conventions: Date.UTC(2028, 6, 1),
  general: Date.UTC(2028, 8, 1),
  results: Date.UTC(2028, 10, 7, 11),
  midterms2030: Date.UTC(2029, 0, 20, 17),
} as const

export const ELECTION_DAY_2028_FREEZE = PHASE_STARTS.results

export function electionPhase(now: number): ElectionPhase {
  if (now >= PHASE_STARTS.midterms2030) return 'midterms2030'
  if (now >= PHASE_STARTS.results) return 'results'
  if (now >= PHASE_STARTS.general) return 'general'
  if (now >= PHASE_STARTS.conventions) return 'conventions'
  if (now >= PHASE_STARTS.primaries) return 'primaries'
  return 'nomination'
}

export type SectionKey =
  | 'accuracy' // the 2026 result, one line
  | 'leaderboards' // the leaderboard card, by scope
  | 'map' // the state-by-state map
  | 'roadAhead' // the timeline
  | 'race' // party bar, face-ended charts, popular vote, balance of power
  | 'movers'
  | 'runningMates'
  | 'roadTo270'
  | 'board' // the 2028 race board
  | 'primaries'
  | 'trending'
  | 'swings2026'
  | 'offYear' // 2027 and 2029 races
  | 'midterms2030' // the 2030 board and balance of power
  | 'later' // 2030 and 2032 national markets
  | 'matrix'
  | 'unprecedented'
  | 'polling'
  | 'feed'

// Each phase's order. Sections not listed don't render in that phase.
const ORDER: Record<ElectionPhase, SectionKey[]> = {
  nomination: [
    'accuracy',
    'leaderboards',
    'roadAhead',
    'race',
    'map',
    'movers',
    'primaries',
    'runningMates',
    'roadTo270',
    'board',
    'trending',
    'offYear',
    'swings2026',
    'later',
    'matrix',
    'unprecedented',
    'polling',
    'feed',
  ],
  primaries: [
    'leaderboards',
    'roadAhead',
    'primaries',
    'map',
    'race',
    'movers',
    'runningMates',
    'roadTo270',
    'board',
    'trending',
    'later',
    'matrix',
    'unprecedented',
    'polling',
    'feed',
  ],
  conventions: [
    'leaderboards',
    'roadAhead',
    'race',
    'map',
    'runningMates',
    'roadTo270',
    'board',
    'movers',
    'primaries',
    'trending',
    'later',
    'matrix',
    'unprecedented',
    'polling',
    'feed',
  ],
  general: [
    'leaderboards',
    'roadAhead',
    'race',
    'map',
    'roadTo270',
    'board',
    'runningMates',
    'movers',
    'trending',
    'matrix',
    'later',
    'unprecedented',
    'polling',
    'feed',
  ],
  results: [
    'leaderboards',
    'board',
    'map',
    'race',
    'roadTo270',
    'roadAhead',
    'runningMates',
    'later',
    'matrix',
    'polling',
    'feed',
  ],
  midterms2030: [
    'leaderboards',
    'roadAhead',
    'midterms2030',
    'offYear',
    'later',
    'board',
    'race',
    'roadTo270',
    'polling',
    'feed',
  ],
}

export const sectionOrder = (phase: ElectionPhase) => ORDER[phase]

// Whether the page needs a section's data at all in this phase (so the
// loader skips the 2030 board before 2029, the primaries after 2028, …).
export const showsSection = (phase: ElectionPhase, section: SectionKey) =>
  ORDER[phase].includes(section)
