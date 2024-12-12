import { animated } from '@react-spring/web'
import clsx from 'clsx'
import {
  formatMoneyNoMoniker,
  formatSweepiesNumber,
  getMoneyNumberToDecimal,
} from 'common/util/format'
import { useAnimatedNumber } from 'web/hooks/use-animated-number'
import { shortenNumber } from 'web/lib/util/formatNumber'
import { Row } from '../layout/row'
import { ManaCoin } from './manaCoin'

export type NumberDisplayType = 'short' | 'animated' | 'toDecimal'

export function CoinNumber(props: {
  amount?: number
  numberType?: NumberDisplayType
  className?: string
  isInline?: boolean
  coinClassName?: string
  hideAmount?: boolean
  style?: React.CSSProperties
}) {
  const {
    hideAmount,
    amount,
    numberType,
    className,
    isInline,
    coinClassName,
    style,
  } = props

  return (
    <Row
      className={clsx(
        'coin-offset items-center whitespace-nowrap font-mono  text-indigo-700',
        isInline && 'relative ml-[1.1em] inline-flex',
        className
      )}
      style={style}
    >
      {amount !== undefined && amount <= -1 && '-'}

      <ManaCoin
        className={clsx(
          isInline &&
            'absolute -left-[var(--coin-offset)] top-[var(--coin-top-offset)] min-h-[1em] min-w-[1em]',
          coinClassName
        )}
      />

      {hideAmount ? (
        ''
      ) : amount == undefined ? (
        '---'
      ) : numberType == 'short' ? (
        shortenNumber(
          +formatMoneyNoMoniker(Math.abs(amount ?? 0)).replaceAll(',', '')
        )
      ) : numberType == 'animated' ? (
        <AnimatedNumber amount={Math.abs(amount ?? 0)} />
      ) : numberType == 'toDecimal' ? (
        getMoneyNumberToDecimal(Math.abs(amount ?? 0))
      ) : (
        formatMoneyNoMoniker(Math.abs(amount))
      )}
    </Row>
  )
}

function AnimatedNumber(props: { amount?: number }) {
  const { amount } = props
  const balance = useAnimatedNumber(amount ?? 0)
  return (
    <animated.div>{balance.to((b) => formatMoneyNoMoniker(b))}</animated.div>
  )
}
