import { Contract } from 'common/contract'
import { Bet } from 'common/bet'
import { BinaryContractChart } from './binary'
import { PseudoNumericContractChart } from './pseudo-numeric'
import { ChoiceContractChart } from './choice'
import { NumericContractChart } from './numeric'

export const ContractChart = (props: {
  contract: Contract
  bets: Bet[]
  width: number
  height: number
}) => {
  const { contract } = props
  switch (contract.outcomeType) {
    case 'BINARY':
      return <BinaryContractChart {...{ ...props, contract }} />
    case 'PSEUDO_NUMERIC':
      return <PseudoNumericContractChart {...{ ...props, contract }} />
    case 'FREE_RESPONSE':
    case 'MULTIPLE_CHOICE':
      return <ChoiceContractChart {...{ ...props, contract }} />
    case 'NUMERIC':
      return <NumericContractChart {...{ ...props, contract }} />
    default:
      return null
  }
}

export {
  BinaryContractChart,
  PseudoNumericContractChart,
  ChoiceContractChart,
  NumericContractChart,
}
