import { ApprovalPoll } from 'common/perps/trump-approval'

import {
  TRUMP_APPROVAL_SPEC,
  VoteHubPoll as VoteHubFeedPoll,
  fetchVoteHubAverage,
  fetchVoteHubPolls,
  toVoteHubPolls,
} from './votehub-feeds'

// The Trump approval adapter. Everything here delegates to the parameterised
// VoteHub adapter in ./votehub-feeds.ts with TRUMP_APPROVAL_SPEC, which
// reproduces this feed exactly: same endpoints, same query parameters, same
// `Approve` choice, same `[trump-approval]` log prefix. These names are kept
// so the backfill script and the publisher read as they always did.

export type VoteHubPoll = VoteHubFeedPoll

export const TRUMP_INAUGURATION_DATE = '2025-01-21'

/** VoteHub's key for the Trump approval average. */
export const VOTEHUB_TRUMP_APPROVAL_KEY = TRUMP_APPROVAL_SPEC.averageKey

/** Fetch every Trump approval poll from VoteHub since `startDate`. */
export const fetchTrumpApprovalPolls = (
  startDate: string
): Promise<VoteHubPoll[]> => fetchVoteHubPolls(TRUMP_APPROVAL_SPEC, startDate)

/** Fetch VoteHub's published, time-weighted Trump approval average. */
export const fetchTrumpApprovalAverage = () =>
  fetchVoteHubAverage(TRUMP_APPROVAL_SPEC)

/** Shape VoteHub rows into the methodology's input, dropping unusable ones. */
export const toApprovalPolls = (polls: VoteHubPoll[]): ApprovalPoll[] =>
  toVoteHubPolls(TRUMP_APPROVAL_SPEC, polls)
