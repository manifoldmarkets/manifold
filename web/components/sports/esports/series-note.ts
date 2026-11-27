import type { EsportsReview } from 'common/bdl/esports-series'
import { EsportsSeriesFacts } from 'common/esports/types'

const FORFEIT = 'Forfeit: settled by a person'
const BAD_SCORE = "Score doesn't add up: under review"

/** Why a finished series shows no winner, for each reason the reader holds one. */
const HELD_RESULT: Record<EsportsReview, string> = {
  forfeit: FORFEIT,
  entrants: 'Teams unconfirmed: result under review',
  // Valorant sends no best-of, so every Valorant result is held this way.
  format: 'Series length unknown: result under review',
  status: 'Result not confirmed: under review',
  score: BAD_SCORE,
  winner: "Winner doesn't match the score: under review",
  // The reader holds a series for its start only while it is scheduled.
  start: 'Result under review',
}

/**
 * The same reasons on a series still to finish. Null where the row already
 * says all there is: no start reads "Time to be announced", and a series of
 * unknown length just has no "Bo" beside it.
 */
const HELD_OPEN: Record<EsportsReview, string | null> = {
  forfeit: FORFEIT,
  entrants: 'Teams unconfirmed',
  format: null,
  status: 'Status unclear: under review',
  score: BAD_SCORE,
  // The reader holds a series for its winner only once it is final.
  winner: 'Status unclear: under review',
  start: null,
}

// The series type carries the review as a plain string, so one that isn't in
// the reader's list (a newer reader, an older page) still gets a plain note.
const isReview = (review: string): review is EsportsReview =>
  Object.prototype.hasOwnProperty.call(HELD_RESULT, review)

/**
 * What to say beside a series the reader held back, or null for nothing.
 * "Under review" is only for a result: a scheduled series missing a team
 * reads "Teams TBD".
 */
export function seriesNote(
  series: Pick<EsportsSeriesFacts, 'status' | 'review' | 'team1' | 'team2'>
): string | null {
  const { status, review, team1, team2 } = series
  if (review === 'forfeit') return FORFEIT
  if (status === 'scheduled' && (!team1 || !team2)) return 'Teams TBD'
  if (!review) return null
  if (status === 'final')
    return isReview(review) ? HELD_RESULT[review] : 'Result under review'
  return isReview(review) ? HELD_OPEN[review] : 'Under review'
}
