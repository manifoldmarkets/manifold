import clsx from 'clsx'
import { Contract } from 'common/contract'
import { CongressSenate } from 'web/public/custom-components/congress_senate'
import { CongressCenter } from 'web/public/custom-components/congress_center'
import { CongressHouse } from 'web/public/custom-components/congress_house'
import { Governor } from 'web/public/custom-components/governor'
import { ReactNode, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { useLiveContract } from 'web/hooks/use-contract'
import {
  EmptyStateContract,
  StateContract,
  extractBeforeGovernorsRace,
} from './state-contract'
import { USAMap } from './usa-map'
import { SenateCurrentOrContract, SenateState } from './senate-state'
import { SenateBar } from './senate-bar'
import { GovernorState } from './governor-state'
import { HouseMapSection } from './house-map'
import { FeedContractCard } from '../contract/feed-contract-card'
import { MapContractsDictionary } from 'web/public/data/elections-data'

// 2026 midterms: no presidential race. The Senate/Governor races map onto
// states; the House is decided by district, so it's a table rather than a map.
type MapMode = 'senate' | 'house' | 'governor'

export function HomepageMap(props: {
  rawSenateStateContracts: MapContractsDictionary
  rawGovernorStateContracts: MapContractsDictionary
  rawSenateCandidateContracts: MapContractsDictionary
  rawGovernorCandidateContracts: MapContractsDictionary
  houseDistrictsContract: Contract | null
}) {
  const {
    rawSenateStateContracts,
    rawGovernorStateContracts,
    rawSenateCandidateContracts,
    rawGovernorCandidateContracts,
    houseDistrictsContract,
  } = props

  const senateContractsDictionary = Object.keys(rawSenateStateContracts).reduce(
    (acc, key) => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      acc[key] = useLiveContract(rawSenateStateContracts[key]!)
      return acc
    },
    {} as MapContractsDictionary
  )

  const governorContractsDictionary = Object.keys(
    rawGovernorStateContracts
  ).reduce((acc, key) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    acc[key] = useLiveContract(rawGovernorStateContracts[key]!)
    return acc
  }, {} as MapContractsDictionary)

  const [mode, setMode] = useState<MapMode>('senate')

  const [targetState, setTargetState] = useState<string | undefined | null>(
    undefined
  )

  const [hoveredState, setHoveredState] = useState<string | undefined | null>(
    undefined
  )

  function handleClick(newTargetState: string | undefined) {
    if (targetState && newTargetState == targetState) {
      setTargetState(undefined)
    } else {
      setTargetState(newTargetState)
    }
  }

  function onMouseEnter(hoverState: string) {
    setHoveredState(hoverState)
  }

  function onMouseLeave() {
    setHoveredState(undefined)
  }

  // The state whose detail (and candidate card) is shown: hover takes priority,
  // falling back to the clicked/pinned state.
  const selectedState = hoveredState ?? targetState

  return (
    <Col className="bg-canvas-0 rounded-xl p-4">
      <MapTab mode={mode} setMode={setMode} />
      {mode === 'governor' ? (
        <>
          <div className="pointer-events-none mx-auto font-semibold sm:text-lg">
            Which party will win the Governor's Race?
          </div>
          <Spacer h={4} />
          <USAMap
            mapContractsDictionary={governorContractsDictionary}
            handleClick={handleClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            targetState={targetState}
            hoveredState={hoveredState}
            CustomStateComponent={GovernorState}
          />
          {!!hoveredState || !!targetState ? (
            <StateContract
              targetContract={
                governorContractsDictionary[
                  hoveredState! ?? targetState
                ] as Contract
              }
              targetState={targetState}
              setTargetState={setTargetState}
              customTitleFunction={extractBeforeGovernorsRace}
            />
          ) : (
            <EmptyStateContract />
          )}
          {selectedState && rawGovernorCandidateContracts[selectedState] && (
            <CandidateRaceCard
              contract={rawGovernorCandidateContracts[selectedState] as Contract}
            />
          )}
        </>
      ) : mode === 'house' ? (
        <>
          <div className="pointer-events-none mx-auto font-semibold sm:text-lg">
            Which party will win the House?
          </div>
          <Spacer h={4} />
          {houseDistrictsContract ? (
            <HouseMapSection
              contract={houseDistrictsContract}
              handleClick={handleClick}
              onMouseEnter={onMouseEnter}
              onMouseLeave={onMouseLeave}
              targetState={targetState}
              hoveredState={hoveredState}
              setTargetState={setTargetState}
            />
          ) : (
            <Col className="text-ink-500 h-[200px] items-center justify-center text-sm">
              No House district market available yet.
            </Col>
          )}
        </>
      ) : (
        <>
          <div className="pointer-events-none mx-auto font-semibold sm:text-lg">
            Which party will win the Senate?
          </div>
          <SenateBar
            mapContractsDictionary={senateContractsDictionary}
            handleClick={handleClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            targetState={targetState}
            hoveredState={hoveredState}
          />
          <Spacer h={4} />
          <USAMap
            mapContractsDictionary={senateContractsDictionary}
            handleClick={handleClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            targetState={targetState}
            hoveredState={hoveredState}
            CustomStateComponent={SenateState}
          />
          {!!hoveredState || !!targetState ? (
            <SenateCurrentOrContract
              targetContract={
                senateContractsDictionary[
                  hoveredState! ?? targetState
                ] as Contract
              }
              targetState={targetState}
              hoveredState={hoveredState}
              setTargetState={setTargetState}
            />
          ) : (
            <EmptyStateContract />
          )}
          {selectedState && rawSenateCandidateContracts[selectedState] && (
            <CandidateRaceCard
              contract={rawSenateCandidateContracts[selectedState] as Contract}
            />
          )}
        </>
      )}
    </Col>
  )
}

// Surfaces the candidate ("who will win") market for the selected state, so the
// party map is complemented by the actual people running — and a place to bet
// on them. Only rendered for states that have such a community market.
function CandidateRaceCard(props: { contract: Contract }) {
  return (
    <Col className="mt-3 gap-1">
      <div className="text-ink-600 text-sm font-semibold">Who's running</div>
      <FeedContractCard contract={props.contract} hideBottomRow />
    </Col>
  )
}

function MapTab(props: { mode: MapMode; setMode: (mode: MapMode) => void }) {
  const { mode, setMode } = props
  return (
    <Row className="text-ink-600 mx-auto mb-4 items-end gap-8 text-base transition-colors">
      {/* Senate (left wing) + dome + House (right wing) nest into one Capitol.
          Margins are tuned to height={12}; scale them together if you resize. */}
      <Row className="relative">
        <MapTabButton
          onClick={() => setMode('senate')}
          isActive={mode === 'senate'}
          className="pl-4"
          icon={
            <CongressSenate
              height={12}
              className={clsx(
                '-mb-4 -mr-8',
                mode === 'senate'
                  ? 'fill-primary-700'
                  : 'fill-ink-500 group-hover:fill-ink-700 transition-colors'
              )}
            />
          }
          text="Senate"
        />
        <CongressCenter
          height={12}
          className={clsx('-ml-[20.7px] -mr-[18px]', 'fill-ink-500')}
        />
        <MapTabButton
          onClick={() => setMode('house')}
          isActive={mode === 'house'}
          className="items-start pr-4"
          icon={
            <CongressHouse
              height={12}
              className={clsx(
                '-mb-4 -ml-8',
                mode === 'house'
                  ? 'fill-primary-700'
                  : 'fill-ink-500 group-hover:fill-ink-700 transition-colors'
              )}
            />
          }
          text="House"
        />
      </Row>
      <MapTabButton
        onClick={() => setMode('governor')}
        isActive={mode === 'governor'}
        className="px-3"
        icon={
          <Governor
            height={10}
            className={clsx(
              '-mb-2 mt-1',
              mode === 'governor'
                ? 'fill-primary-700'
                : 'fill-ink-500 group-hover:fill-ink-700 transition-colors'
            )}
          />
        }
        text="Governor"
      />
    </Row>
  )
}

function MapTabButton(props: {
  onClick: () => void
  isActive: boolean
  icon: ReactNode
  text: string
  className?: string
}) {
  const { onClick, isActive, icon, text, className } = props
  return (
    <button
      onClick={onClick}
      className={clsx(
        'group flex flex-col items-center py-2 transition-colors',
        isActive ? 'text-primary-700' : 'text-ink-500 hover:text-ink-700 ',
        className
      )}
    >
      {icon}
      <div
        className={clsx(
          isActive &&
            'underline decoration-2 underline-offset-[7px] transition-all',
          'mt-0.5'
        )}
      >
        {text}
      </div>
    </button>
  )
}
