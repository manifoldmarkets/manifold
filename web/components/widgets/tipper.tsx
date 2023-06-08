import { useState } from 'react'
import toast from 'react-hot-toast'

import { Comment } from 'common/comment'
import { User } from 'common/user'
import { useUser } from 'web/hooks/use-user'
import { transact } from 'web/lib/firebase/api'
import { track } from 'web/lib/service/analytics'
import { TipButton } from '../contract/tip-button'
import { Row } from '../layout/row'
import { LIKE_TIP_AMOUNT } from 'common/like'
import { formatMoney } from 'common/util/format'

export function Tipper(prop: {
  comment: Comment
  myTip: number
  totalTip: number
}) {
  const { comment, myTip, totalTip } = prop

  const me = useUser()
  const [tempTip, setTempTip] = useState(0)

  const [saveTip] = useState(
    () => async (user: User, comment: Comment, change: number) => {
      if (change === 0) {
        return
      }

      const contractId =
        comment.commentType === 'contract' ? comment.contractId : undefined
      const postId = comment.commentType === 'post' ? comment.postId : undefined
      await transact({
        amount: change,
        fromId: user.id,
        fromType: 'USER',
        toId: comment.userId,
        toType: 'USER',
        token: 'M$',
        category: 'TIP',
        data: { commentId: comment.id, contractId, postId },
        description: `${user.name} tipped M$ ${change} to ${comment.userName} for a comment`,
      })

      track('send comment tip', {
        commentId: comment.id,
        contractId,
        postId,
        amount: change,
        fromId: user.id,
        toId: comment.userId,
      })
    }
  )

  const addTip = (delta: number) => {
    setTempTip((tempTip) => tempTip + delta)
    me &&
      saveTip(me, comment, delta)
        .then(() => {
          setTempTip((tempTip) => tempTip - delta)
        })
        .catch((e) => console.error(e))
    toast(`Tipped ${comment.userName} ${formatMoney(LIKE_TIP_AMOUNT)}`)
  }

  const canUp =
    me && comment.userId !== me.id && me.balance - tempTip >= LIKE_TIP_AMOUNT

  return (
    <Row className="items-center gap-0.5">
      <TipButton
        tipAmount={LIKE_TIP_AMOUNT}
        totalTipped={totalTip}
        onClick={() => addTip(+LIKE_TIP_AMOUNT)}
        userTipped={tempTip > 0 || myTip > 0}
        disabled={!canUp}
        isCompact
      />
    </Row>
  )
}
