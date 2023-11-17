import { z } from 'zod'
import { APIError, authEndpoint, validate } from 'api/helpers'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { CPMMMultiContract, Contract } from 'common/contract'
import { resolveMarketHelper } from 'shared/resolve-market-helpers'
import { getUser } from 'shared/utils'
import { manifoldLoveUserId } from 'common/love/constants'

const confirmLoverStageSchema = z.object({
  contractId: z.string(),
  answerId: z.string(),
})

export const confirmLoverStage = authEndpoint(async (req, auth, log) => {
  const { contractId, answerId } = validate(confirmLoverStageSchema, req.body)
  const yourUserId = auth.uid

  const pg = createSupabaseDirectClient()
  const loverContracts = await pg.map<Contract>(
    `select data from contracts
    where
      id = $1
      and outcome_type = 'MULTIPLE_CHOICE'
      and resolution is null
      and (
        data->>'loverUserId1' = $2
        or
        data->>'loverUserId2' = $2
      )`,
    [contractId, yourUserId],
    (r) => r.data
  )

  if (loverContracts.length === 0)
    throw new APIError(404, 'No lover contract found')

  const contract = loverContracts[0] as CPMMMultiContract
  const { answers } = contract

  const answer = answers.find((a) => a.id === answerId)
  if (!answer) throw new APIError(404, 'Answer not found')

  const manifoldLoveUser = await getUser(manifoldLoveUserId)
  if (!manifoldLoveUser) throw new APIError(404, 'Manifold Love user not found')

  // Find other lover contracts resolved by you in the last day.
  const yourLoverContracts = await pg.map<Contract>(
    `select data from contracts
    where
      outcome_type = 'MULTIPLE_CHOICE'
      and resolution is not null
      and (
        data->>'loverUserId1' = $1
        or
        data->>'loverUserId2' = $1
      )
      and resolution_time > now() - interval '1 day'`,
    [yourUserId],
    (r) => r.data
  )

  const otherLoverContracts = yourLoverContracts.filter(
    (c) => c.id !== contract.id
  )

  if (otherLoverContracts.length > 0) {
    throw new APIError(
      400,
      'You can only confirm one new relationship stage per day.'
    )
  }

  log('Confirming lover stage ', {
    contractId: contract.id,
    question: contract.question,
    answerText: answer.text,
    outcome: 'YES',
  })

  const resolvedContract = await resolveMarketHelper(
    contract,
    manifoldLoveUser,
    manifoldLoveUser,
    {
      answerId: answer.id,
      outcome: 'YES',
    },
    log
  )

  return { status: 'success', contract: resolvedContract }
})
