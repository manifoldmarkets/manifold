// https://github.com/jb-1980/usa-map-react
// MIT License

import { DATA } from './usa-map-data'
import { StateText, USAState } from './usa-state'
import clsx from 'clsx'
import { DEM_LIGHT_HEX, REP_LIGHT_HEX, probToColor } from './state-election-map'
import { useState } from 'react'
import { MapContracts, MapContractsDictionary } from 'web/pages/elections'
import { Contract } from 'common/contract'

export const SELECTED_OUTLINE_COLOR = '#00f7ff'

export type ClickHandler<
  E = SVGPathElement | SVGTextElement | SVGCircleElement,
  R = any
> = (e: React.MouseEvent<E, MouseEvent>) => R
export type GetClickHandler = (stateKey: string) => ClickHandler | undefined
export type GetHoverHandler = (stateKey: string) => (() => void) | undefined
export type CustomizeObj = {
  fill?: string
  clickHandler?: ClickHandler
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  selected?: boolean
  hovered?: boolean
}
export interface Customize {
  [key: string]: CustomizeObj
}

export type StatesProps = {
  hideStateTitle?: boolean
  fillStateColor: (stateKey: string) => string
  stateClickHandler: GetClickHandler
  stateMouseEnterHandler: GetHoverHandler
  stateMouseLeaveHandler: GetHoverHandler
  selectedState: (state: string) => boolean
}
const States = ({
  hideStateTitle,
  fillStateColor,
  stateClickHandler,
  stateMouseEnterHandler,
  stateMouseLeaveHandler,
  selectedState,
}: StatesProps) =>
  Object.entries(DATA).map(([stateKey, data]) => (
    <USAState
      key={stateKey}
      stateData={data}
      hideStateTitle={hideStateTitle}
      state={stateKey}
      fill={fillStateColor(stateKey)}
      onClickState={stateClickHandler(stateKey)}
      onMouseEnterState={stateMouseEnterHandler(stateKey)}
      onMouseLeaveState={stateMouseLeaveHandler(stateKey)}
      selected={selectedState(stateKey)}
    />
  ))

// type USAMapPropTypes = {
//   onClick?: ClickHandler
//   width?: number
//   height?: number
//   title?: string
//   defaultFill?: string
//   customize?: Customize
//   hideStateTitle?: boolean
//   className?: string
// }

export const USAMap = (props: {
  // customize,
  hideStateTitle?: boolean
  // className,
  mapContractsDictionary: MapContractsDictionary[]
  targetContract: Contract | null | undefined
  setTargetContract: (targetContract: Contract | null | undefined) => void
  hoveredContract: Contract | null | undefined
  setHoveredContract: (hoveredContract: Contract | null | undefined) => void
}) => {
  const {
    hideStateTitle,
    mapContractsDictionary,
    targetContract,
    setTargetContract,
    hoveredContract,
    setHoveredContract,
  } = props
  // const fillStateColor = (state: string) =>
  //   customize?.[state]?.fill ? (customize[state].fill as string) : defaultFill

  // const stateClickHandler = (state: string) => customize?.[state]?.clickHandler
  // const stateMouseEnterHandler = (state: string) =>
  //   customize?.[state]?.onMouseEnter
  // const stateMouseLeaveHandler = (state: string) =>
  //   customize?.[state]?.onMouseLeave

  // const selectedState = (state: string) => !!customize?.[state]?.selected
  function handleClick(newTargetContract: Contract) {
    if (targetContract && newTargetContract.id === targetContract.id) {
      setTargetContract(undefined)
    } else {
      setTargetContract(newTargetContract)
    }
  }

  function onMouseEnter(hoverContract: Contract) {
    setHoveredContract(hoverContract)
  }

  function onMouseLeave(hoverContract: Contract) {
    setHoveredContract(undefined)
  }

  const totalWidth = 20

  const [isDCHovered, setIsDCHovered] = useState(false)

  const onMouseEnterDC = () => {
    setIsDCHovered(true)
    onMouseEnter(mapContractsDictionary['DC'])
  }
  const onMouseLeaveDC = () => {
    setIsDCHovered(false)
    onMouseLeave(mapContractsDictionary['DC'])
  }

  const isDCSelected =
    targetContract && targetContract.id == mapContractsDictionary['DC'].id

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
              width={(1 / 3) * totalWidth}
              height={totalWidth}
              fill={REP_LIGHT_HEX}
            />
            <rect
              x={(1 / 3) * totalWidth}
              y="0"
              width={(2 / 3) * totalWidth}
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
              width={(2 / 3) * totalWidth}
              height={totalWidth}
              fill={REP_LIGHT_HEX}
            />
            <rect
              x={(2 / 3) * totalWidth}
              y="0"
              width={(1 / 3) * totalWidth}
              height={totalWidth}
              fill={DEM_LIGHT_HEX}
            />
          </pattern>
        </defs>
        <g className="outlines">
          {/* {States({
            hideStateTitle,
            fillStateColor,
            stateClickHandler,
            stateMouseEnterHandler,
            stateMouseLeaveHandler,
            selectedState,
          })}{' '} */}
          {Object.entries(DATA).map(([stateKey, data]) => (
            <USAState
              key={stateKey}
              stateData={data}
              stateContract={mapContractsDictionary[stateKey]}
              hideStateTitle={hideStateTitle}
              state={stateKey}
              // fill={probToColor(mapContractsDictionary[stateKey]) ?? '#D6D1D3'}
              onClickState={() => {
                handleClick(mapContractsDictionary[stateKey])
              }}
              onMouseEnterState={() => {
                onMouseEnter(mapContractsDictionary[stateKey])
              }}
              onMouseLeaveState={() => {
                onMouseLeave(mapContractsDictionary[stateKey])
              }}
              selected={
                targetContract &&
                targetContract.id == mapContractsDictionary[stateKey].id
              }
            />
          ))}
          <circle
            fill={probToColor(mapContractsDictionary['DC']) ?? '#D6D1D3'}
            stroke={isDCSelected ? SELECTED_OUTLINE_COLOR : '#FFFFFF'}
            strokeWidth={isDCHovered || isDCSelected ? 2 : undefined}
            cx="801.3"
            cy="251.8"
            r="5"
            opacity="1"
            onClick={() => handleClick(mapContractsDictionary['DC'])}
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
            fill: probToColor(mapContractsDictionary['DC']) ?? '#D6D1D3',
            onClick: () => handleClick(mapContractsDictionary['DC']),
          })}
        </g>
      </svg>
    </div>
  )
}
