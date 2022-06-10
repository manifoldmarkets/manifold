import {
  ChevronDoubleRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/solid'
import { Comment } from 'common/comment'
import { Contract } from 'common/contract'
import { formatMoney } from 'common/util/format'
import { debounce, flow, sum } from 'lodash'
import { useMemo, useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { Row } from './layout/row'
import Tooltip from './tooltip'

// xth triangle number * 5  =  5 + 10 + 15 + ... + (x * 5)
const quad = (x: number) => (5 / 2) * x * (x + 1)

// inverse (see https://math.stackexchange.com/questions/2041988/how-to-get-inverse-of-formula-for-sum-of-integers-from-1-to-nsee )
const invQuad = (y: number) => Math.sqrt((2 / 5) * y + 1 / 4) - 1 / 2

function Tipper(prop: { contract: Contract; comment: Comment }) {
  const { contract, comment } = prop
  const { tips = {} } = comment

  const me = useUser()
  const myId = me?.id || ''
  const savedTip = tips[myId] || 0

  // optimistically increase the tip count, but debounce the update
  const [localTip, setLocalTip] = useState(savedTip)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const score = useMemo(
    flow(
      () => ({ ...tips, [myId]: localTip }),
      Object.values,
      (x) => x.map(invQuad),
      sum
    ),
    [localTip]
  )

  const saveTip = debounce((tip: number) => {
    if (tip === savedTip) {
      return
    }

    const change = tip - savedTip

    console.log('updated tip:', change, ' to:', tip)
    // TODO: save to firebase
  }, 1000)

  const changeTip = (tip: number) => {
    setLocalTip(tip)
    saveTip(tip)
  }

  return (
    <Row className="items-center">
      <DownTip value={localTip} onChange={changeTip} />
      <span className="mx-1">{score} </span>
      <UpTip value={localTip} onChange={changeTip} />
      {localTip === 0 ? (
        ''
      ) : (
        <span className={localTip > 0 ? 'text-primary' : 'text-red-400'}>
          ({formatMoney(localTip)} tip)
        </span>
      )}
    </Row>
  )
}

function DownTip(prop: { value: number; onChange: (tip: number) => void }) {
  const { onChange, value } = prop
  const marginal = 5 * invQuad(value)
  const disabled = value === 0
  return (
    <Tooltip text={!disabled && `refund ${formatMoney(marginal)}`}>
      <button
        className="flex h-max items-center hover:text-red-600 disabled:text-gray-300"
        disabled={disabled}
        onClick={() => onChange(value - marginal)}
      >
        <ChevronLeftIcon className="h-7 w-7" />
      </button>
    </Tooltip>
  )
}

function UpTip(prop: { value: number; onChange: (tip: number) => void }) {
  const { onChange, value } = prop
  const marginal = 5 * invQuad(value) + 5

  return (
    <Tooltip text={`pay ${formatMoney(marginal)}`}>
      <button
        className="hover:text-primary flex h-max items-center"
        onClick={() => onChange(value + marginal)}
      >
        {value >= quad(2) ? (
          <ChevronDoubleRightIcon className="text-primary h-7 w-7" />
        ) : value > 0 ? (
          <ChevronRightIcon className="text-primary h-7 w-7" />
        ) : (
          <ChevronRightIcon className="h-7 w-7" />
        )}
      </button>
    </Tooltip>
  )
}

export default Tipper
