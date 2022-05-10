import * as admin from 'firebase-admin'
import { Bet } from '../../common/bet'
import { Contract } from '../../common/contract'
import { DAY_MS } from '../../common/util/time'
import { getValues } from './utils'

const firestore = admin.firestore()

export async function getFeedContracts() {
  // Get contracts bet on or created in last week.
  const [activeContracts, inactiveContracts] = await Promise.all([
    getValues<Contract>(
      firestore
        .collection('contracts')
        .where('isResolved', '==', false)
        .where('volume7Days', '>', 0)
    ),

    getValues<Contract>(
      firestore
        .collection('contracts')
        .where('isResolved', '==', false)
        .where('createdTime', '>', Date.now() - DAY_MS * 7)
        .where('volume7Days', '==', 0)
    ),
  ])

  const combined = [...activeContracts, ...inactiveContracts]
  // Remove closed contracts.
  return combined.filter((c) => (c.closeTime ?? Infinity) > Date.now())
}

export async function getTaggedContracts(tag: string) {
  const taggedContracts = await getValues<Contract>(
    firestore
      .collection('contracts')
      .where('isResolved', '==', false)
      .where('lowercaseTags', 'array-contains', tag.toLowerCase())
  )

  // Remove closed contracts.
  return taggedContracts.filter((c) => (c.closeTime ?? Infinity) > Date.now())
}

export async function getRecentBetsAndComments(contract: Contract) {
  const contractDoc = firestore.collection('contracts').doc(contract.id)

  const [recentBets, recentComments] = await Promise.all([
    getValues<Bet>(
      contractDoc
        .collection('bets')
        .where('createdTime', '>', Date.now() - DAY_MS)
        .orderBy('createdTime', 'desc')
        .limit(1)
    ),

    getValues<Comment>(
      contractDoc
        .collection('comments')
        .where('createdTime', '>', Date.now() - 3 * DAY_MS)
        .orderBy('createdTime', 'desc')
        .limit(3)
    ),
  ])

  return {
    contract,
    recentBets,
    recentComments,
  }
}
