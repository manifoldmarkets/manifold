import { HeartIcon } from '@heroicons/react/outline'
import { Button } from 'web/components/button'
import React, { useMemo } from 'react'
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
import { useMarketTipTxns } from 'web/hooks/use-tip-txns'
import { sum } from 'lodash'

export function LikeMarketButton(props: {
  contract: Contract
  user: User | null | undefined
}) {
  const { contract, user } = props
  const tips = useMarketTipTxns(contract.id).filter(
    (txn) => txn.fromId === user?.id
  )
  const totalTipped = useMemo(() => {
    return sum(tips.map((tip) => tip.amount))
  }, [tips])
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
      className={'max-w-xs self-center'}
      color={'gray-white'}
      onClick={onLike}
    >
      <Col className={'items-center sm:flex-row'}>
        <HeartIcon
          className={clsx(
            'h-[24px] w-5 sm:mr-2',
            user &&
              (userLikedContractIds?.includes(contract.id) ||
                (!likes && contract.likedByUserIds?.includes(user.id)))
              ? 'fill-red-500 text-red-500'
              : ''
          )}
        />
        Tip {totalTipped > 0 ? `(${formatMoney(totalTipped)})` : ''}
      </Col>
    </Button>
  )
}
