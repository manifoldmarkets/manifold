import { HeartIcon } from '@heroicons/react/outline'
import { Button } from 'web/components/button'
import React from 'react'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import { collection, deleteDoc, doc, setDoc } from 'firebase/firestore'
import { removeUndefinedProps } from 'common/util/object'
import { track } from '@amplitude/analytics-browser'
import { db } from 'web/lib/firebase/init'
import { Like } from 'common/like'
import { useUserLikes } from 'web/hooks/use-likes'
import { transact } from 'web/lib/firebase/api'
import toast from 'react-hot-toast'
import { formatMoney } from 'common/util/format'

function getLikesCollection(userId: string) {
  return collection(db, 'users', userId, 'likes')
}
const LIKE_TIP_AMOUNT = 5

export function LikeMarketButton(props: {
  contract: Contract
  user: User | null | undefined
}) {
  const { contract, user } = props

  const likes = useUserLikes(user?.id)
  const likedContractIds = likes?.map((l) => l.contractId)
  if (!user) return <div />

  const onLike = async () => {
    if (likedContractIds?.includes(contract.id)) {
      const ref = doc(
        getLikesCollection(user.id),
        likes?.find((l) => l.contractId === contract.id)?.id
      )
      await deleteDoc(ref)
      toast(`You removed this market from your likes`)

      return
    }
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
    const ref = doc(getLikesCollection(user.id))
    // contract slug and question are set via trigger
    const like = removeUndefinedProps({
      id: ref.id,
      userId: user.id,
      createdTime: Date.now(),
      contractId: contract.id,
      tipTxnId: result.txn.id,
    } as Like)
    track('like', {
      contractId: contract.id,
    })
    await setDoc(ref, like)
    toast(`You tipped ${contract.creatorName} ${formatMoney(LIKE_TIP_AMOUNT)}!`)
  }

  return (
    <Button
      size={'md'}
      className={'mb-1'}
      color={'gray-white'}
      onClick={onLike}
    >
      {likedContractIds?.includes(contract.id) ? (
        <HeartIcon className="h-6 w-6 fill-red-500 text-red-500" />
      ) : (
        <HeartIcon className="h-6 w-6 text-gray-500" />
      )}
    </Button>
  )
}
