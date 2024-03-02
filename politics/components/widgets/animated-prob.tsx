import { Answer, DpmAnswer } from 'common/answer'
import { getAnswerProbability } from 'common/calculate'
import { MultiContract } from 'common/contract'
import { formatPercentNumber } from 'common/util/format'
import { Row } from 'web/components/layout/row'
import { useAnimatedNumber } from 'web/hooks/use-animated-number'
import { animated } from '@react-spring/web'
import clsx from 'clsx'

export const AnimatedProb = (props: {
  contract: MultiContract
  answer: Answer | DpmAnswer
  size?: 'md' | 'lg'
  align?: 'left' | 'right'
}) => {
  const { contract, answer, size = 'lg', align = 'left' } = props
  const spring = useAnimatedNumber(getAnswerProbability(contract, answer.id))

  return (
    <Row
      className={clsx(
        ' whitespace-nowrap font-mono font-bold',
        size == 'lg'
          ? 'min-w-[3rem] text-lg sm:text-2xl'
          : 'min-w-[2.5rem] text-lg sm:text-xl',
        align == 'right' ? 'justify-end' : ''
      )}
    >
      <span>
        <animated.div>
          {spring.to((val) => formatPercentNumber(val))}
        </animated.div>
      </span>
      <span className="font-thin">%</span>
    </Row>
  )
}
