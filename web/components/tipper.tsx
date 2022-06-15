/* eslint-disable react-hooks/exhaustive-deps */
import {
  ChevronDoubleRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/solid'
import clsx from 'clsx'
import { Comment } from 'common/comment'
import { User } from 'common/user'
import { formatMoney } from 'common/util/format'
import { debounce, sumBy } from 'lodash'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CommentTips } from 'web/hooks/use-comment-tips'
import { useUser } from 'web/hooks/use-user'
import { transact } from 'web/lib/firebase/fn-call'
import { Row } from './layout/row'
import Tooltip from './tooltip'

// xth triangle number * 5  =  5 + 10 + 15 + ... + (x * 5)
const quad = (x: number) => (5 / 2) * x * (x + 1)

// inverse (see https://math.stackexchange.com/questions/2041988/how-to-get-inverse-of-formula-for-sum-of-integers-from-1-to-nsee )
const invQuad = (y: number) => Math.sqrt((2 / 5) * y + 1 / 4) - 1 / 2

function Tipper(prop: { comment: Comment; tips: CommentTips }) {
  const { comment, tips } = prop

  const me = useUser()
  const myId = me?.id ?? ''
  const savedTip = tips[myId] as number | undefined

  // optimistically increase the tip count, but debounce the update
  const [localTip, setLocalTip] = useState(savedTip ?? 0)
  const initialized = useRef(false)
  useEffect(() => {
    if (savedTip && !initialized.current) {
      setLocalTip(savedTip)
      initialized.current = true
    }
  }, [savedTip])

  const score = useMemo(() => {
    const tipVals = Object.values({ ...tips, [myId]: localTip })
    return sumBy(tipVals, invQuad)
  }, [localTip, tips, myId])

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
    }, 1500)
  )
  // instant save on unrender
  useEffect(() => () => void saveTip.flush(), [])

  const changeTip = (tip: number) => {
    setLocalTip(tip)
    me && saveTip(me, tip - (savedTip ?? 0))
  }

  return (
    <Row className="items-center gap-0.5">
      <DownTip
        value={localTip}
        onChange={changeTip}
        disabled={!me || localTip <= 0}
      />
      <span className="font-bold">{Math.floor(score)} </span>
      <UpTip
        value={localTip}
        onChange={changeTip}
        disabled={!me || me.id === comment.userId}
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
  const marginal = 5 * invQuad(value)
  return (
    <Tooltip
      className="tooltip-bottom"
      text={!disabled && `refund ${formatMoney(marginal)}`}
    >
      <button
        className="flex h-max items-center hover:text-red-600 disabled:text-gray-300"
        disabled={disabled}
        onClick={() => onChange(value - marginal)}
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
  const marginal = 5 * invQuad(value) + 5

  return (
    <Tooltip
      className="tooltip-bottom"
      text={!disabled && `pay ${formatMoney(marginal)}`}
    >
      <button
        className="hover:text-primary flex h-max items-center disabled:text-gray-300"
        disabled={disabled}
        onClick={() => onChange(value + marginal)}
      >
        {value >= quad(2) ? (
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

export default Tipper
