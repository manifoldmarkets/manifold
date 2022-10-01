import { HeartIcon } from '@heroicons/react/outline'
import { Button } from 'web/components/button'
import React, { useMemo, useState } from 'react'
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
import { Tooltip } from '../tooltip'

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

  const [isLiking, setIsLiking] = useState(false)

  const userLikedContractIds = likes
    ?.filter((l) => l.type === 'contract')
    .map((l) => l.id)

  const onLike = async () => {
    if (!user) return firebaseLogin()

    setIsLiking(true)
    likeContract(user, contract).catch(() => setIsLiking(false))
    toast(`You tipped ${contract.creatorName} ${formatMoney(LIKE_TIP_AMOUNT)}!`)
  }

  return (
    <Tooltip
      text={`Tip ${formatMoney(LIKE_TIP_AMOUNT)}`}
      placement="bottom"
      noTap
      noFade
    >
      <Button
        size={'sm'}
        className={'max-w-xs self-center'}
        color={'gray-white'}
        onClick={onLike}
      >
        <Col className={'relative items-center sm:flex-row'}>
          <HeartIcon
            className={clsx(
              'h-5 w-5 sm:h-6 sm:w-6',
              totalTipped > 0 ? 'mr-2' : '',
              user &&
                (isLiking ||
                  userLikedContractIds?.includes(contract.id) ||
                  (!likes && contract.likedByUserIds?.includes(user.id)))
                ? 'fill-red-500 text-red-500'
                : ''
            )}
          />
          {totalTipped > 0 && (
            <div
              className={clsx(
                'bg-greyscale-6 absolute ml-3.5 mt-2 h-4 w-4 rounded-full align-middle text-white sm:mt-3 sm:h-5 sm:w-5 sm:px-1',
                totalTipped > 99
                  ? 'text-[0.4rem] sm:text-[0.5rem]'
                  : 'sm:text-2xs text-[0.5rem]'
              )}
            >
              {totalTipped}
            </div>
          )}
        </Col>
      </Button>
    </Tooltip>
  )
}
