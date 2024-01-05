import clsx from 'clsx'
import { ClickHandler } from './usa-map'
import { StateDataType } from './usa-map-data'

type TextCoordinates = { x: number; y: number }

type USAStateProps = {
  state: string
  stateData: StateDataType
  fill: string
  onClickState?: ClickHandler
  hideStateTitle?: boolean
  selected?: boolean
}
export const USAState = ({
  state,
  stateData,
  fill,
  onClickState,
  hideStateTitle,
  selected,
}: USAStateProps) => {
  const { dimensions, textCoordinates, abbreviation, line } = stateData
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
      {textCoordinates && (
        <>
          <text
            key={state}
            x={textCoordinates.x}
            y={textCoordinates.y}
            textAnchor="middle"
          >
            {abbreviation}
          </text>
          {line && (
            <line
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke="#cec0ce"
            />
          )}
        </>
      )}
    </>
  )
}
