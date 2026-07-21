import clsx from 'clsx'
import { Contract } from 'common/contract'
import {
  ChooseStateButton,
  StateContractCard,
} from 'web/components/us-elections/contracts/state-contract-card'
import { EmptyStateContract } from './state-contract'
import { probToColor } from './state-election-map'
import { DATA } from './usa-map-data'
import { USAState } from './usa-state'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { Col } from 'web/components/layout/col'
import { StateProps } from './presidential-state'
import {
  currentSenate2026,
  senate2026,
  senateHeldSeats2026,
} from 'web/public/data/senate-state-data'

export function SenateState(props: StateProps) {
  const {
    stateKey,
    data,
    stateContract,
    handleClick,
    onMouseEnter,
    onMouseLeave,
    targetState,
    hoveredState,
  } = props
  if (!!stateContract) {
    return (
      <USAState
        key={stateKey}
        stateData={data}
        state={stateKey}
        fill={probToColor(
          stateContract,
          senate2026.filter((s) => s.state === stateKey)[0]
        )}
        onClickState={() => {
          handleClick(stateKey)
        }}
        onMouseEnterState={() => {
          onMouseEnter(stateKey)
        }}
        onMouseLeaveState={() => {
          onMouseLeave()
        }}
        selected={!!targetState && targetState == stateKey}
        hovered={!!hoveredState && hoveredState == stateKey}
      />
    )
  }
  return (
    <USAState
      key={stateKey}
      stateData={data}
      state={stateKey}
      fill={getSenateFill(stateKey)}
      patternTextColor="#ffff"
      onClickState={() => {
        handleClick(stateKey)
      }}
      onMouseEnterState={() => {
        onMouseEnter(stateKey)
      }}
      onMouseLeaveState={() => {
        onMouseLeave()
      }}
      selected={!!targetState && targetState == stateKey}
      hovered={!!hoveredState && hoveredState == stateKey}
    />
  )
}

function getSenateFill(stateKey: string) {
  // Find the state in the currentSenate2026 (not-up-this-cycle) array
  const statesSenate = currentSenate2026.find(
    (state) => state.state === stateKey
  )

  if (!statesSenate) return undefined // State not found

  // Determine fill based on party affiliation
  if (
    statesSenate.party1 === 'Democrat' &&
    statesSenate.party2 === 'Democrat'
  ) {
    return 'url(#crossHatchBlue)' // Assuming 'crossHatchBlue' is for Democrats
  } else if (
    statesSenate.party1 === 'Republican' &&
    statesSenate.party2 === 'Republican'
  ) {
    return 'url(#crossHatchRed)' // Assuming 'crossHatchRed' is for Republicans
  } else {
    return 'url(#crossHatchPurple)' // One of each party
  }
}

export function SenateCurrentOrContract(props: {
  targetContract: Contract | null
  targetState?: string | null
  hoveredState?: string | null
  setTargetState: (state?: string) => void
}) {
  const { targetContract, targetState, setTargetState, hoveredState } = props
  if (!targetContract) {
    return (
      <SenateCurrentCard
        state={hoveredState ?? targetState}
        setTargetState={setTargetState}
      />
    )
  }

  const state = hoveredState ?? targetState
  const held = state ? senateHeldSeats2026[state] : undefined

  return (
    <Col className="gap-1">
      <StateContractCard
        contract={targetContract}
        customTitle={
          extractStateFromSenateContract(targetContract.question) ??
          targetContract.question
        }
        titleSize="lg"
        targetState={targetState}
        setTargetState={setTargetState}
      />
      {held && (
        <Row className="text-ink-500 items-center gap-1 px-1 text-xs">
          State's other seat:
          <span
            className={clsx(
              'font-semibold',
              held.party === 'Republican'
                ? 'text-sienna-700'
                : held.party === 'Democrat'
                ? 'text-azure-700'
                : 'text-ink-700'
            )}
          >
            {held.name} ({held.party[0]})
          </span>
          — not on the 2026 ballot
        </Row>
      )}
    </Col>
  )
}

export function SenateCurrentCard(props: {
  state?: string | null
  setTargetState: (state?: string) => void
}) {
  const { state, setTargetState } = props
  if (!state) {
    return <EmptyStateContract />
  }
  const stateName = DATA[state].name
  const currentSenators = currentSenate2026.find((s) => s.state === state)
  const { name1, party1, name2, party2 } = currentSenators ?? {
    name1: '',
    party1: '',
    name2: '',
    party2: '',
  }

  return (
    <Col className=" h-[183px] w-full">
      <Row className="w-full justify-between">
        <div className=" font-semibold sm:text-lg">{stateName}</div>
        <ChooseStateButton setTargetState={setTargetState} />
      </Row>
      <div className="text-ink-700 text-sm">No senate election in 2026</div>
      <Spacer h={4} />
      <Col>
        <div className="text-ink-500 text-sm">Current Senators</div>
        <span
          className={
            party1 == 'Republican' ? 'text-sienna-700' : 'text-azure-700'
          }
        >
          <span className="font-semibold">{name1}</span>, <span>{party1}</span>
        </span>
        <span
          className={
            party2 == 'Republican' ? 'text-sienna-700' : 'text-azure-700'
          }
        >
          <span className="font-semibold">{name2}</span>, <span>{party2}</span>
        </span>
      </Col>
    </Col>
  )
}

export function extractStateFromSenateContract(
  sentence: string
): string | undefined {
  // Community markets phrase Senate questions inconsistently ("... Senate
  // Election in Ohio?", "... 2026 Texas Senate race?"). Rather than match a
  // fixed template, find whichever US state name the question mentions and
  // present a clean "<State> Senate" title. Longest name first so "West
  // Virginia" wins over "Virginia".
  const match = Object.values(DATA)
    .sort((a, b) => b.name.length - a.name.length)
    .find((s) => new RegExp(`\\b${s.name}\\b`, 'i').test(sentence))
  return match ? `${match.name} Senate` : undefined
}
