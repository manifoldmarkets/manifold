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

export const confirmLoverStage = authEndpoint(async (req, auth) => {
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

  console.log(
    'Confirming lover stage',
    contract.id,
    contract.question,
    answer.text
  )

  const resolvedContract = await resolveMarketHelper(
    contract,
    manifoldLoveUser,
    manifoldLoveUser,
    {
      answerId: answer.id,
      outcome: 'YES',
    }
  )

  return { status: 'success', contract: resolvedContract }
})
