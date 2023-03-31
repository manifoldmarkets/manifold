// https://github.com/jb-1980/usa-map-react
// MIT License

import clsx from 'clsx'

import { DATA } from './data'
import { USAState } from './usa-state'

export type ClickHandler<E = SVGPathElement | SVGCircleElement, R = any> = (
  e: React.MouseEvent<E, MouseEvent>
) => R
export type GetClickHandler = (stateKey: string) => ClickHandler | undefined

export type MouseEventHandler<
  E = SVGPathElement | SVGCircleElement,
  R = any
> = (e: React.MouseEvent<E, MouseEvent>) => R
export type GetMouseEventHandler = (
  stateKey: string
) => MouseEventHandler | undefined

export type CustomizeObj = {
  fill?: string
  clickHandler?: ClickHandler
  mouseEnterHandler?: MouseEventHandler
  mouseLeaveHandler?: MouseEventHandler
}
export interface Customize {
  [key: string]: CustomizeObj
}

export type StatesProps = {
  hideStateTitle?: boolean
  fillStateColor: (stateKey: string) => string
  stateClickHandler: GetClickHandler
  stateMouseEnterHandler: GetMouseEventHandler
  stateMouseLeaveHandler: GetMouseEventHandler
}
const States = ({
  hideStateTitle,
  fillStateColor,
  stateClickHandler,
  stateMouseEnterHandler,
  stateMouseLeaveHandler,
}: StatesProps) =>
  Object.entries(DATA).map(([stateKey, data]) => (
    <USAState
      key={stateKey}
      hideStateTitle={hideStateTitle}
      stateName={data.name}
      dimensions={data.dimensions}
      state={stateKey}
      fill={fillStateColor(stateKey)}
      onClickState={stateClickHandler(stateKey)}
      onMouseEnter={stateMouseEnterHandler(stateKey)}
      onMouseLeave={stateMouseLeaveHandler(stateKey)}
    />
  ))

type USAMapPropTypes = {
  onClick?: ClickHandler
  width?: number
  height?: number
  defaultFill?: string
  customize?: Customize
  hideStateTitle?: boolean
  className?: string
}

export const USAMap = ({
  onClick = (e) => {
    console.log(e.currentTarget.dataset.name)
  },
  defaultFill = '#d3d3d3',
  customize,
  hideStateTitle,
  className,
}: USAMapPropTypes) => {
  const fillStateColor = (state: string) =>
    customize?.[state]?.fill ? (customize[state].fill as string) : defaultFill

  const stateClickHandler = (state: string) => customize?.[state]?.clickHandler
  const stateMouseEnterHandler = (state: string) =>
    customize?.[state]?.mouseEnterHandler
  const stateMouseLeaveHandler = (state: string) =>
    customize?.[state]?.mouseLeaveHandler

  return (
    <svg
      className={clsx('flex h-96 w-full sm:h-full', className)}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 959 593"
    >
      <g className="outlines">
        {States({
          hideStateTitle,
          fillStateColor,
          stateClickHandler,
          stateMouseEnterHandler,
          stateMouseLeaveHandler,
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
  )
}
