import { z } from 'zod'
import * as admin from 'firebase-admin'
import { APIError, authEndpoint, validate } from 'api/helpers'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { CPMMMultiContract, Contract } from 'common/contract'
import { resolveMarketHelper } from 'shared/resolve-market-helpers'
import { getUser } from 'shared/utils'

import { manifoldLoveUserId } from 'common/love/constants'
import { Answer } from 'common/answer'

const rejectLoverSchema = z.object({
  userId: z.string(),
})

export const rejectLover = authEndpoint(async (req, auth, log) => {
  const { userId } = validate(rejectLoverSchema, req.body)
  const yourUserId = auth.uid

  const pg = createSupabaseDirectClient()
  const loverContracts = await pg.map<Contract>(
    `select data from contracts
    where outcome_type = 'MULTIPLE_CHOICE'
    and resolution is null
    and (
      (data->>'loverUserId1' = $1
      and data->>'loverUserId2' = $2)
    or
      (data->>'loverUserId1' = $2
      and data->>'loverUserId2' = $1)
    )`,
    [yourUserId, userId],
    (r) => r.data
  )

  if (loverContracts.length === 0)
    throw new APIError(404, 'No lover contract found')

  const contract = loverContracts[0] as CPMMMultiContract
  const { answers } = contract

  const manifoldLoveUser = await getUser(manifoldLoveUserId)
  if (!manifoldLoveUser) throw new APIError(404, 'Manifold Love user not found')

  log('Rejecting lover', {
    answers,
    contractId: contract.id,
    question: contract.question,
  })

  const firestore = admin.firestore()

  let resolvedContract = contract
  let lastResolution = 'YES'
  for (const answerId of answers.map((a) => a.id)) {
    // Fetch latest answers.
    const answersSnap = await firestore
      .collection(`contracts/${contract.id}/answersCpmm`)
      .get()
    const answers = answersSnap.docs.map((doc) => doc.data() as Answer)
    contract.answers = answers

    const answer = answers.find((a) => a.id === answerId)

    if (!answer) throw new APIError(404, 'Answer not found')
    if (answer.resolution) {
      lastResolution = answer.resolution
      continue
    }

    const outcome = lastResolution === 'YES' ? 'NO' : 'CANCEL'
    log('Resolving ' + answer.text + ' to ' + outcome)

    resolvedContract = (await resolveMarketHelper(
      contract,
      manifoldLoveUser,
      manifoldLoveUser,
      {
        answerId: answer.id,
        outcome,
      },
      log
    )) as CPMMMultiContract

    lastResolution = outcome
  }

  return { status: 'success', contract: resolvedContract }
})
