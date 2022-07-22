import * as functions from 'firebase-functions'
import { getUser } from './utils'
import { createNotification } from './create-notification'
import { Contract } from '../../common/contract'
import { richTextToString } from '../../common/util/parse'
import { JSONContent } from '@tiptap/core'

export const onCreateContract = functions.firestore
  .document('contracts/{contractId}')
  .onCreate(async (snapshot, context) => {
    const contract = snapshot.data() as Contract
    const { eventId } = context

    const contractCreator = await getUser(contract.creatorId)
    if (!contractCreator) throw new Error('Could not find contract creator')

    await createNotification(
      contract.id,
      'contract',
      'created',
      contractCreator,
      eventId,
      richTextToString(contract.description as JSONContent),
      { contract }
    )
  })
