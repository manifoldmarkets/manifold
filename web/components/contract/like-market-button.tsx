import React, { useMemo, useState } from 'react'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import { useUserLikes } from 'web/hooks/use-likes'
import toast from 'react-hot-toast'
import { formatMoney } from 'common/util/format'
import { likeContract } from 'web/lib/firebase/likes'
import { LIKE_TIP_AMOUNT, TIP_UNDO_DURATION } from 'common/like'
import { firebaseLogin } from 'web/lib/firebase/users'
import { useMarketTipTxns } from 'web/hooks/use-tip-txns'
import { sum } from 'lodash'
import { TipButton } from './tip-button'
import { TipToast } from '../tipper'

export function LikeMarketButton(props: {
  contract: Contract
  user: User | null | undefined
}) {
  const { contract, user } = props

  const tips = useMarketTipTxns(contract.id)

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
    const timeoutId = setTimeout(() => {
      likeContract(user, contract).catch(() => setIsLiking(false))
    }, 3000)
    toast.custom(
      (t) => (
        <TipToast
          userName={contract.creatorUsername}
          onUndoClick={() => {
            clearTimeout(timeoutId)
          }}
        />
      ),
      { duration: TIP_UNDO_DURATION }
    )
  }

  return (
    <TipButton
      onClick={onLike}
      tipAmount={LIKE_TIP_AMOUNT}
      totalTipped={totalTipped}
      userTipped={
        !!user &&
        (isLiking ||
          userLikedContractIds?.includes(contract.id) ||
          (!likes && !!contract.likedByUserIds?.includes(user.id)))
      }
      disabled={contract.creatorId === user?.id}
    />
  )
}
