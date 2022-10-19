import React, { useMemo, useState } from 'react'
import { User } from 'common/user'
import { useUserLikes } from 'web/hooks/use-likes'
import toast from 'react-hot-toast'
import { likeItem } from 'web/lib/firebase/likes'
import { LIKE_TIP_AMOUNT, TIP_UNDO_DURATION } from 'common/like'
import { firebaseLogin } from 'web/lib/firebase/users'
import { useItemTipTxns } from 'web/hooks/use-tip-txns'
import { sum } from 'lodash'
import { TipButton } from './tip-button'
import { Contract } from 'common/contract'
import { Post } from 'common/post'
import { TipToast } from '../widgets/tipper'

export function LikeItemButton(props: {
  item: Contract | Post
  user: User | null | undefined
  itemType: string
}) {
  const { item, user, itemType } = props

  const tips = useItemTipTxns(item.id)
  const [tempTip, setTempTip] = useState(0)

  const totalTipped = useMemo(() => {
    return sum(tips.map((tip) => tip.amount))
  }, [tips])

  const likes = useUserLikes(user?.id)

  const [isLiking, setIsLiking] = useState(false)

  const userLikedItemIds = likes
    ?.filter((l) => l.type === 'contract' || l.type === 'post')
    .map((l) => l.id)

  const onLike = async () => {
    if (!user) return firebaseLogin()

    setIsLiking(true)
    setTempTip((tempTip) => tempTip + LIKE_TIP_AMOUNT)

    const timeoutId = setTimeout(() => {
      likeItem(user, item, itemType)
        .then(() => setTempTip((tempTip) => tempTip - LIKE_TIP_AMOUNT))
        .catch(() => setIsLiking(false))
    }, 3000)
    toast.custom(
      () => (
        <TipToast
          userName={item.creatorUsername}
          onUndoClick={() => {
            clearTimeout(timeoutId)
            setTempTip((tempTip) => tempTip - LIKE_TIP_AMOUNT)
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
      totalTipped={totalTipped + tempTip}
      userTipped={
        !!user &&
        (isLiking ||
          userLikedItemIds?.includes(item.id) ||
          (!likes && !!item.likedByUserIds?.includes(user.id)))
      }
      disabled={item.creatorId === user?.id}
    />
  )
}
