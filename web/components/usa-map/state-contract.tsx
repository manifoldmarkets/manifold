import { BinaryContract, Contract, contractPath } from 'common/contract'
import { StateContractCard } from '../us-elections/contracts/state-contract-card'
import {
  MapContractsDictionary,
  swingStates,
} from 'web/public/data/elections-data'
import { Row } from '../layout/row'
import { Col } from '../layout/col'
import { probToColor } from './state-election-map'
import clsx from 'clsx'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { ClickFrame } from '../widgets/click-frame'
import { getDisplayProbability } from 'common/calculate'
import { formatPercent } from 'common/util/format'
import { DATA } from './usa-map-data'
import { BinaryBetButton } from '../us-elections/contracts/party-panel/binary-party-panel'
import { SweepsToggle } from '../sweeps/sweeps-toggle'

export function StateContract(props: {
  targetContract: Contract | null
  targetState?: string | null
  setTargetState: (state?: string) => void
  customTitleFunction?: (title: string) => string | undefined
  includeHead?: boolean
}) {
  const {
    targetContract,
    targetState,
    setTargetState,
    customTitleFunction,
    includeHead,
  } = props
  if (!targetContract) {
    return <EmptyStateContract />
  }

  return (
    <Col className="h-[264px]">
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
        className="my-auto"
        includeHead={includeHead}
      />
    </Col>
  )
}

export function EmptyStateContract() {
  return <div className=" h-[264px] w-full" />
}

export function SwingStateContract(props: {
  hoveredState: string | undefined | null
  setHoveredState: (state: string | undefined) => void
  targetState: string | undefined | null
  sortedPresidencyContractsDictionary: MapContractsDictionary
}) {
  const {
    hoveredState,
    setHoveredState,
    targetState,
    sortedPresidencyContractsDictionary,
  } = props

  const sortedSwingContractsDictionary = Object.keys(
    sortedPresidencyContractsDictionary
  )
    .filter((key) => swingStates.includes(key))
    .reduce((acc, key) => {
      const entry = sortedPresidencyContractsDictionary[key]
      if (entry) {
        acc[key] = entry
      }
      return acc
    }, {} as MapContractsDictionary)

  return (
    <Col className=" w-full">
      <Row className="mb-2 w-full justify-end">
        <SweepsToggle sweepsEnabled />
      </Row>
      <Row className="text-ink-500 mb-1 hidden w-full justify-between text-sm sm:flex">
        Swing States
        <Row className="gap-4">
          <Row className="w-28 justify-start">Democratic</Row>
          <Row className="w-20 justify-start">Republican</Row>
        </Row>
      </Row>
      {Object.entries(sortedSwingContractsDictionary).map(
        ([key, contract], index) => {
          return (
            <SwingStateRow
              key={key}
              state={key}
              contract={contract as BinaryContract}
              index={index}
              targetState={targetState}
              hoveredState={hoveredState}
              setHoveredState={setHoveredState}
            />
          )
        }
      )}
    </Col>
  )
  return <></>
}

function SwingStateRow(props: {
  state: string
  contract: BinaryContract | null
  index: number
  hoveredState: string | undefined | null
  setHoveredState: (state: string | undefined) => void
  targetState: string | undefined | null
}) {
  const { state, contract, index, hoveredState, setHoveredState, targetState } =
    props
  const router = useRouter()
  if (!contract) {
    return <></>
  }

  const stateName = DATA[state].name
  const pseudonymTitle = `Which party will win the presidency in ${stateName}`
  const contractUrl = contractPath(contract)
  return (
    <ClickFrame
      className={clsx(
        'border-ink-300 group flex h-[74px] flex-row justify-between border-b transition-colors sm:h-10',
        index == 0 && 'border-t',
        targetState == state
          ? 'bg-canvas-50'
          : hoveredState == state
          ? 'bg-canvas-50/70'
          : 'bg-canvas-0'
      )}
      onMouseEnter={() => {
        setHoveredState(state)
      }}
      onMouseLeave={() => {
        setHoveredState(undefined)
      }}
      onClick={() => {
        router.push(contractUrl)
      }}
    >
      <Row className="select-none items-center gap-2 transition-all ">
        <div
          className=" h-full w-6 transition-colors"
          style={{
            background: probToColor(contract),
          }}
        />
        <Link
          href={contractUrl}
          className="hover:text-primary-700 hover:underline"
        >
          {stateName}
        </Link>
      </Row>

      <div className="my-auto flex flex-col items-center gap-1 sm:flex-row sm:gap-4">
        <SwingStatePercent
          contract={contract}
          label="DEM"
          className="justify-end sm:justify-start"
          questionPseudonym={pseudonymTitle}
        />
        <SwingStatePercent
          contract={contract}
          label="REP"
          className="justify-end"
          questionPseudonym={pseudonymTitle}
        />
      </div>
    </ClickFrame>
  )
}

function SwingStatePercent(props: {
  contract: BinaryContract
  label: string
  className?: string
  questionPseudonym?: string
}) {
  const { contract, label, className, questionPseudonym } = props
  const prob = getDisplayProbability(contract)
  const isDemocraticParty = label == 'DEM'
  return (
    <Row className={clsx('w-32 items-center gap-2 sm:w-24', className)}>
      <div className="text-ink-600 font-light sm:hidden">{label}</div>
      <div className="w-8 font-semibold">
        {formatPercent(isDemocraticParty ? 1 - prob : prob)}
      </div>
      <BinaryBetButton
        contract={contract}
        initialOutcome={isDemocraticParty ? 'NO' : 'YES'}
        questionPseudonym={questionPseudonym}
        binaryPseudonym={{
          YES: { pseudonymName: 'Republican', pseudonymColor: 'sienna' },
          NO: { pseudonymName: 'Democratic', pseudonymColor: 'azure' },
        }}
      />
    </Row>
  )
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

export function SwingStates() {
  return <div className=" h-[183px] w-full" />
}
