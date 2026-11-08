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
  | 'race' // party bar and the face-ended charts
  | 'map' // the map, its tracker and the electoral college model
  | 'national' // balance of power, popular vote, electoral-vote and margin strips
  | 'offYear' // 2027 and 2029 races, and elections abroad
  | 'primaries'
  | 'runningMates' // the conventions: running mates, contested conventions
  | 'board' // the 2028 race board
  | 'later' // 2030 to 2036, by office
  | 'midterms2030' // the 2030 board and balance of power
  | 'matrix'
  | 'polling'
  | 'unprecedented'
  | 'trending'
  | 'swings2026'
  | 'feed'

// Each phase's order. Sections not listed don't render in that phase.
// After the result line and the leaderboards, the answers people come for
// first: the headline race, the map, and Congress and the popular vote.
// Then the rest in the order things happen: the 2027 races, the primaries,
// the conventions, the cycles after. What's over sinks below what's left;
// the extras and the feed come last. Until the general election the map's
// tracker lists each rating's states, so the race board waits for the fall.
const ORDER: Record<ElectionPhase, SectionKey[]> = {
  nomination: [
    'accuracy',
    'leaderboards',
    'race',
    'map',
    'national',
    'offYear',
    'primaries',
    'runningMates',
    'later',
    'matrix',
    'polling',
    'unprecedented',
    'trending',
    'swings2026',
    'feed',
  ],
  primaries: [
    'leaderboards',
    'race',
    'map',
    'national',
    'primaries',
    'runningMates',
    'offYear',
    'later',
    'matrix',
    'polling',
    'unprecedented',
    'trending',
    'feed',
  ],
  conventions: [
    'leaderboards',
    'race',
    'map',
    'national',
    'runningMates',
    'offYear',
    'later',
    'matrix',
    'polling',
    'unprecedented',
    'trending',
    'primaries',
    'feed',
  ],
  general: [
    'leaderboards',
    'race',
    'map',
    'national',
    'board',
    'offYear',
    'later',
    'matrix',
    'polling',
    'unprecedented',
    'trending',
    'runningMates',
    'feed',
  ],
  results: [
    'leaderboards',
    'board',
    'map',
    'race',
    'national',
    'offYear',
    'later',
    'matrix',
    'polling',
    'runningMates',
    'feed',
  ],
  midterms2030: [
    'leaderboards',
    'offYear',
    'midterms2030',
    'later',
    'board',
    'race',
    'polling',
    'feed',
  ],
}

export const sectionOrder = (phase: ElectionPhase) => ORDER[phase]

// Whether the page needs a section's data at all in this phase (so the
// loader skips the 2030 board before 2029, the primaries after 2028, …).
export const showsSection = (phase: ElectionPhase, section: SectionKey) =>
  ORDER[phase].includes(section)
