import {
  ChevronDoubleRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/solid'
import clsx from 'clsx'
import { Comment } from 'common/comment'
import { User } from 'common/user'
import { formatMoney } from 'common/util/format'
import { debounce, sum } from 'lodash'
import { useEffect, useRef, useState } from 'react'
import { CommentTips } from 'web/hooks/use-tip-txns'
import { useUser } from 'web/hooks/use-user'
import { transact } from 'web/lib/firebase/api'
import { track } from 'web/lib/service/analytics'
import { Row } from './layout/row'
import { Tooltip } from './tooltip'

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

  const total = sum(Object.values(tips)) - savedTip + localTip

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

  const canDown = me && localTip > savedTip
  const canUp = me && me.id !== comment.userId && me.balance >= localTip + 5
  return (
    <Row className="items-center gap-0.5">
      <DownTip onClick={canDown ? () => addTip(-TIP_SIZE) : undefined} />
      <span className="font-bold">{Math.floor(total)}</span>
      <UpTip
        onClick={canUp ? () => addTip(+TIP_SIZE) : undefined}
        value={localTip}
      />
      {localTip === 0 ? (
        ''
      ) : (
        <span
          className={clsx(
            'ml-1 font-semibold',
            localTip > 0 ? 'text-primary' : 'text-red-400'
          )}
        >
          ({formatMoney(localTip)} tip)
        </span>
      )}
    </Row>
  )
}

function DownTip(props: { onClick?: () => void }) {
  const { onClick } = props
  return (
    <Tooltip
      className="h-6 w-6"
      placement="bottom"
      text={onClick && `-${formatMoney(TIP_SIZE)}`}
      noTap
    >
      <button
        className="hover:text-red-600 disabled:text-gray-300"
        disabled={!onClick}
        onClick={onClick}
      >
        <ChevronLeftIcon className="h-6 w-6" />
      </button>
    </Tooltip>
  )
}

function UpTip(props: { onClick?: () => void; value: number }) {
  const { onClick, value } = props
  const IconKind = value > TIP_SIZE ? ChevronDoubleRightIcon : ChevronRightIcon
  return (
    <Tooltip
      className="h-6 w-6"
      placement="bottom"
      text={onClick && `Tip ${formatMoney(TIP_SIZE)}`}
      noTap
    >
      <button
        className="hover:text-primary disabled:text-gray-300"
        disabled={!onClick}
        onClick={onClick}
      >
        <IconKind className={clsx('h-6 w-6', value ? 'text-primary' : '')} />
      </button>
    </Tooltip>
  )
}
