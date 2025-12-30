import { PollType } from 'common/contract'
import { PollOption } from 'common/poll-option'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { createPollClosedNotification } from 'shared/create-notification'
import { updateContract } from 'shared/supabase/contracts'

export async function pollPollResolutions() {
  const pg = createSupabaseDirectClient()
  const closedPolls = await pg.manyOrNone(
    `select data from contracts where outcome_type = 'POLL' and close_time < now() and resolution_time is null`
  )

  await Promise.all(
    closedPolls.map(async (poll) => {
      const pollType: PollType = poll.data.pollType ?? 'single'
      const options: PollOption[] = poll.data.options

      const maxVoteIds = getWinningOptionIds(options, pollType)

      const update = {
        resolutionTime: Date.now(),
        resolutions: maxVoteIds,
        isResolved: true,
      }

      const notificationMessage = getWinnerNotificationMessage(
        options,
        maxVoteIds,
        pollType
      )

      await createPollClosedNotification(notificationMessage, poll.data)
      return updateContract(pg, poll.data.id, update)
    })
  )
}

// Get winning option IDs based on poll type
export function getWinningOptionIds(
  options: PollOption[],
  pollType: PollType
): string[] {
  if (pollType === 'ranked-choice') {
    // For ranked-choice, winner is determined by Borda count (rankedVoteScore)
    return getMaxScoreIds(options)
  } else {
    // For single and multi-select, winner is by vote count
    return getMaxVoteIds(options)
  }
}

// Get options with highest vote count (for single and multi-select)
export function getMaxVoteIds(arr: PollOption[]): string[] {
  const result = arr.reduce<{ maxVotes: number; maxVoteIds: string[] }>(
    (acc, item) => {
      if (item.votes > acc.maxVotes) {
        return { maxVotes: item.votes, maxVoteIds: [item.id] }
      } else if (item.votes === acc.maxVotes) {
        acc.maxVoteIds.push(item.id)
      }
      return acc
    },
    { maxVotes: -Infinity, maxVoteIds: [] }
  )

  return result.maxVoteIds
}

// Get options with highest ranked vote score (for ranked-choice)
export function getMaxScoreIds(arr: PollOption[]): string[] {
  const result = arr.reduce<{ maxScore: number; maxScoreIds: string[] }>(
    (acc, item) => {
      const score = item.rankedVoteScore ?? 0
      if (score > acc.maxScore) {
        return { maxScore: score, maxScoreIds: [item.id] }
      } else if (score === acc.maxScore) {
        acc.maxScoreIds.push(item.id)
      }
      return acc
    },
    { maxScore: -Infinity, maxScoreIds: [] }
  )

  return result.maxScoreIds
}

function getWinnerNotificationMessage(
  options: PollOption[],
  winnerIds: string[],
  pollType: PollType
): string {
  if (winnerIds.length !== 1) {
    return `It's a tie!`
  }

  const winner = options.find((o) => o.id === winnerIds[0])
  if (!winner) {
    return `It's a tie!`
  }

  if (pollType === 'ranked-choice') {
    return `'${winner.text}' won with ${winner.rankedVoteScore ?? 0} points`
  } else {
    return `'${winner.text}' won with ${winner.votes} votes`
  }
}
