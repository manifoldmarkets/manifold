import { collection, deleteDoc, doc, setDoc } from 'firebase/firestore'
import { db } from 'web/lib/firebase/init'
import toast from 'react-hot-toast'
import { transact } from 'web/lib/firebase/api'
import { removeUndefinedProps } from 'common/util/object'
import { Like, LIKE_TIP_AMOUNT } from 'common/like'
import { User } from 'common/user'
import { Post } from 'common/post'
import { Contract } from 'common/contract'
import { track } from '../service/analytics'

function getLikesCollection(userId: string) {
  return collection(db, 'users', userId, 'likes')
}

export const unLikeItem = async (userId: string, itemId: string) => {
  const ref = await doc(getLikesCollection(userId), itemId)
  return await deleteDoc(ref)
}

export const likeItem = async (
  user: User,
  item: Contract | Post,
  itemType: string
) => {
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
      toId: item.creatorId,
      toType: 'USER',
      token: 'M$',
      category: 'TIP',
      data: { contractId: item.id },
      description: `${user.name} liked ${itemType}${item.id} for M$ ${LIKE_TIP_AMOUNT} to ${item.creatorId} `,
    })
    console.log('result', result)
  }
  // create new like in db under users collection
  const ref = doc(getLikesCollection(user.id), item.id)
  // contract slug and question are set via trigger
  const like = removeUndefinedProps({
    id: ref.id,
    userId: user.id,
    createdTime: Date.now(),
    type: itemType,
    tipTxnId: result.txn.id,
  } as Like)
  track('like', {
    itemId: item.id,
  })
  await setDoc(ref, like)
}
