import { HeartIcon } from '@heroicons/react/outline'
import { Button } from 'web/components/button'
import React from 'react'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import { useUserLikes } from 'web/hooks/use-likes'
import toast from 'react-hot-toast'
import { formatMoney } from 'common/util/format'
import { likeContract } from 'web/lib/firebase/likes'
import { LIKE_TIP_AMOUNT } from 'common/like'
import clsx from 'clsx'
import { Col } from 'web/components/layout/col'
import { firebaseLogin } from 'web/lib/firebase/users'

export function LikeMarketButton(props: {
  contract: Contract
  user: User | null | undefined
}) {
  const { contract, user } = props

  const likes = useUserLikes(user?.id)
  const userLikedContractIds = likes
    ?.filter((l) => l.type === 'contract')
    .map((l) => l.id)

  const onLike = async () => {
    if (!user) return firebaseLogin()
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
      <Col className={'sm:flex-row sm:gap-x-2'}>
        <HeartIcon
          className={clsx(
            'h-6 w-6',
            user &&
              (userLikedContractIds?.includes(contract.id) ||
                (!likes && contract.likedByUserIds?.includes(user.id)))
              ? 'fill-red-500 text-red-500'
              : ''
          )}
        />
        Tip
      </Col>
    </Button>
  )
}
