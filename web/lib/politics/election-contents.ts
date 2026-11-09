// /election's contents: the sections on the page, in page order, each with
// its anchor, its name in the contents, and (for the ones tied to the
// calendar) when. The page and the contents both read `hasSection`, so the
// contents lists exactly what the page shows. Pure, no I/O.

import type { Elections2028PageProps } from './elections-2028'
import { placeMore2028 } from './election-glance'
import { ElectionPhase, SectionKey, sectionOrder } from './election-phase'
import { TIMELINE } from './elections-2028-config'

export type ContentsInput = Pick<
  Elections2028PageProps,
  | 'now'
  | 'phase'
  | 'accuracy'
  | 'leaderboards'
  | 'partyContract'
  | 'charts'
  | 'board2028'
  | 'primaries'
  | 'primaryContracts'
  | 'balanceOfPowerContract'
  | 'congressContract'
  | 'popularVoteContract'
  | 'more2028'
  | 'marketKeys'
  | 'demVpContract'
  | 'gopVpContract'
  | 'ticketContract'
  | 'offYear'
  | 'before2028World'
  | 'later'
  | 'board2030'
  | 'balanceOfPower2030'
  | 'seats2030'
  | 'national2028'
  | 'presidencyMatrixRows'
  | 'pollingPerpContracts'
  | 'unprecedentedContracts'
  | 'trendingContracts'
  | 'swings'
>

// Whether a section has anything to show. A section without its markets
// renders nothing, so it isn't in the contents either.
export function hasSection(p: ContentsInput, key: SectionKey): boolean {
  const conventions = p.more2028.some(
    (c) => placeMore2028(p.marketKeys[c.id]) === 'conventions'
  )
  switch (key) {
    case 'accuracy':
      return p.accuracy.chambers.length > 0
    case 'leaderboards':
      return p.leaderboards.length > 0
    case 'race':
      return !!p.partyContract || p.charts.length > 0
    case 'map':
      return p.board2028.length > 0 || p.primaries.length > 0
    case 'national':
      return (
        !!p.balanceOfPowerContract ||
        !!p.congressContract ||
        !!p.popularVoteContract ||
        Object.values(p.national2028).some((c) => !!c) ||
        p.more2028.some(
          (c) => placeMore2028(p.marketKeys[c.id]) !== 'conventions'
        )
      )
    case 'offYear':
      return p.offYear.length > 0 || p.before2028World.length > 0
    case 'primaries':
      return p.primaries.length > 0 || p.primaryContracts.length > 0
    case 'runningMates':
      return (
        !!p.demVpContract ||
        !!p.gopVpContract ||
        !!p.ticketContract ||
        conventions
      )
    case 'board':
      return p.board2028.length > 0
    case 'later':
      return p.later.length > 0
    case 'midterms2030':
      return (
        p.board2030.length > 0 ||
        !!p.balanceOfPower2030 ||
        !!p.seats2030.senate ||
        !!p.seats2030.house
      )
    case 'matrix':
      return p.presidencyMatrixRows.length > 0
    case 'polling':
      return p.pollingPerpContracts.length > 0
    case 'unprecedented':
      return p.unprecedentedContracts.length > 0
    case 'trending':
      return p.trendingContracts.length > 0
    case 'swings2026':
      return p.swings.length > 0
    case 'feed':
      return true
  }
}

// Each section's anchor id.
export const SECTION_IDS: Record<SectionKey, string> = {
  accuracy: 'replay-2026',
  leaderboards: 'leaderboards',
  race: 'race',
  map: 'map',
  national: 'national',
  offYear: 'off-year',
  primaries: 'primaries',
  runningMates: 'running-mates',
  board: 'board',
  later: 'later',
  midterms2030: 'midterms-2030',
  matrix: 'matrix',
  polling: 'polling',
  unprecedented: 'unprecedented',
  trending: 'trending',
  swings2026: 'swings-2026',
  feed: 'feed',
}

