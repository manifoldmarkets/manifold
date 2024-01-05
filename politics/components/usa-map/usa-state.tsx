import clsx from 'clsx'
import { ClickHandler } from './usa-map'

type TextCoordinates = { x: number; y: number }

type USAStateProps = {
  state: string
  dimensions: string
  fill: string
  stateAbbr: string
  onClickState?: ClickHandler
  stateName: string
  hideStateTitle?: boolean
  selected?: boolean
  textCoordinates?: TextCoordinates
}
export const USAState = ({
  state,
  dimensions,
  fill,
  onClickState,
  stateName,
  hideStateTitle,
  selected,
  stateAbbr,
  textCoordinates,
}: USAStateProps) => {
  return (
    <>
      <path
        d={dimensions}
        fill={fill}
        data-name={state}
        className={clsx(!!onClickState && 'hover:cursor-pointer ')}
        onClick={onClickState}
        id={state}
        stroke={!!selected ? '#FFF' : undefined}
        strokeWidth={!!selected ? 2 : undefined}
      />
      {/* {textCoordinates && (
        <text
          key={state}
          x={textCoordinates.x}
          y={textCoordinates.y}
          textAnchor="middle"
        >
          {stateAbbr}
        </text>
      )} */}
    </>
  )
}
