import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { getPrivateUser, getUser } from './utils'
import { createNotification } from './create-notification'
import { Contract } from '../../common/contract'
import { parseMentions, richTextToString } from '../../common/util/parse'
import { JSONContent } from '@tiptap/core'
import { User } from 'common/user'
import { sendCreatorGuideEmail } from './emails'

export const onCreateContract = functions
  .runWith({ secrets: ['MAILGUN_KEY'] })
  .firestore.document('contracts/{contractId}')
  .onCreate(async (snapshot, context) => {
    const contract = snapshot.data() as Contract
    const { eventId } = context

    const contractCreator = await getUser(contract.creatorId)
    if (!contractCreator) throw new Error('Could not find contract creator')

    const desc = contract.description as JSONContent
    const mentioned = parseMentions(desc)

    await createNotification(
      contract.id,
      'contract',
      'created',
      contractCreator,
      eventId,
      richTextToString(desc),
      { contract, recipients: mentioned }
    )

    await sendGuideEmail(contractCreator)
  })

const firestore = admin.firestore()

const sendGuideEmail = async (contractCreator: User) => {
  const query = await firestore
    .collection(`contracts`)
    .where('creatorId', '==', contractCreator.id)
    .limit(2)
    .get()

  if (query.size >= 2) return

  const privateUser = await getPrivateUser(contractCreator.id)
  if (!privateUser) return

  await sendCreatorGuideEmail(contractCreator, privateUser)
}
