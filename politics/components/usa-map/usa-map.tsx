// https://github.com/jb-1980/usa-map-react
// MIT License

import { Col } from 'web/components/layout/col'
import { DATA } from './usa-map-data'
import { USAState } from './usa-state'
import clsx from 'clsx'
import { DEM_LIGHT_HEX, REP_LIGHT_HEX } from './state-election-map'

export type ClickHandler<E = SVGPathElement | SVGCircleElement, R = any> = (
  e: React.MouseEvent<E, MouseEvent>
) => R
export type GetClickHandler = (stateKey: string) => ClickHandler | undefined
export type CustomizeObj = {
  fill?: string
  clickHandler?: ClickHandler
  selected?: boolean
}
export interface Customize {
  [key: string]: CustomizeObj
}

export type StatesProps = {
  hideStateTitle?: boolean
  fillStateColor: (stateKey: string) => string
  stateClickHandler: GetClickHandler
  selectedState: (state: string) => boolean
}
const States = ({
  hideStateTitle,
  fillStateColor,
  stateClickHandler,
  selectedState,
}: StatesProps) =>
  Object.entries(DATA).map(([stateKey, data]) => (
    <USAState
      key={stateKey}
      hideStateTitle={hideStateTitle}
      stateName={data.name}
      dimensions={data.dimensions}
      state={stateKey}
      fill={fillStateColor(stateKey)}
      selected={selectedState(stateKey)}
      onClickState={stateClickHandler(stateKey)}
    />
  ))

type USAMapPropTypes = {
  onClick?: ClickHandler
  width?: number
  height?: number
  title?: string
  defaultFill?: string
  customize?: Customize
  hideStateTitle?: boolean
  className?: string
}

export const USAMap = ({
  onClick = (e) => {
    console.log(e.currentTarget.dataset.name)
  },
  title = 'US states map',
  defaultFill = '#d3d3d3',
  customize,
  hideStateTitle,
  className,
}: USAMapPropTypes) => {
  const fillStateColor = (state: string) =>
    customize?.[state]?.fill ? (customize[state].fill as string) : defaultFill

  const stateClickHandler = (state: string) => customize?.[state]?.clickHandler

  const selectedState = (state: string) => !!customize?.[state]?.selected

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
            width="30"
            height="30"
            patternTransform="rotate(45)"
          >
            <rect x="0" y="0" width="15" height="30" fill={REP_LIGHT_HEX} />
            <rect x="15" y="0" width="15" height="30" fill={DEM_LIGHT_HEX} />
          </pattern>

          {/* Pattern with 2x more blue */}
          <pattern
            id="patternMoreBlue"
            patternUnits="userSpaceOnUse"
            width="30"
            height="30"
            patternTransform="rotate(45)"
          >
            <rect x="0" y="0" width="10" height="30" fill={REP_LIGHT_HEX} />
            <rect x="10" y="0" width="20" height="30" fill={DEM_LIGHT_HEX} />
          </pattern>

          {/* Pattern with 2x more red */}
          <pattern
            id="patternMoreRed"
            patternUnits="userSpaceOnUse"
            width="30"
            height="30"
            patternTransform="rotate(45)"
          >
            <rect x="0" y="0" width="20" height="30" fill={REP_LIGHT_HEX} />
            <rect x="20" y="0" width="10" height="30" fill={DEM_LIGHT_HEX} />
          </pattern>
        </defs>
        <title>{title}</title>
        <g className="outlines">
          {States({
            hideStateTitle,
            fillStateColor,
            stateClickHandler,
            selectedState,
          })}
          <g className="DC state">
            <path
              className="DC1"
              fill={fillStateColor('DC1')}
              d="M801.8,253.8 l-1.1-1.6 -1-0.8 1.1-1.6 2.2,1.5z"
            />
            <circle
              className="DC2"
              onClick={onClick}
              data-name={'DC'}
              fill={fillStateColor('DC2')}
              stroke="#FFFFFF"
              strokeWidth="1.5"
              cx="801.3"
              cy="251.8"
              r="5"
              opacity="1"
            />
          </g>
        </g>
      </svg>
    </div>
  )
}
