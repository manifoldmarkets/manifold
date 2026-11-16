import { JSONContent } from '@tiptap/core'
import { getUser } from 'shared/utils'
import { Contract } from 'common/contract'
import { parseMentions, richTextToString } from 'common/util/parse'
import { completeCalculatedQuestFromTrigger } from 'shared/complete-quest-internal'
import { createNewContractNotification } from 'shared/notifications/create-new-contract-notif'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { upsertGroupEmbedding } from 'shared/helpers/embeddings'
import {
  generateContractEmbeddings,
  isContractNonPredictive,
} from 'shared/supabase/contracts'
import { addGroupToContract } from 'shared/update-group-contracts-internal'
import { UNRANKED_GROUP_ID } from 'common/supabase/groups'
import { HOUSE_LIQUIDITY_PROVIDER_ID } from 'common/antes'
import { followContractInternal } from 'api/follow-contract'

export const onCreateMarket = async (
  contract: Contract,
  embedding: number[]
) => {
  const { creatorId } = contract
  const eventId = contract.id + '-on-create'
  const contractCreator = await getUser(creatorId)
  if (!contractCreator) throw new Error('Could not find contract creator')

  await completeCalculatedQuestFromTrigger(
    contractCreator,
    'MARKETS_CREATED',
    eventId,
    contract.id
  )
  const desc = contract.description as JSONContent
  const mentioned = parseMentions(desc)
  const pg = createSupabaseDirectClient()
  await followContractInternal(pg, contract.id, true, contractCreator.id)

  await createNewContractNotification(
    contractCreator,
    contract,
    eventId,
    richTextToString(desc),
    mentioned
  )
  // Try again if first embedding failed
  if (!embedding) await generateContractEmbeddings(contract, pg)
  const isNonPredictive = await isContractNonPredictive(contract)
  if (isNonPredictive) {
    await addGroupToContract(
      pg,
      contract,
      {
        id: UNRANKED_GROUP_ID,
        slug: 'nonpredictive',
      },
      HOUSE_LIQUIDITY_PROVIDER_ID
    )
    // await addGroupToContract(
    //   pg,
    //   contract,
    //   {
    //     id: UNSUBSIDIZED_GROUP_ID,
    //     slug: 'unsubsidized',
    //   },
    //   HOUSE_LIQUIDITY_PROVIDER_ID
    // )
    // log('Added contract to unsubsidized group')
  }
  if (contract.visibility === 'public') {
    const groupIds = await pg.map(
      `select group_id from group_contracts where contract_id = $1`,
      [contract.id],
      (data) => data.group_id
    )

    await Promise.all(
      groupIds.map(async (groupId) => upsertGroupEmbedding(pg, groupId))
    )
  }
}
