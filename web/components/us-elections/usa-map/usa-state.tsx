import clsx from 'clsx'
import { ClickHandler, SELECTED_OUTLINE_COLOR } from './usa-map'
import { StateDataType } from './usa-map-data'
import { useState } from 'react'

type TextCoordinates = { x: number; y: number }

type USAStateProps = {
  state: string
  stateData: StateDataType
  fill: string
  onClickState?: ClickHandler
  onMouseEnterState?: () => void | undefined
  onMouseLeaveState?: () => void | undefined
  hideStateTitle?: boolean
  selected?: boolean
}
export const USAState = ({
  state,
  stateData,
  fill,
  onClickState,
  onMouseEnterState,
  onMouseLeaveState,
  hideStateTitle,
  selected,
}: USAStateProps) => {
  const { dimensions, textCoordinates, abbreviation, line } = stateData
  const [isHovered, setIsHovered] = useState(false)
  const onMouseEnter = () => {
    setIsHovered(true)
    if (onMouseEnterState) {
      onMouseEnterState()
    }
  }
  const onMouseLeave = () => {
    setIsHovered(false)
    if (onMouseLeaveState) {
      onMouseLeaveState()
    }
  }
  return (
    <>
      <path
        d={dimensions}
        fill={fill}
        data-name={state}
        className={clsx(
          !!onClickState && 'transition-all group-hover:cursor-pointer'
        )}
        onClick={onClickState}
        id={state}
        stroke={
          !!selected ? SELECTED_OUTLINE_COLOR : isHovered ? '#fff' : undefined
        }
        strokeWidth={!!selected || !!isHovered ? 2 : undefined}
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
