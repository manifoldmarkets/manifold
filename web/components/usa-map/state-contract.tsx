import { Contract } from 'common/contract'
import { StateContractCard } from '../us-elections/contracts/state-contract-card'

export function StateContract(props: {
  targetContract: Contract | null
  targetState?: string | null
  setTargetState: (state?: string) => void
  customTitleFunction?: (title: string) => string | undefined
}) {
  const { targetContract, targetState, setTargetState, customTitleFunction } =
    props
  if (!targetContract) {
    return <EmptyStateContract />
  }

  return (
    <StateContractCard
      contract={targetContract}
      customTitle={
        customTitleFunction
          ? customTitleFunction(targetContract.question) ??
            targetContract.question
          : targetContract.question
      }
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

export function extractBeforeGovernorsRace(
  sentence: string
): string | undefined {
  const regex = /^(.*?)\s*Governor's Race: Which party will win in 2024\?/
  const match = sentence.match(regex)

  if (match && match[1]) {
    return match[1]
  } else {
    return undefined
  }
}
