import { PollContract, PollType } from 'common/contract'
import { PollOption } from 'common/poll-option'
import { createVotedOnPollNotification } from 'shared/create-notification'
import { pollQueue } from 'shared/helpers/fn-queue'
import { updateContract } from 'shared/supabase/contracts'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  getContract,
  getUser,
  revalidateContractStaticProps,
} from 'shared/utils'
import { z } from 'zod'
import { APIError, authEndpointUnbanned, validate } from './helpers/endpoint'

// Schema supports all poll types:
// - Single vote: { contractId, voteId }
// - Multi-select: { contractId, voteIds }
// - Ranked-choice: { contractId, rankedVoteIds }
const schema = z
  .object({
    contractId: z.string(),
    // For single vote polls
    voteId: z.string().optional(),
    // For multi-select polls
    voteIds: z.array(z.string()).optional(),
    // For ranked-choice polls (ordered by preference, first = most preferred)
    rankedVoteIds: z.array(z.string()).optional(),
  })
  .strict()
  .refine(
    (data) => data.voteId || data.voteIds || data.rankedVoteIds,
    'Must provide voteId, voteIds, or rankedVoteIds'
  )

export const castpollvote = authEndpointUnbanned(async (req, auth) => {
  const { contractId, voteId, voteIds, rankedVoteIds } = validate(
    schema,
    req.body
  )
  return await pollQueue.enqueueFn(
    () =>
      castPollVoteMain(contractId, auth.uid, {
        voteId,
        voteIds,
        rankedVoteIds,
      }),
    [contractId]
  )
})

type VoteInput = {
  voteId?: string
  voteIds?: string[]
  rankedVoteIds?: string[]
}

const castPollVoteMain = async (
  contractId: string,
  userId: string,
  voteInput: VoteInput
) => {
  const user = await getUser(userId)
  if (!user) {
    throw new APIError(404, 'User not found')
  }
  const pg = createSupabaseDirectClient()
  const res = await pg.tx(async (t) => {
    const contract = (await getContract(t, contractId)) as PollContract | null
    if (!contract) {
      throw new APIError(404, 'Contract not found')
    }

    if (contract.outcomeType !== 'POLL') {
      throw new APIError(403, 'This contract is not a poll')
    }

    const pollType: PollType = contract.pollType ?? 'single'
    const options: PollOption[] = contract.options
    const maxSelections = contract.maxSelections ?? options.length

    // Check if user has already voted
    const hasVoted = await t.oneOrNone(
      `select 1 as exists from votes where contract_id = $1 and user_id = $2`,
      [contractId, userId],
      (r) => r?.exists
    )

    if (hasVoted) {
      throw new APIError(403, 'You have already voted on this poll')
    }

    // Validate the vote input based on poll type
    const { voteId, voteIds, rankedVoteIds } = voteInput

    let votedOptionIds: string[] = []
    const rankings: Map<string, number> = new Map()

    if (pollType === 'single') {
      if (!voteId) {
        throw new APIError(400, 'Single-vote polls require voteId')
      }
      votedOptionIds = [voteId]
    } else if (pollType === 'multi-select') {
      if (!voteIds || voteIds.length === 0) {
        throw new APIError(400, 'Multi-select polls require voteIds array')
      }
      if (voteIds.length > maxSelections) {
        throw new APIError(
          400,
          `You can only select up to ${maxSelections} options`
        )
      }
      votedOptionIds = voteIds
    } else if (pollType === 'ranked-choice') {
      if (!rankedVoteIds || rankedVoteIds.length === 0) {
        throw new APIError(
          400,
          'Ranked-choice polls require rankedVoteIds array'
        )
      }
      // Check for duplicates
      const uniqueIds = new Set(rankedVoteIds)
      if (uniqueIds.size !== rankedVoteIds.length) {
        throw new APIError(400, 'Duplicate options in ranked votes')
      }
      votedOptionIds = rankedVoteIds
      // Create rankings map (1-indexed)
      rankedVoteIds.forEach((id, index) => {
        rankings.set(id, index + 1)
      })
    }

    // Validate all option IDs exist
    const optionIds = new Set(options.map((o) => o.id))
    for (const optionId of votedOptionIds) {
      if (!optionIds.has(optionId)) {
        throw new APIError(400, `Invalid option ID: ${optionId}`)
      }
    }

    // Calculate updated options
    const numOptions = options.length
    const updatedOptions = options.map((o) => {
      const isVoted = votedOptionIds.includes(o.id)
      const rank = rankings.get(o.id)

      // For ranked-choice, calculate Borda count score:
      // n points for 1st choice, n-1 for 2nd, etc.
      const bordaPoints =
        pollType === 'ranked-choice' && rank ? numOptions - rank + 1 : 0

      return {
        ...o,
        // Increment votes for all selected options
        votes: isVoted ? o.votes + 1 : o.votes,
        // For ranked-choice: update score and first-choice count
        ...(pollType === 'ranked-choice'
          ? { rankedVoteScore: (o.rankedVoteScore ?? 0) + bordaPoints }
          : {}),
      }
    })

    // Update contract with new vote counts
    await updateContract(t, contractId, {
      options: updatedOptions,
      uniqueBettorCount: contract.uniqueBettorCount + 1,
    })

    // Create vote rows
    // For multi-select/ranked-choice, we create one row per option voted
    const primaryVoteId = votedOptionIds[0]
    for (let i = 0; i < votedOptionIds.length; i++) {
      const optionId = votedOptionIds[i]
      const rank = rankings.get(optionId)

      await t.none(
        `insert into votes(id, contract_id, user_id, rank)
          values ($1, $2, $3, $4)`,
        [optionId, contractId, userId, rank ?? null]
      )
    }

    const votedOptions = options.filter((o) => votedOptionIds.includes(o.id))
    return { id: primaryVoteId, votedOptions, contract, pollType }
  })

  // Create notification
  const notificationText =
    res.pollType === 'single'
      ? res.votedOptions[0]?.text ?? ''
      : res.votedOptions.map((o) => o.text).join(', ')

  await createVotedOnPollNotification(user, notificationText, res.contract)

  return {
    result: { status: 'success', voteId: res.id },
    continue: async () => {
      await revalidateContractStaticProps(res.contract)
    },
  }
}
