import { Contract } from 'common/contract'
import { StateContractCard } from '../contracts/state-contract-card'

export function StateContract(props: {
  targetContract: Contract | null
  targetState?: string | null
  setTargetState: (state?: string) => void
}) {
  const { targetContract, targetState, setTargetState } = props
  if (!targetContract) {
    return <EmptyStateContract />
  }

  return (
    <StateContractCard
      contract={targetContract}
      customTitle={extractStateFromPresidentContract(targetContract.question)}
      titleSize="lg"
      targetState={targetState}
      setTargetState={setTargetState}
    />
  )
}

export function EmptyStateContract() {
  return <div className=" h-[183px] w-full" />
}

export function extractStateFromPresidentContract(
  sentence: string
): string | undefined {
  const regex = /US Presidency in ([\w\s,.()]+)\?/
  const match = sentence.match(regex)

  return match ? match[1].trim() : undefined
}
