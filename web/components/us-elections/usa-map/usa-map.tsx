// https://github.com/jb-1980/usa-map-react
// MIT License

import clsx from 'clsx'
import { MultiContract } from 'common/contract'
import { MouseEvent } from 'react'
import { DATA } from './usa-map-data'
import { USAState } from './usa-state'
import { Col } from 'web/components/layout/col'
import { ElectoralCollegeVisual } from './electoral-college-visual'
import { Spacer } from 'web/components/layout/spacer'
import { MapContractsDictionary } from 'common/election-contract-data'

export const SELECTED_OUTLINE_COLOR = '#00f7ff'
export const HIGHLIGHTED_OUTLINE_COLOR = '#00f7ffb3'

export type ClickHandler<
  E = SVGPathElement | SVGTextElement | SVGCircleElement,
  R = any
> = (e: React.MouseEvent<E, MouseEvent>) => R

export const USAMap = (props: {
  hideStateTitle?: boolean
  mapContractsDictionary: MapContractsDictionary
  targetState: string | null | undefined
  setTargetState: (targetState: string | null | undefined) => void
  hoveredState: string | null | undefined
  setHoveredState: (hoveredState: string | null | undefined) => void
}) => {
  const {
    hideStateTitle,
    mapContractsDictionary,
    targetState,
    setTargetState,
    hoveredState,
    setHoveredState,
  } = props

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
    <Col className="gap-2">
      <ElectoralCollegeVisual
        mapContractsDictionary={mapContractsDictionary}
        handleClick={handleClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        targetState={targetState}
        hoveredState={hoveredState}
      />
      <Spacer h={4} />
      <div
        className={clsx('relative w-full')}
        style={{ paddingTop: '61.75%' /* (593 / 959) * 100 */ }}
      >
        <svg
          className="absolute left-0 top-0 h-full w-full"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 959 593"
          preserveAspectRatio="xMidYMid meet"
        >
          <g className="outlines">
            {Object.entries(DATA).map(([stateKey, data]) => {
              const stateContract = mapContractsDictionary[stateKey]
              if (!!stateContract) {
                return (
                  <USAState
                    key={stateKey}
                    stateData={data}
                    contract={stateContract as MultiContract}
                    hideStateTitle={hideStateTitle}
                    state={stateKey}
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
              return <></>
            })}
          </g>
        </svg>
      </div>
    </Col>
  )
}
