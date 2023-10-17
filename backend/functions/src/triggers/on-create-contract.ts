import * as functions from 'firebase-functions'
import { JSONContent } from '@tiptap/core'

import { getUser, log } from 'shared/utils'
import { Contract } from 'common/contract'
import { parseMentions, richTextToString } from 'common/util/parse'
import { addUserToContractFollowers } from 'shared/follow-market'

import { secrets } from 'common/secrets'
import { completeCalculatedQuestFromTrigger } from 'shared/complete-quest-internal'
import { addContractToFeed } from 'shared/create-feed'
import { createNewContractNotification } from 'shared/create-notification'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { upsertGroupEmbedding } from 'shared/helpers/embeddings'

export const onCreateContract = functions
  .runWith({
    secrets,
    timeoutSeconds: 540,
  })
  .firestore.document('contracts/{contractId}')
  .onCreate(async (snapshot, context) => {
    const contract = snapshot.data() as Contract
    const { eventId } = context
    const contractCreator = await getUser(contract.creatorId)
    if (!contractCreator) throw new Error('Could not find contract creator')

    await completeCalculatedQuestFromTrigger(
      contractCreator,
      'MARKETS_CREATED',
      eventId,
      contract.id
    )

    const desc = contract.description as JSONContent
    const mentioned = parseMentions(desc)
    await addUserToContractFollowers(contract.id, contractCreator.id)

    await createNewContractNotification(
      contractCreator,
      contract,
      eventId,
      richTextToString(desc),
      mentioned
    )
    const pg = createSupabaseDirectClient()
    if (contract.visibility !== 'private') {
      const contractEmbedding = await pg.oneOrNone<{ embedding: string }>(
        `select embedding
         from contract_embeddings
         where contract_id = $1`,
        [contract.id]
      )
      const contractHasEmbedding =
        (contractEmbedding?.embedding ?? []).length > 0
      log('contractHasEmbedding:', contractHasEmbedding)
      if (!contractHasEmbedding) {
        // Wait 5 seconds, hopefully the embedding will be there by then
        await new Promise((resolve) => setTimeout(resolve, 5000))
      }
    }
    if (contract.visibility === 'unlisted') return
    await addContractToFeed(
      contract,
      [
        'follow_user',
        'similar_interest_vector_to_contract',
        'contract_in_group_you_are_in',
      ],
      'new_contract',
      [contractCreator.id],
      {
        idempotencyKey: contract.id + '_new_contract',
      }
    )
    const groupIds = (contract.groupLinks ?? []).map((gl) => gl.groupId)
    await Promise.all(
      groupIds.map(async (groupId) => upsertGroupEmbedding(pg, groupId))
    )
  })
