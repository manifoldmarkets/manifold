import { debounce } from 'lodash'
import { useEffect, useRef, useState } from 'react'

import { Comment } from 'common/comment'
import { User } from 'common/user'
import { CommentTips } from 'web/hooks/use-tip-txns'
import { useUser } from 'web/hooks/use-user'
import { transact } from 'web/lib/firebase/api'
import { track } from 'web/lib/service/analytics'
import { TipButton } from './contract/tip-button'
import { Row } from './layout/row'

const TIP_SIZE = 10

export function Tipper(prop: { comment: Comment; tips: CommentTips }) {
  const { comment, tips } = prop

  const me = useUser()
  const myId = me?.id ?? ''
  const savedTip = tips[myId] ?? 0

  const [localTip, setLocalTip] = useState(savedTip)

  // listen for user being set
  const initialized = useRef(false)
  useEffect(() => {
    if (tips[myId] && !initialized.current) {
      setLocalTip(tips[myId])
      initialized.current = true
    }
  }, [tips, myId])

  // declare debounced function only on first render
  const [saveTip] = useState(() =>
    debounce(async (user: User, comment: Comment, change: number) => {
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
    }, 1500)
  )
  // instant save on unrender
  useEffect(() => () => void saveTip.flush(), [saveTip])

  const addTip = (delta: number) => {
    setLocalTip(localTip + delta)
    me && saveTip(me, comment, localTip - savedTip + delta)
  }

  if (me && comment.userId === me.id) {
    return <></>
  }

  const canUp = me && me.balance >= localTip + TIP_SIZE

  return (
    <Row className="items-center gap-0.5">
      <TipButton
        tipAmount={TIP_SIZE}
        totalTipped={localTip}
        onClick={() => addTip(+TIP_SIZE)}
        userTipped={localTip > 0}
        disabled={!canUp}
        isCompact
      />
    </Row>
  )
}
