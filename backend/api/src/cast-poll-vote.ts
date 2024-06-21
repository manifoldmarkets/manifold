import { createSupabaseDirectClient } from 'shared/supabase/init'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers/endpoint'
import { PollOption } from 'common/poll-option'
import { createVotedOnPollNotification } from 'shared/create-notification'
import {
  getContract,
  getUser,
  revalidateContractStaticProps,
} from 'shared/utils'
import { updateContract } from 'shared/supabase/contracts'

const schema = z
  .object({
    contractId: z.string(),
    voteId: z.string(),
  })
  .strict()

export const castpollvote = authEndpoint(async (req, auth) => {
  const { contractId, voteId } = validate(schema, req.body)
  const user = await getUser(auth.uid)
  if (!user) {
    throw new APIError(404, 'User not found')
  }
  if (user?.isBannedFromPosting) {
    throw new APIError(403, 'You are banned and cannot vote')
  }

  return createSupabaseDirectClient().tx(async (t) => {
    const contract = await getContract(t, contractId)
    if (!contract) {
      throw new APIError(404, 'Contract not found')
    }

    if (contract.outcomeType !== 'POLL') {
      throw new APIError(403, 'This contract is not a poll')
    }
    const options: PollOption[] = contract.options
    // Find the option to update
    const optionToUpdate = options.find((o) => o.id === voteId)

    const totalVoters = await t.manyOrNone(
      `select * from votes where contract_id = $1`,
      [contractId, voteId]
    )

    const idVoters = totalVoters.filter((v) => v.id == voteId)

    if (totalVoters.some((v) => v.user_id === auth.uid)) {
      throw new APIError(403, 'You have already voted on this poll')
    }

    // Update the votes field
    if (optionToUpdate) {
      optionToUpdate.votes = idVoters.length + 1
    }

    // Write the updated options back to the document
    await updateContract(t, contractId, {
      options,
      uniqueBettorCount: totalVoters.length + 1,
    })

    // create the vote row
    const { id } = await t.one(
      `insert into votes(id, contract_id, user_id)
        values ($1, $2, $3)
        returning id`,
      [voteId, contractId, auth.uid]
    )

    await createVotedOnPollNotification(
      auth.uid,
      optionToUpdate?.text ?? '',
      contract
    )

    return {
      result: { status: 'success', voteId: id },
      continue: async () => {
        await revalidateContractStaticProps(contract)
      },
    }
  })
})
