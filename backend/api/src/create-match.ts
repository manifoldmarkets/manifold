import { z } from 'zod'
import { APIError, authEndpoint, validate } from 'api/helpers'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { getUser, isProd } from 'shared/utils'
import { createMarketHelper } from './create-market'
import { Contract } from 'common/contract'
import { placeBetMain } from './place-bet'

const createMatchSchema = z.object({
  userId1: z.string(),
  userId2: z.string(),
  betAmount: z.number().min(10),
})

export const createMatch = authEndpoint(async (req, auth) => {
  const { userId1, userId2, betAmount } = validate(createMatchSchema, req.body)

  const db = createSupabaseClient()

  const [matchCreator, user1, user2] = await Promise.all([
    getUser(auth.uid),
    getUser(userId1),
    getUser(userId2),
  ])
  if (!matchCreator) {
    throw new APIError(404, `User ${auth.uid} does not exist.`)
  }
  if (!user1) {
    throw new APIError(404, `User ${userId1} does not exist.`)
  }
  if (!user2) {
    throw new APIError(404, `User ${userId2} does not exist.`)
  }

  const [{ data: lover1 }, { data: lover2 }] = await Promise.all([
    db.from('lovers').select('id').eq('user_id', userId1).single(),
    db.from('lovers').select('id').eq('user_id', userId2).single(),
  ])

  if (!lover1) {
    throw new APIError(400, `User ${userId1} does not have a love profile.`)
  }
  if (!lover2) {
    throw new APIError(400, `User ${userId2} does not have a love profile.`)
  }

  const pg = createSupabaseDirectClient()
  const loverContracts = await pg.map<Contract>(
    `select data from contracts
    where data->>'loverUserId1' = $1
    and data->>'loverUserId2' = $2`,
    [userId1, userId2],
    (r) => r.data
  )
  if (loverContracts.length > 0) {
    console.log('loverContracts', loverContracts)
    throw new APIError(400, `Match already exists.`)
  }

  const contract = await createMarketHelper(
    {
      question: `Will @${user1.username} and @${user2.username} date for six months?`,
      descriptionMarkdown: ``,
      // closeTime: undefined,
      outcomeType: 'BINARY',
      groupIds: [manifoldLoveRelationshipsGroupId],
      visibility: 'public',
      initialProb: 15,
      loverUserId1: userId1,
      loverUserId2: userId2,
    },
    { uid: manifoldLoveUserId, creds: undefined as any }
  )

  await placeBetMain(
    {
      contractId: contract.id,
      amount: 500,
      outcome: 'NO',
    },
    manifoldLoveUserId,
    true
  )

  await placeBetMain(
    {
      contractId: contract.id,
      amount: betAmount,
      outcome: 'YES',
    },
    matchCreator.id,
    true
  )

  return {
    success: true,
    contract,
  }
})

export const manifoldLoveUserId = isProd() ? '' : 'RlXR2xa4EFfAzdCbSe45wkcdarh1'

const manifoldLoveRelationshipsGroupId = isProd()
  ? ''
  : '77df8782-34b7-4daa-89f4-a75c8ea844d4'
