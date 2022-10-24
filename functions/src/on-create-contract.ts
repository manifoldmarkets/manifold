import * as functions from 'firebase-functions'

import { getUser, getValues } from './utils'
import {
  createBadgeAwardedNotification,
  createNewContractNotification,
} from './create-notification'
import { Contract } from '../../common/contract'
import { parseMentions, richTextToString } from '../../common/util/parse'
import { JSONContent } from '@tiptap/core'
import { addUserToContractFollowers } from './follow-market'
import { User } from '../../common/user'
import * as admin from 'firebase-admin'
import {
  MarketCreatorBadge,
  marketCreatorBadgeRarityThresholds,
} from '../../common/badge'
import { dreamWithDefaultParams } from './dream-utils'

export const onCreateContract = functions
  .runWith({ secrets: ['MAILGUN_KEY', 'DREAM_KEY'] })
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
    await handleMarketCreatorBadgeAward(contractCreator)

    const coverImageUrl = await dreamWithDefaultParams(contract.question)
    await snapshot.ref.update({
      coverImageUrl,
    })
  })

const firestore = admin.firestore()

async function handleMarketCreatorBadgeAward(contractCreator: User) {
  // get all contracts by user and calculate size of array
  const contracts = await getValues<Contract>(
    firestore
      .collection(`contracts`)
      .where('creatorId', '==', contractCreator.id)
      .where('resolution', '!=', 'CANCEL')
  )
  if (marketCreatorBadgeRarityThresholds.includes(contracts.length)) {
    const badge = {
      type: 'MARKET_CREATOR',
      name: 'Market Creator',
      data: {
        totalContractsCreated: contracts.length,
      },
      createdTime: Date.now(),
    } as MarketCreatorBadge
    // update user
    await firestore
      .collection('users')
      .doc(contractCreator.id)
      .update({
        achievements: {
          ...contractCreator.achievements,
          marketCreator: {
            badges: [
              ...(contractCreator.achievements?.marketCreator?.badges ?? []),
              badge,
            ],
          },
        },
      })
    await createBadgeAwardedNotification(contractCreator, badge)
  }
}