// Each section's heading, which the contents uses too.
export function sectionTitle(key: SectionKey, phase: ElectionPhase): string {
  const results = phase === 'results' || phase === 'midterms2030'
  switch (key) {
    case 'accuracy':
      return '2026 result'
    case 'leaderboards':
      return 'Top traders'
    case 'race':
      return results ? 'The 2028 presidential race' : 'The race for 2028'
    case 'map':
      return 'The map'
    case 'national':
      return 'Congress and the popular vote'
    case 'offYear':
      return 'Off-year elections'
    case 'primaries':
      return 'The primaries'
    case 'runningMates':
      return 'Conventions and running mates'
    case 'board':
      return phase === 'results' || phase === 'midterms2030'
        ? '2028 results'
        : 'Every race'
    case 'later':
      return phase === 'midterms2030' ? '2032 and beyond' : 'After 2028'
    case 'midterms2030':
      return 'The 2030 midterms'
    case 'matrix':
      return 'What the 2028 winner would change'
    case 'polling':
      return 'Polling averages'
    case 'unprecedented':
      return 'Unprecedented politics'
    case 'trending':
      return 'Trending'
    case 'swings2026':
      return "2026's biggest swings"
    case 'feed':
      return 'More election markets'
  }
}

// The shorter name the contents lists, where the heading is long.
const CONTENTS_LABEL: Partial<Record<SectionKey, string>> = {
  national: 'Congress and popular vote',
  runningMates: 'Conventions',
  matrix: 'What the winner changes',
  feed: 'All election markets',
}

const DAY = 24 * 60 * 60 * 1000
const timelineEntry = (key: string) => TIMELINE.find((e) => e.key === key)

const dayLabel = (time: number) =>
  new Date(time).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })

// "Nov 2, 2027 · 360 days", or the date alone once it's past.
function dated(time: number, now: number) {
  const days = Math.ceil((time - now) / DAY)
  return days > 0
    ? `${dayLabel(time)} · ${days.toLocaleString('en-US')} ${
        days === 1 ? 'day' : 'days'
      }`
    : dayLabel(time)
}

// When a section's events happen, for its heading and the contents. Only
// the sections tied to the calendar have one.
export function sectionWhen(
  key: SectionKey,
  now: number,
  phase: ElectionPhase
): string | undefined {
  const election = timelineEntry('2028')?.time
  switch (key) {
    case 'map':
    case 'board':
      return election && phase !== 'midterms2030'
        ? dated(election, now)
        : undefined
    case 'offYear': {
      // The next odd-year election still ahead (2027, then 2029).
      const next = ['2027', '2029']
        .map(timelineEntry)
        .find((e) => e?.time && e.until > now)
      return next?.time ? dated(next.time, now) : undefined
    }
    case 'primaries':
      return phase === 'primaries' ? 'Under way' : 'January–June 2028'
    case 'runningMates':
      return phase === 'conventions' ? 'Under way' : 'Summer 2028'
    case 'later':
      return phase === 'midterms2030' ? '2032–2036' : '2030–2036'
    case 'midterms2030': {
      const midterms = timelineEntry('2030')?.time
      return midterms ? dated(midterms, now) : undefined
    }
    case 'swings2026':
      return 'Nov 3, 2026'
    default:
      return undefined
  }
}

export type ContentsEntry = {
  key: SectionKey
  id: string
  label: string
  when?: string
}

// The sections the contents lists: the page's, in its order, minus the
// one-line 2026 result and the leaderboard card above the first heading.
export function pageContents(p: ContentsInput): ContentsEntry[] {
  return sectionOrder(p.phase)
    .filter((key) => key !== 'accuracy' && key !== 'leaderboards')
    .filter((key) => hasSection(p, key))
    .map((key) => ({
      key,
      id: SECTION_IDS[key],
      label: CONTENTS_LABEL[key] ?? sectionTitle(key, p.phase),
      when: sectionWhen(key, p.now, p.phase),
    }))
}
