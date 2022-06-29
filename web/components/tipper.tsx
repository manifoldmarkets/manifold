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
import { transact } from 'web/lib/firebase/fn-call'
import { track } from 'web/lib/service/analytics'
import { Row } from './layout/row'
import { Tooltip } from './tooltip'

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
    debounce(async (user: User, change: number) => {
      if (change === 0) {
        return
      }

      await transact({
        amount: change,
        fromId: user.id,
        fromType: 'USER',
        toId: comment.userId,
        toType: 'USER',
        token: 'M$',
        category: 'TIP',
        data: {
          contractId: comment.contractId,
          commentId: comment.id,
        },
        description: `${user.name} tipped M$ ${change} to ${comment.userName} for a comment`,
      })

      track('send comment tip', {
        contractId: comment.contractId,
        commentId: comment.id,
        amount: change,
        fromId: user.id,
        toId: comment.userId,
      })
    }, 1500)
  )
  // instant save on unrender
  useEffect(() => () => void saveTip.flush(), [saveTip])

  const changeTip = (tip: number) => {
    setLocalTip(tip)
    me && saveTip(me, tip - savedTip)
  }

  return (
    <Row className="items-center gap-0.5">
      <DownTip
        value={localTip}
        onChange={changeTip}
        disabled={!me || localTip <= savedTip}
      />
      <span className="font-bold">{Math.floor(total)}</span>
      <UpTip
        value={localTip}
        onChange={changeTip}
        disabled={!me || me.id === comment.userId || me.balance < localTip + 5}
      />
      {localTip === 0 ? (
        ''
      ) : (
        <span
          className={clsx(
            'font-semibold',
            localTip > 0 ? 'text-primary' : 'text-red-400'
          )}
        >
          ({formatMoney(localTip)} tip)
        </span>
      )}
    </Row>
  )
}

function DownTip(prop: {
  value: number
  onChange: (tip: number) => void
  disabled?: boolean
}) {
  const { onChange, value, disabled } = prop
  return (
    <Tooltip
      className="tooltip-bottom"
      text={!disabled && `-${formatMoney(5)}`}
    >
      <button
        className="flex h-max items-center hover:text-red-600 disabled:text-gray-300"
        disabled={disabled}
        onClick={() => onChange(value - 5)}
      >
        <ChevronLeftIcon className="h-6 w-6" />
      </button>
    </Tooltip>
  )
}

function UpTip(prop: {
  value: number
  onChange: (tip: number) => void
  disabled?: boolean
}) {
  const { onChange, value, disabled } = prop

  return (
    <Tooltip
      className="tooltip-bottom"
      text={!disabled && `Tip ${formatMoney(5)}`}
    >
      <button
        className="hover:text-primary flex h-max items-center disabled:text-gray-300"
        disabled={disabled}
        onClick={() => onChange(value + 5)}
      >
        {value >= 10 ? (
          <ChevronDoubleRightIcon className="text-primary mx-1 h-6 w-6" />
        ) : value > 0 ? (
          <ChevronRightIcon className="text-primary h-6 w-6" />
        ) : (
          <ChevronRightIcon className="h-6 w-6" />
        )}
      </button>
    </Tooltip>
  )
}
