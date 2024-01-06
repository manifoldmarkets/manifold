import clsx from 'clsx'
import { ClickHandler, SELECTED_OUTLINE_COLOR } from './usa-map'
import { StateDataType } from './usa-map-data'
import { useState } from 'react'
import { MouseEventHandler } from 'react'

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
  const [isHovered, setIsHovered] = useState(false)
  const onMouseEnter = () => setIsHovered(true)
  const onMouseLeave = () => setIsHovered(false)
  return (
    <>
      <path
        d={dimensions}
        fill={fill}
        data-name={state}
        className={clsx(!!onClickState && 'group-hover:cursor-pointer ')}
        onClick={onClickState}
        id={state}
        stroke={!!selected ? SELECTED_OUTLINE_COLOR : undefined}
        strokeWidth={!!selected ? 2 : undefined}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />
      {StateText({
        line,
        textCoordinates,
        abbreviation,
        onMouseEnter: line ? onMouseEnter : undefined,
        onMouseLeave: line ? onMouseLeave : undefined,
        isHovered,
        fill,
        onClick: line ? onClickState : undefined,
      })}
    </>
  )
}

export const StateText = (props: {
  line:
    | {
        x1: number
        y1: number
        x2: number
        y2: number
      }
    | undefined
  textCoordinates: TextCoordinates | undefined
  abbreviation: string
  onMouseEnter: (() => void) | undefined
  onMouseLeave: (() => void) | undefined
  isHovered: boolean
  fill: string
  onClick?: ClickHandler
}) => {
  const {
    line,
    textCoordinates,
    abbreviation,
    onMouseEnter,
    onMouseLeave,
    isHovered,
    fill,
    onClick,
  } = props
  if (!textCoordinates) return null // Return null if there are no textCoordinates

  const textColor = !!line ? (isHovered ? fill : '#000') : '#FFF'

  return (
    <>
      <text
        key={abbreviation}
        x={textCoordinates.x}
        y={textCoordinates.y}
        textAnchor="middle"
        fill={textColor}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        className={line ? 'cursor-pointer' : 'pointer-events-none'}
        onClick={onClick}
      >
        {abbreviation}
      </text>
      {line && (
        <>
          {/* Outline Line - Only shown when hovered */}
          {isHovered && (
            <line
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={'#fff'}
              strokeWidth={3}
            />
          )}

          {/* Regular Line */}
          <line
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke={isHovered ? fill : '#cec0ce'}
            strokeWidth={1} // Assuming the regular line is thinner
          />
        </>
      )}
    </>
  )
}
