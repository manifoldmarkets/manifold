import { useState } from 'react'
import toast from 'react-hot-toast'

import { Comment } from 'common/comment'
import { User } from 'common/user'
import { useUser } from 'web/hooks/use-user'
import { transact } from 'web/lib/firebase/api'
import { track } from 'web/lib/service/analytics'
import { TipButton } from '../contract/tip-button'
import { Row } from '../layout/row'
import { LIKE_TIP_AMOUNT, TIP_UNDO_DURATION } from 'common/like'
import { formatMoney } from 'common/util/format'
import { Button } from '../buttons/button'
import clsx from 'clsx'

export function Tipper(prop: {
  comment: Comment
  myTip: number
  totalTip: number
}) {
  const { comment, myTip, totalTip } = prop

  // This is a temporary tipping amount before it actually gets confirmed. This is so tha we dont accidentally tip more than you have
  const [tempTip, setTempTip] = useState(0)

  const me = useUser()

  const [saveTip] = useState(
    () => async (user: User, comment: Comment, change: number) => {
      if (change === 0) {
        return
      }

      const contractId =
        comment.commentType === 'contract' ? comment.contractId : undefined
      const groupId =
        comment.commentType === 'group' ? comment.groupId : undefined
      const postId = comment.commentType === 'post' ? comment.postId : undefined
      await transact({
        amount: change,
        fromId: user.id,
        fromType: 'USER',
        toId: comment.userId,
        toType: 'USER',
        token: 'M$',
        category: 'TIP',
        data: { commentId: comment.id, contractId, groupId, postId },
        description: `${user.name} tipped M$ ${change} to ${comment.userName} for a comment`,
      })

      track('send comment tip', {
        commentId: comment.id,
        contractId,
        groupId,
        postId,
        amount: change,
        fromId: user.id,
        toId: comment.userId,
      })
    }
  )

  const addTip = (delta: number) => {
    setTempTip((tempTip) => tempTip + delta)
    const timeoutId = setTimeout(() => {
      me &&
        saveTip(me, comment, delta)
          .then(() => setTempTip((tempTip) => tempTip - delta))
          .catch((e) => console.error(e))
    }, TIP_UNDO_DURATION + 1000)
    toast.custom(
      () => (
        <TipToast
          userName={comment.userName}
          onUndoClick={() => {
            clearTimeout(timeoutId)
            setTempTip((tempTip) => tempTip - delta)
          }}
        />
      ),
      { duration: TIP_UNDO_DURATION }
    )
  }

  const canUp =
    me && comment.userId !== me.id && me.balance - tempTip >= LIKE_TIP_AMOUNT

  return (
    <Row className="items-center gap-0.5">
      <TipButton
        tipAmount={LIKE_TIP_AMOUNT}
        totalTipped={totalTip + tempTip}
        onClick={() => addTip(+LIKE_TIP_AMOUNT)}
        userTipped={tempTip > 0 || myTip > 0}
        disabled={!canUp}
        isCompact
      />
    </Row>
  )
}

export function TipToast(props: { userName: string; onUndoClick: () => void }) {
  const { userName, onUndoClick } = props
  const [cancelled, setCancelled] = useState(false)

  // There is a strange bug with toast where sometimes if you interact with one popup, the others will not dissappear at the right time, overriding it for now with this
  const [timedOut, setTimedOut] = useState(false)
  setTimeout(() => {
    setTimedOut(true)
  }, TIP_UNDO_DURATION)
  if (timedOut) {
    return <></>
  }
  return (
    <Row className="text-greyscale-6 items-center gap-4 rounded-lg bg-white px-4 py-2 text-sm drop-shadow-md">
      <div className={clsx(cancelled ? 'hidden' : 'inline')}>
        Tipping {userName} {formatMoney(LIKE_TIP_AMOUNT)}...
      </div>
      <div className={clsx('py-1', cancelled ? 'inline' : 'hidden')}>
        Cancelled tipping
      </div>
      <Button
        className={clsx(cancelled ? 'hidden' : 'inline')}
        size="xs"
        color="gray-outline"
        onClick={() => {
          onUndoClick()
          setCancelled(true)
        }}
        disabled={cancelled}
      >
        Cancel
      </Button>
    </Row>
  )
}
