import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
import * as admin from 'firebase-admin'
import { PollOption } from 'common/poll-option'
import { Contract, PollContract } from 'common/contract'

const schema = z.object({
  contractId: z.string(),
  voteId: z.string(),
})

export const castpollvote = authEndpoint(async (req, auth) => {
  const { contractId, voteId } = validate(schema, req.body)
  const pg = createSupabaseDirectClient()

  const contractRef = firestore.collection('contracts').doc(contractId)
  const contractSnap = await contractRef.get()
  if (!contractSnap.exists) throw new APIError(404, 'Contract cannot be found')
  const contract = contractSnap.data() as PollContract
  if (contract.outcomeType !== 'POLL') {
    throw new APIError(403, 'This contract is not a poll')
  }

  let options: PollOption[] = contract.options

  // Find the option to update
  let optionToUpdate = options.find((o) => o.id === voteId)

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
    console.log(options)

    // Write the updated options back to the document
    await admin.firestore().runTransaction(async (transaction) => {
      transaction.update(contractRef, {
        options: options,
        uniqueBettorCount: totalVoters.length + 1,
      })
    })

    // create the vote row
    const { id } = await t.one(
      `insert into votes(id, contract_id, user_id)
        values ($1, $2, $3)
        returning id`,
      [voteId, contractId, auth.uid]
    )

    return { status: 'success', voteId: id }
  })
})

const firestore = admin.firestore()
