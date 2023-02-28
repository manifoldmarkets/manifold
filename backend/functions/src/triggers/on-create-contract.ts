import { removeUndefinedProps } from 'common/util/object'
import * as functions from 'firebase-functions'

import { getUser } from 'shared/utils'
import { createNewContractNotification } from '../create-notification'
import { Contract } from 'common/contract'
import { parseMentions, richTextToString } from 'common/util/parse'
import { JSONContent } from '@tiptap/core'
import { addUserToContractFollowers } from '../follow-market'

import { dreamWithDefaultParams } from 'shared/dream-utils'
import {
  getDescriptionForQuestion,
  getImagePrompt,
} from 'shared/helpers/openai-utils'

export const onCreateContract = functions
  .runWith({
    secrets: ['MAILGUN_KEY', 'DREAM_KEY', 'OPENAI_API_KEY'],
    timeoutSeconds: 540,
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
    const coverImageUrl = await dreamWithDefaultParams(
      imagePrompt ?? contract.question
    )
    await snapshot.ref.update(
      removeUndefinedProps({
        coverImageUrl,
      })
    )
    const aiDescription = await getDescriptionForQuestion(contract.question)
    await snapshot.ref.update(
      removeUndefinedProps({
        aiDescription,
      })
    )
  })
