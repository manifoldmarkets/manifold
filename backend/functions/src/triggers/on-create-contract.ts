import * as functions from 'firebase-functions'
import { JSONContent } from '@tiptap/core'

import { getUser } from 'shared/utils'
import { createNewContractNotification } from 'shared/create-notification'
import { Contract } from 'common/contract'
import { parseMentions, richTextToString } from 'common/util/parse'
import { addUserToContractFollowers } from 'shared/follow-market'

import { dalleWithDefaultParams } from 'shared/dream-utils'
import { getImagePrompt, generateEmbeddings } from 'shared/helpers/openai-utils'
import { createSupabaseClient } from 'shared/supabase/init'
import { secrets } from 'shared/secrets'
import { completeQuestInternal } from 'shared/quest'

export const onCreateContract = functions
  .runWith({
    secrets,
  })
  .firestore.document('contracts/{contractId}')
  .onCreate(async (snapshot, context) => {
    const contract = snapshot.data() as Contract
    const { eventId } = context

    const contractCreator = await getUser(contract.creatorId)
    if (!contractCreator) throw new Error('Could not find contract creator')

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
    const imagePrompt = await getImagePrompt(contract.question)
    const coverImageUrl = await dalleWithDefaultParams(
      imagePrompt ?? contract.question
    )
    if (coverImageUrl)
      await snapshot.ref.update({
        coverImageUrl,
      })

    const embedding = await generateEmbeddings(contract.question)
    if (!embedding) return

    await createSupabaseClient()
      .from('contract_embeddings')
      .insert({ contract_id: contract.id, embedding })

    await completeQuestInternal(contractCreator, 'MARKETS_CREATED')
  })
