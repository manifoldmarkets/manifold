// https://github.com/jb-1980/usa-map-react
// MIT License

import { DATA } from './usa-map-data'
import { OFFSET_TEXT_COLOR, StateText, USAState } from './usa-state'
import clsx from 'clsx'
import { DEM_LIGHT_HEX, REP_LIGHT_HEX, probToColor } from './state-election-map'
import { MouseEvent } from 'react'
import { MapContractsDictionary } from 'web/pages/elections'
import { Contract, MultiContract } from 'common/contract'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { useAnswersCpmm } from 'web/hooks/use-answers'

export const SELECTED_OUTLINE_COLOR = '#00f7ff'

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

  const totalWidth = 20

  const onMouseEnterDC = () => {
    onMouseEnter('DC')
  }
  const onMouseLeaveDC = () => {
    onMouseLeave()
  }

  const cachedDCContract = mapContractsDictionary['DC']

  const isDCSelected = !!targetState && targetState == 'DC'

  return (
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
        <defs>
          {/* Pattern with equal red and blue */}
          <pattern
            id="patternEqual"
            patternUnits="userSpaceOnUse"
            width={totalWidth}
            height={totalWidth}
            patternTransform="rotate(45)"
          >
            <rect
              x="0"
              y="0"
              width={totalWidth / 2}
              height={totalWidth}
              fill={REP_LIGHT_HEX}
            />
            <rect
              x={totalWidth / 2}
              y="0"
              width={totalWidth / 2}
              height={totalWidth}
              fill={DEM_LIGHT_HEX}
            />
          </pattern>

          {/* Pattern with 2x more blue */}
          <pattern
            id="patternMoreBlue"
            patternUnits="userSpaceOnUse"
            width={totalWidth}
            height={totalWidth}
            patternTransform="rotate(45)"
          >
            <rect
              x="0"
              y="0"
              width={(1 / 5) * totalWidth}
              height={totalWidth}
              fill={REP_LIGHT_HEX}
            />
            <rect
              x={(1 / 5) * totalWidth}
              y="0"
              width={(4 / 5) * totalWidth}
              height={totalWidth}
              fill={DEM_LIGHT_HEX}
            />
          </pattern>

          {/* Pattern with 2x more red */}
          <pattern
            id="patternMoreRed"
            patternUnits="userSpaceOnUse"
            width={totalWidth}
            height={totalWidth}
            patternTransform="rotate(45)"
          >
            <rect
              x="0"
              y="0"
              width={(4 / 5) * totalWidth}
              height={totalWidth}
              fill={REP_LIGHT_HEX}
            />
            <rect
              x={(4 / 5) * totalWidth}
              y="0"
              width={(1 / 5) * totalWidth}
              height={totalWidth}
              fill={DEM_LIGHT_HEX}
            />
          </pattern>
        </defs>
        <g className="outlines">
          {Object.entries(DATA).map(([stateKey, data]) => {
            const stateContract = mapContractsDictionary[stateKey]
            if (!!stateContract) {
              return (
                <USAState
                  key={stateKey}
                  stateData={data}
                  stateContract={stateContract as MultiContract}
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
                />
              )
            }
            return <></>
          })}
          {cachedDCContract ? (
            <DCState
              cachedContract={cachedDCContract}
              isDCHovered={hoveredState == 'DC'}
              isDCSelected={isDCSelected}
              onMouseEnterDC={onMouseEnterDC}
              onMouseLeaveDC={onMouseLeaveDC}
              handleClick={() => handleClick('DC')}
            />
          ) : (
            <></>
          )}
        </g>
      </svg>
    </div>
  )
}

export function DCState(props: {
  cachedContract: Contract
  isDCSelected: boolean
  isDCHovered: boolean
  onMouseEnterDC: (() => void) | undefined
  onMouseLeaveDC: (() => void) | undefined
  handleClick: (() => void) | undefined
}) {
  const {
    cachedContract,
    isDCSelected,
    isDCHovered,
    onMouseEnterDC,
    onMouseLeaveDC,
    handleClick,
  } = props
  const DCContract =
    (useFirebasePublicContract(
      cachedContract.visibility,
      cachedContract.id
    ) as MultiContract) ?? cachedContract

  if (DCContract.mechanism === 'cpmm-multi-1') {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const answers = useAnswersCpmm(DCContract.id)
    if (answers) {
      DCContract.answers = answers
    }
  }

  const DCFill = probToColor(DCContract)
  return (
    <>
      <circle
        fill={DCFill ?? '#D6D1D3'}
        stroke={isDCSelected ? SELECTED_OUTLINE_COLOR : '#FFFFFF'}
        strokeWidth={isDCHovered || isDCSelected ? 2 : undefined}
        cx="801.3"
        cy="251.8"
        r="5"
        opacity="1"
        onClick={handleClick}
        onMouseEnter={onMouseEnterDC}
        onMouseLeave={onMouseLeaveDC}
      />
      {StateText({
        line: { x1: 804, y1: 255, x2: 849, y2: 295 },
        textCoordinates: { x: 860, y: 300 },
        abbreviation: 'DC',
        onMouseEnter: onMouseEnterDC,
        onMouseLeave: onMouseLeaveDC,
        isHovered: isDCHovered,
        fill: DCFill ?? OFFSET_TEXT_COLOR,
        onClick: handleClick,
        selected: isDCSelected,
      })}
    </>
  )
}
