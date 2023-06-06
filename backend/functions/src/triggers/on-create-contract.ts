import * as functions from 'firebase-functions'
import { JSONContent } from '@tiptap/core'

import { getUser } from 'shared/utils'
import { createNewContractNotification } from 'shared/create-notification'
import { Contract } from 'common/contract'
import { parseMentions, richTextToString } from 'common/util/parse'
import { addUserToContractFollowers } from 'shared/follow-market'

import { dalleWithDefaultParams } from 'shared/dream-utils'
import { getImagePrompt } from 'shared/helpers/openai-utils'
import { secrets } from 'common/secrets'
import { completeCalculatedQuestFromTrigger } from 'shared/complete-quest-internal'
import { addContractToFeed } from 'shared/create-feed'

export const onCreateContract = functions
  .runWith({
    secrets,
    timeoutSeconds: 540,
  })
  .firestore.document('contracts/{contractId}')
  .onCreate(async (snapshot, context) => {
    const contract = snapshot.data() as Contract
    const { eventId } = context

    const coverImageUrl = await generateContractImage(contract)
    if (coverImageUrl) await snapshot.ref.update({ coverImageUrl })

    const contractCreator = await getUser(contract.creatorId)
    if (!contractCreator) throw new Error('Could not find contract creator')

    await completeCalculatedQuestFromTrigger(
      contractCreator,
      'MARKETS_CREATED',
      eventId
    )

    const desc = contract.description as JSONContent
    const mentioned = parseMentions(desc)
    await addUserToContractFollowers(contract.id, contractCreator.id)
    await addContractToFeed(
      contract,
      [
        'follow_user',
        'similar_interest_vector_to_user',
        'similar_interest_vector_to_contract',
      ],
      'new_contract',
      [contractCreator.id],
      {
        idempotencyKey: eventId,
        userToContractDistanceThreshold: 0.15,
      }
    )
    // TODO: after feed goes live, remove non mentioned users from notifications
    await createNewContractNotification(
      contractCreator,
      contract,
      eventId,
      richTextToString(desc),
      mentioned
    )
  })

const generateContractImage = async (contract: Contract) => {
  const imagePrompt = await getImagePrompt(contract.question)
  const coverImageUrl = await dalleWithDefaultParams(
    imagePrompt ?? contract.question
  )
  return coverImageUrl
}
