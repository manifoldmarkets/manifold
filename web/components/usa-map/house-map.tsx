import { sortBy } from 'lodash'
import clsx from 'clsx'
import { useState } from 'react'
import { Answer } from 'common/answer'
import { Contract, CPMMMultiContract } from 'common/contract'
import { formatPercent } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import {
  Modal,
  MODAL_CLASS,
  SCROLLABLE_MODAL_CLASS,
} from 'web/components/layout/modal'
import { AnswerCpmmBetPanel } from 'web/components/answers/answer-bet-panel'
import { useLiveContract } from 'web/hooks/use-contract'
import { track } from 'web/lib/service/analytics'
import { MapContractsDictionary } from 'web/public/data/elections-data'
import { ChooseStateButton } from 'web/components/us-elections/contracts/state-contract-card'
import { EmptyStateContract } from './state-contract'
import { StateProps } from './presidential-state'
import { USAMap } from './usa-map'
import { USAState } from './usa-state'
import { DATA } from './usa-map-data'
import { DEM_COLOR, partyProbsToColor, REP_COLOR } from './state-election-map'

// Longest state name first so "West Virginia" matches before "Virginia".
const STATES_BY_NAME_LENGTH = sortBy(
  Object.entries(DATA),
  ([, d]) => -d.name.length
)

// "California 49" -> { stateCode: 'CA', district: '49' }; "Alaska at-large" too.
export function parseDistrict(text: string) {
  const lower = text.toLowerCase()
  for (const [code, d] of STATES_BY_NAME_LENGTH) {
    if (lower.startsWith(d.name.toLowerCase())) {
      return { stateCode: code, district: text.slice(d.name.length).trim() }
    }
  }
  return undefined
}

function districtsForState(contract: Contract, stateKey: string): Answer[] {
  if (contract.mechanism !== 'cpmm-multi-1') return []
  return contract.answers.filter(
    (a) => parseDistrict(a.text)?.stateCode === stateKey
  )
}

// One district market drives the whole map: each state is colored by the mean
// Democratic probability of its competitive districts; states with none are gray.
export function HouseState(props: StateProps) {
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

  const districts = stateContract
    ? districtsForState(stateContract, stateKey)
    : []

  let fill: string | undefined = '#76769366' // gray: no competitive districts
  if (districts.length) {
    const dem = districts.reduce((s, a) => s + a.prob, 0) / districts.length
    fill = partyProbsToColor(dem, 1 - dem)
  }

  return (
    <USAState
      key={stateKey}
      stateData={data}
      state={stateKey}
      fill={fill}
      onClickState={() => handleClick(stateKey)}
      onMouseEnterState={() => onMouseEnter(stateKey)}
      onMouseLeaveState={() => onMouseLeave()}
      selected={!!targetState && targetState === stateKey}
      hovered={!!hoveredState && hoveredState === stateKey}
    />
  )
}

// Drill-down: all of a state's competitive House districts, closest race first.
function HouseStateDistricts(props: {
  contract: Contract
  state: string
  setTargetState: (state?: string) => void
}) {
  const { contract, state, setTargetState } = props
  const stateName = DATA[state]?.name ?? state
  const districts = sortBy(districtsForState(contract, state), (a) =>
    Math.abs(a.prob - 0.5)
  )

  if (!districts.length) {
    return (
      <Col className="h-[264px]">
        <Row className="w-full justify-between">
          <div className="font-semibold sm:text-lg">{stateName}</div>
          <ChooseStateButton setTargetState={setTargetState} />
        </Row>
        <div className="text-ink-500 mt-8 text-center text-sm">
          No competitive House districts here
        </div>
      </Col>
    )
  }

  return (
    <Col className="h-[264px] gap-1">
      <Row className="w-full justify-between">
        <div className="font-semibold sm:text-lg">
          {stateName}{' '}
          <span className="text-ink-500 text-sm font-normal">
            · {districts.length} competitive district
            {districts.length > 1 ? 's' : ''}
          </span>
        </div>
        <ChooseStateButton setTargetState={setTargetState} />
      </Row>
      <Col className="gap-0.5 overflow-y-auto pr-1">
        {districts.map((a) => (
          <HouseDistrictRow
            key={a.id}
            contract={contract as CPMMMultiContract}
            answer={a}
            state={state}
          />
        ))}
      </Col>
    </Col>
  )
}

// A single district race; clicking the row opens the bet modal for that answer.
function HouseDistrictRow(props: {
  contract: CPMMMultiContract
  answer: Answer
  state: string
}) {
  const { contract, answer, state } = props
  const [outcome, setOutcome] = useState<'YES' | 'NO' | undefined>(undefined)

  const dem = answer.prob
  const rep = 1 - dem
  const demLeads = dem >= 0.5
  const label = parseDistrict(answer.text)?.district ?? answer.text

  return (
    <>
      <Modal
        open={outcome != undefined}
        setOpen={(open) => setOutcome(open ? 'YES' : undefined)}
        className={clsx(MODAL_CLASS, SCROLLABLE_MODAL_CLASS)}
      >
        <AnswerCpmmBetPanel
          answer={answer}
          contract={contract}
          outcome={outcome}
          closePanel={() => setOutcome(undefined)}
          alwaysShowOutcomeSwitcher
        />
      </Modal>

      <button
        onClick={() => {
          track('bet intent', { location: 'house district map' })
          setOutcome('YES')
        }}
        className="hover:bg-canvas-50 grid grid-cols-[4.5rem_1fr_3.5rem] items-center gap-2 rounded px-2 py-1 text-left"
      >
        <span className="text-sm font-medium">
          {state}-{label}
        </span>
        <div className="flex h-2 w-full overflow-hidden rounded-full">
          <div style={{ width: `${dem * 100}%`, backgroundColor: DEM_COLOR }} />
          <div style={{ width: `${rep * 100}%`, backgroundColor: REP_COLOR }} />
        </div>
        <span
          className="text-right text-sm font-semibold"
          style={{ color: demLeads ? DEM_COLOR : REP_COLOR }}
        >
          {demLeads ? 'D' : 'R'} {formatPercent(demLeads ? dem : rep)}
        </span>
      </button>
    </>
  )
}

export function HouseMapSection(props: {
  contract: Contract
  handleClick: (newTargetState: string | undefined) => void
  onMouseEnter: (hoverState: string) => void
  onMouseLeave: () => void
  targetState: string | undefined | null
  hoveredState: string | undefined | null
  setTargetState: (state?: string) => void
}) {
  const {
    handleClick,
    onMouseEnter,
    onMouseLeave,
    targetState,
    hoveredState,
    setTargetState,
  } = props
  const contract = useLiveContract(props.contract)

  // Every state points at the same district market; HouseState filters it.
  const mapContractsDictionary = Object.keys(DATA).reduce((acc, key) => {
    acc[key] = contract
    return acc
  }, {} as MapContractsDictionary)

  const selected = hoveredState ?? targetState

  return (
    <>
      <USAMap
        mapContractsDictionary={mapContractsDictionary}
        handleClick={handleClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        targetState={targetState}
        hoveredState={hoveredState}
        CustomStateComponent={HouseState}
      />
      {selected ? (
        <HouseStateDistricts
          contract={contract}
          state={selected}
          setTargetState={setTargetState}
        />
      ) : (
        <EmptyStateContract />
      )}
    </>
  )
}
