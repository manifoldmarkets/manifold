import clsx from 'clsx'
import { Contract } from 'common/contract'
import { MapContractsDictionary } from 'common/politics/elections-data'
import { Congress } from 'politics/public/custom-components/congress'
import { WhiteHouse } from 'politics/public/custom-components/whiteHouse'
import { ReactNode, useState, useEffect } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { useAnswersCpmm } from 'web/hooks/use-answers'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { ElectoralCollegeVisual } from './electoral-college-visual'
import { EmptyStateContract, StateContract } from './state-contract'
import { USAMap } from './usa-map'
import { PresidentialState } from './presidential-state'
import { SenateCurrentOrContract, SenateState } from './senate-state'

type MapMode = 'presidency' | 'senate'

export function HomepageMap(props: {
  rawPresidencyStateContracts: MapContractsDictionary
  rawSenateStateContracts: MapContractsDictionary
}) {
  const { rawPresidencyStateContracts, rawSenateStateContracts } = props

  const presidencyContractsDictionary = Object.keys(
    rawPresidencyStateContracts
  ).reduce((acc, key) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    acc[key] = useLiveContract(rawPresidencyStateContracts[key]!)
    return acc
  }, {} as MapContractsDictionary)

  const senateContractsDictionary = Object.keys(rawSenateStateContracts).reduce(
    (acc, key) => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      acc[key] = useLiveContract(rawSenateStateContracts[key]!)
      return acc
    },
    {} as MapContractsDictionary
  )
  const [mode, setMode] = useState<MapMode>('presidency')

  const [targetState, setTargetState] = useState<string | undefined | null>(
    'GA'
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

  return (
    <Col className="bg-canvas-0 p-4">
      <MapTab mode={mode} setMode={setMode} />
      {mode === 'presidency' ? (
        <>
          <div className="mx-auto font-serif font-semibold sm:text-xl">
            Which party will win the US Presidency?
          </div>
          <ElectoralCollegeVisual
            mapContractsDictionary={presidencyContractsDictionary}
            handleClick={handleClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            targetState={targetState}
            hoveredState={hoveredState}
          />
          <Spacer h={4} />
          <USAMap
            mapContractsDictionary={presidencyContractsDictionary}
            handleClick={handleClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            targetState={targetState}
            hoveredState={hoveredState}
            CustomStateComponent={PresidentialState}
          />
          {!!hoveredState || !!targetState ? (
            <StateContract
              targetContract={
                presidencyContractsDictionary[
                  hoveredState! ?? targetState
                ] as Contract
              }
              targetState={targetState}
              setTargetState={setTargetState}
            />
          ) : (
            <EmptyStateContract />
          )}
        </>
      ) : (
        <>
          <div className="mx-auto font-serif font-semibold sm:text-xl">
            Which party will win Senate?
          </div>
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
              setTargetState={setTargetState}
            />
          ) : (
            <EmptyStateContract />
          )}
        </>
      )}
    </Col>
  )
}

function MapTab(props: { mode: MapMode; setMode: (mode: MapMode) => void }) {
  const { mode, setMode } = props
  return (
    <Row className="text-ink-600 mx-auto mb-4 gap-6 font-mono text-sm transition-colors">
      <MapTabButton
        onClick={() => setMode('presidency')}
        isActive={mode === 'presidency'}
        icon={
          <WhiteHouse
            height={9}
            className={clsx(
              '-mb-3',
              mode === 'presidency' ? 'fill-ink-1000' : 'fill-ink-300'
            )}
          />
        }
        text="Presidency"
      />
      <MapTabButton
        onClick={() => setMode('senate')}
        isActive={mode === 'senate'}
        icon={
          <Congress
            height={9}
            className={clsx(
              '-mb-3',
              mode === 'senate' ? 'fill-ink-1000' : 'fill-ink-300'
            )}
          />
        }
        text="Senate"
      />
    </Row>
  )
}

function MapTabButton(props: {
  onClick: () => void
  isActive: boolean
  icon: ReactNode
  text: string
}) {
  const { onClick, isActive, icon, text } = props
  return (
    <button
      onClick={onClick}
      className={clsx(
        ' hover:text-ink-1000 group flex flex-col items-center',
        isActive ? 'text-ink-1000' : 'text-ink-300'
      )}
    >
      {icon}
      <div
        className={clsx(
          isActive && 'underline decoration-2 underline-offset-[10px] '
        )}
      >
        {text}
      </div>
    </button>
  )
}

function useLiveContract(inputContract: Contract): Contract {
  const contract =
    useFirebasePublicContract(inputContract.visibility, inputContract.id) ??
    inputContract

  if (contract.mechanism === 'cpmm-multi-1') {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const answers = useAnswersCpmm(contract.id)
    if (answers) {
      contract.answers = answers
    }
  }
  return contract
}
