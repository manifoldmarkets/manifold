import { PollType } from 'common/contract'
import { PollOption } from 'common/poll-option'
import { createPollClosedNotification } from 'shared/create-notification'
import { updateContract } from 'shared/supabase/contracts'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'

export async function pollPollResolutions() {
  const pg = createSupabaseDirectClient()
  const closedPolls = await pg.manyOrNone(
    `select data from contracts where outcome_type = 'POLL' and close_time < now() and resolution_time is null`
  )

  await Promise.all(
    closedPolls.map(async (poll) => {
      const pollType: PollType = poll.data.pollType ?? 'single'
      const options: PollOption[] = poll.data.options
      const contractId: string = poll.data.id

      let winnerIds: string[]

      if (pollType === 'ranked-choice') {
        // Use Minimax for ranked-choice polls
        winnerIds = await getMinimaxWinners(pg, contractId, options)
      } else {
        // For single and multi-select, winner is by vote count
        winnerIds = getMaxVoteIds(options)
      }

      const update = {
        resolutionTime: Date.now(),
        resolutions: winnerIds,
        isResolved: true,
      }

      const notificationMessage = getWinnerNotificationMessage(
        options,
        winnerIds,
        pollType
      )

      await createPollClosedNotification(notificationMessage, poll.data)
      return updateContract(pg, contractId, update)
    })
  )
}

// Minimax method for ranked-choice voting
// Winner = candidate whose worst pairwise defeat is smallest
async function getMinimaxWinners(
  pg: SupabaseDirectClient,
  contractId: string,
  options: PollOption[]
): Promise<string[]> {
  // Fetch all votes with rankings
  const votes = await pg.manyOrNone<{
    user_id: string
    id: string // option id
    rank: number
  }>(
    `select user_id, id, rank from votes 
     where contract_id = $1 and rank is not null`,
    [contractId]
  )

  if (votes.length === 0) {
    // No ranked votes, fall back to vote count
    return getMaxVoteIds(options)
  }

  // Group votes by user
  const votesByUser = new Map<string, Map<string, number>>()
  for (const vote of votes) {
    if (!votesByUser.has(vote.user_id)) {
      votesByUser.set(vote.user_id, new Map())
    }
    votesByUser.get(vote.user_id)!.set(vote.id, vote.rank)
  }

  const optionIds = options.map((o) => o.id)

  // Build pairwise preference matrix
  // pairwise[A][B] = number of voters who prefer A over B
  const pairwise = new Map<string, Map<string, number>>()
  for (const a of optionIds) {
    pairwise.set(a, new Map())
    for (const b of optionIds) {
      pairwise.get(a)!.set(b, 0)
    }
  }

  // Count pairwise preferences
  for (const [, userRankings] of votesByUser) {
    for (const a of optionIds) {
      for (const b of optionIds) {
        if (a === b) continue

        const rankA = userRankings.get(a)
        const rankB = userRankings.get(b)

        // Lower rank = better (1st > 2nd > 3rd)
        // If A is ranked and B is not, A wins
        // If both ranked, lower rank wins
        // If neither ranked, no preference
        if (rankA !== undefined && rankB === undefined) {
          pairwise.get(a)!.set(b, pairwise.get(a)!.get(b)! + 1)
        } else if (
          rankA !== undefined &&
          rankB !== undefined &&
          rankA < rankB
        ) {
          pairwise.get(a)!.set(b, pairwise.get(a)!.get(b)! + 1)
        }
      }
    }
  }

  // Calculate worst defeat for each option
  // Defeat margin = pairwise[B][A] - pairwise[A][B] (how badly A loses to B)
  const worstDefeat = new Map<string, number>()
  for (const a of optionIds) {
    let worst = -Infinity // Start with "no defeats"
    for (const b of optionIds) {
      if (a === b) continue
      const aBeatsB = pairwise.get(a)!.get(b)!
      const bBeatsA = pairwise.get(b)!.get(a)!
      const defeatMargin = bBeatsA - aBeatsB // Positive = A loses to B
      if (defeatMargin > worst) {
        worst = defeatMargin
      }
    }
    worstDefeat.set(a, worst)
  }

  // Winner = option(s) with smallest worst defeat
  let minDefeat = Infinity
  for (const [, defeat] of worstDefeat) {
    if (defeat < minDefeat) {
      minDefeat = defeat
    }
  }

  const winners: string[] = []
  for (const [optionId, defeat] of worstDefeat) {
    if (defeat === minDefeat) {
      winners.push(optionId)
    }
  }

  return winners
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
    return `'${winner.text}' won by ranked-choice voting`
  }

  return `'${winner.text}' won with ${winner.votes} votes`
}
