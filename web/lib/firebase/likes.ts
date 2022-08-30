import { collection, deleteDoc, doc, setDoc } from 'firebase/firestore'
import { db } from 'web/lib/firebase/init'
import toast from 'react-hot-toast'
import { transact } from 'web/lib/firebase/api'
import { removeUndefinedProps } from 'common/util/object'
import { Like } from 'common/like'
import { track } from '@amplitude/analytics-browser'
import { User } from 'common/user'
import { Contract } from 'common/contract'

export const LIKE_TIP_AMOUNT = 5

function getLikesCollection(userId: string) {
  return collection(db, 'users', userId, 'likes')
}

export const unLikeContract = async (userId: string, contractId: string) => {
  const ref = await doc(getLikesCollection(userId), contractId)
  return await deleteDoc(ref)
}

export const likeContract = async (user: User, contract: Contract) => {
  if (user.balance < LIKE_TIP_AMOUNT) {
    toast('You do not have enough M$ to like this market!')
    return
  }
  let result: any = {}
  if (LIKE_TIP_AMOUNT > 0) {
    result = await transact({
      amount: LIKE_TIP_AMOUNT,
      fromId: user.id,
      fromType: 'USER',
      toId: contract.creatorId,
      toType: 'USER',
      token: 'M$',
      category: 'TIP',
      data: { contractId: contract.id },
      description: `${user.name} liked contract ${contract.id} for M$ ${LIKE_TIP_AMOUNT} to ${contract.creatorId} `,
    })
    console.log('result', result)
  }
  // create new like in db under users collection
  const ref = doc(getLikesCollection(user.id), contract.id)
  // contract slug and question are set via trigger
  const like = removeUndefinedProps({
    id: ref.id,
    userId: user.id,
    createdTime: Date.now(),
    type: 'contract',
    tipTxnId: result.txn.id,
  } as Like)
  track('like', {
    contractId: contract.id,
  })
  await setDoc(ref, like)
}
