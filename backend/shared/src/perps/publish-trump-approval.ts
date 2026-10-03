import {
  VoteHubPublishResult,
  publishVoteHubPoint,
  voteHubDay,
} from 'shared/perps/publish-votehub-average'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { TRUMP_APPROVAL_SPEC, VOTEHUB_TZ } from 'shared/votehub-feeds'

// The Trump approval publisher: publishVoteHubPoint with TRUMP_APPROVAL_SPEC.
// The structure (observe → early-out → canary → advisory lock → re-decide →
// validate → insert → apply) lives in publish-votehub-average.ts and is
// shared with the other VoteHub feeds; this file keeps the names the
// scheduler job and the operator scripts have always used.

export const TRUMP_APPROVAL_TZ = VOTEHUB_TZ

export const trumpApprovalDay = (now: number = Date.now()) =>
  voteHubDay(TRUMP_APPROVAL_SPEC, now)

export type TrumpApprovalPublishResult = VoteHubPublishResult

/**
 * Publish ONE observation of VoteHub's current Trump approval average,
 * stamped when it becomes available to the market. See publishVoteHubPoint.
 */
export const publishTrumpApprovalPoint = (
  pg: SupabaseDirectClient,
  options: { force?: boolean } = {}
): Promise<TrumpApprovalPublishResult> =>
  publishVoteHubPoint(pg, TRUMP_APPROVAL_SPEC, options)
