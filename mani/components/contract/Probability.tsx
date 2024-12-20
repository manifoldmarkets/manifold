import { getAnswerProbability, getDisplayProbability } from 'common/calculate'
import { BinaryContract, MultiContract } from 'common/contract'
import { getPercent } from 'common/util/format'
import { NumberText } from 'components/number-text'
import { ThemedTextProps } from 'components/themed-text'

export function AnswerProbability({
  contract,
  answerId,
  style,
  ...rest
}: {
  contract: MultiContract
  answerId: string
} & ThemedTextProps) {
  const prob = getAnswerProbability(contract, answerId)
  return <Probability probability={prob} style={style} {...rest} />
}

export function BinaryProbability({
  contract,
  style,
  ...rest
}: {
  contract: BinaryContract
} & ThemedTextProps) {
  const prob = getDisplayProbability(contract)
  return <Probability probability={prob} style={style} {...rest} />
}

function Probability({
  probability,
  style,
  ...rest
}: {
  probability: number
} & ThemedTextProps) {
  return (
    <NumberText style={style} {...rest}>
      {getPercent(probability).toFixed(0)}%
    </NumberText>
  )
}
