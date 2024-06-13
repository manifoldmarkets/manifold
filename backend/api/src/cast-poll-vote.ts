import { createSupabaseDirectClient } from 'shared/supabase/init'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers/endpoint'
import { PollOption } from 'common/poll-option'
import { createVotedOnPollNotification } from 'shared/create-notification'
import { getContract, getUser } from 'shared/utils'
import { updateContract } from 'shared/supabase/contracts'

const schema = z
  .object({
    contractId: z.string(),
    voteId: z.string(),
  })
  .strict()

export const castpollvote = authEndpoint(async (req, auth) => {
  const { contractId, voteId } = validate(schema, req.body)
  const pg = createSupabaseDirectClient()
  const contract = await getContract(pg, contractId)
  if (!contract) {
    throw new APIError(404, 'Contract not found')
  }

  if (contract.outcomeType !== 'POLL') {
    throw new APIError(403, 'This contract is not a poll')
  }

  const user = await getUser(auth.uid)
  if (user?.isBannedFromPosting) {
    throw new APIError(403, 'You are banned and cannot vote')
  }

  const options: PollOption[] = contract.options

  // Find the option to update
  const optionToUpdate = options.find((o) => o.id === voteId)

  return pg.tx(async (t) => {
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
      options: options,
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
    return { status: 'success', voteId: id }
  })
})
