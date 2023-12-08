import { Contract } from 'common/contract'
import { DAY_MS } from 'common/util/time'
import { FeedTimelineItem } from 'web/hooks/use-feed-timeline'
import { ProbChangeData } from 'common/feed'

const PROB_CHANGE_THRESHOLD = 0.05
export const getMarketMovementInfo = (
  contract: Contract,
  feedItem?: FeedTimelineItem
) => {
  const nullCase = { ignore: true, probChange: undefined, startTime: undefined }
  if (
    contract.mechanism !== 'cpmm-1' ||
    contract.createdTime > Date.now() - DAY_MS
  ) {
    return nullCase
  }
  const probChangeData = feedItem?.data as ProbChangeData | undefined
  const previousProbAbout50 = (prob: number) => prob > 0.47 && prob < 0.53
  const probChangeIsSignificant = (probChange: number) =>
    Math.abs(probChange) > PROB_CHANGE_THRESHOLD

  const calculatePreviousProbability = () => {
    const feedRowStartTime = feedItem?.createdTime ?? 0
    const feedRowPreviousProb = probChangeData?.previousProb ?? 0.5
    const feedRowChange = feedRowPreviousProb - contract.prob

    const canUseFeedRowChange =
      probChangeIsSignificant(feedRowChange) &&
      !previousProbAbout50(feedRowPreviousProb)

    const feedRowCurrentProb = probChangeData?.currentProb ?? 0.5
    const feedRowCurrentProbChange = feedRowCurrentProb - contract.prob
    const canUseFeedRowCurrentProbChange =
      probChangeIsSignificant(feedRowCurrentProbChange) &&
      !previousProbAbout50(feedRowCurrentProb)

    const dayAgoTime = Date.now() - DAY_MS
    const dayAgoProb = contract.prob - contract.probChanges.day
    const dayAgoChange = contract.probChanges.day

    const canUseContractChange =
      probChangeIsSignificant(dayAgoChange) && !previousProbAbout50(dayAgoProb)

    const longTimeElapsed = feedRowStartTime < dayAgoTime - 7 * DAY_MS

    if (canUseContractChange && canUseFeedRowChange) {
      if (feedRowStartTime > dayAgoTime) {
        return {
          previousProb: feedRowPreviousProb,
          startTime: feedRowStartTime - DAY_MS,
        }
      } else {
        return {
          previousProb: dayAgoProb,
          startTime: dayAgoTime,
        }
      }
    } else if (canUseFeedRowCurrentProbChange && longTimeElapsed) {
      return {
        previousProb: feedRowCurrentProb,
        startTime: feedRowStartTime,
      }
    } else if (canUseFeedRowChange) {
      return {
        previousProb: feedRowPreviousProb,
        startTime: feedRowStartTime - DAY_MS,
      }
    } else
      return {
        previousProb: dayAgoProb,
        startTime: dayAgoTime,
      }
  }
  const { previousProb, startTime } = calculatePreviousProbability()

  if (
    contract.createdTime > Date.now() - 2 * DAY_MS &&
    previousProbAbout50(previousProb)
  ) {
    return nullCase
  }

  const probChangeSinceAdd = contract.prob - previousProb
  // Probability change must exceed the threshold and the contract can't be resolved
  if (!probChangeIsSignificant(probChangeSinceAdd) || contract.isResolved) {
    return nullCase
  }

  const probChange = Math.round(probChangeSinceAdd * 100)

  return { ignore: false, probChange, startTime }
}
