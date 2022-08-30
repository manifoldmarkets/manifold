import { HeartIcon } from '@heroicons/react/outline'
import { Button } from 'web/components/button'
import React from 'react'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import { useUserLikes } from 'web/hooks/use-likes'
import toast from 'react-hot-toast'
import { formatMoney } from 'common/util/format'
import { likeContract, unLikeContract } from 'web/lib/firebase/likes'
import { LIKE_TIP_AMOUNT } from 'common/like'

export function LikeMarketButton(props: {
  contract: Contract
  user: User | null | undefined
}) {
  const { contract, user } = props

  const likes = useUserLikes(user?.id)
  const likedContractIds = likes
    ?.filter((l) => l.type === 'contract')
    .map((l) => l.id)
  if (!user) return <div />

  const onLike = async () => {
    if (likedContractIds?.includes(contract.id)) {
      await unLikeContract(user.id, contract.id)
      toast(`You removed this market from your likes`)
      return
    }
    await likeContract(user, contract)
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
