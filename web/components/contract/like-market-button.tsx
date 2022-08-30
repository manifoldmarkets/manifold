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
import clsx from 'clsx'
import { Row } from 'web/components/layout/row'

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
      return
    }
    await likeContract(user, contract)
    toast(`You tipped ${contract.creatorName} ${formatMoney(LIKE_TIP_AMOUNT)}!`)
  }

  return (
    <Button
      size={'lg'}
      className={'mb-1'}
      color={'gray-white'}
      onClick={onLike}
    >
      <Row className={'gap-0 sm:gap-2'}>
        <HeartIcon
          className={clsx(
            'h-6 w-6',
            likedContractIds?.includes(contract.id)
              ? 'fill-red-500 text-red-500'
              : ''
          )}
        />
        <span className={'hidden sm:block'}>Tip</span>
      </Row>
    </Button>
  )
}
