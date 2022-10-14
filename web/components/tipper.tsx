import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { debounce } from 'lodash'

import { Comment } from 'common/comment'
import { User } from 'common/user'
import { useUser } from 'web/hooks/use-user'
import { transact } from 'web/lib/firebase/api'
import { track } from 'web/lib/service/analytics'
import { TipButton } from './contract/tip-button'
import { Row } from './layout/row'
import { LIKE_TIP_AMOUNT, TIP_UNDO_DURATION } from 'common/like'
import { formatMoney } from 'common/util/format'
import { Button } from './button'
import clsx from 'clsx'

export function Tipper(prop: {
  comment: Comment
  myTip: number
  totalTip: number
}) {
  const { comment, myTip, totalTip } = prop

  const me = useUser()

  const [localTip, setLocalTip] = useState(myTip)

  // listen for user being set
  const initialized = useRef(false)
  useEffect(() => {
    if (myTip && !initialized.current) {
      setLocalTip(myTip)
      initialized.current = true
    }
  }, [myTip])

  const total = totalTip - myTip + localTip

  // declare debounced function only on first render
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
    const timeoutId = setTimeout(() => {
      setLocalTip(localTip + delta)
      me && saveTip(me, comment, localTip - myTip + delta)
    }, 3000)
    toast.custom(
      (t) => (
        <TipToast
          userName={comment.userName}
          onUndoClick={() => {
            clearTimeout(timeoutId)
          }}
        />
      ),
      { duration: TIP_UNDO_DURATION }
    )
  }

  const canUp =
    me && comment.userId !== me.id && me.balance >= localTip + LIKE_TIP_AMOUNT

  return (
    <Row className="items-center gap-0.5">
      <TipButton
        tipAmount={LIKE_TIP_AMOUNT}
        totalTipped={total}
        onClick={() => addTip(+LIKE_TIP_AMOUNT)}
        userTipped={localTip > 0}
        disabled={!canUp}
        isCompact
      />
    </Row>
  )
}

export function TipToast(props: { userName: string; onUndoClick: () => void }) {
  const { userName, onUndoClick } = props
  const [cancelled, setCancelled] = useState(false)
  return (
    <div className="relative overflow-hidden rounded-lg bg-white drop-shadow-md">
      <div
        className={clsx(
          'animate-progress-loading absolute bottom-0 z-10 h-1 w-full bg-indigo-600',
          cancelled ? 'hidden' : ''
        )}
      />
      <Row className="text-greyscale-6 items-center gap-4 px-4 py-2 text-sm">
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
    </div>
  )
}
