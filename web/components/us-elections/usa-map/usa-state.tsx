import clsx from 'clsx'
import { ClickHandler, SELECTED_OUTLINE_COLOR } from './usa-map'
import { StateDataType } from './usa-map-data'
import { MouseEventHandler, useState } from 'react'
import { MultiContract } from 'common/contract'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { useAnswersCpmm } from 'web/hooks/use-answers'
import { probToColor } from './state-election-map'

type TextCoordinates = { x: number; y: number }

export const OFFSET_TEXT_COLOR = '#9E9FBD'

export function USAState(props: {
  state: string
  stateData: StateDataType
  contract: MultiContract
  onClickState?: ClickHandler
  onMouseEnterState?: () => void | undefined
  onMouseLeaveState?: () => void | undefined
  hideStateTitle?: boolean
  selected?: boolean
  hovered?: boolean
}) {
  const {
    state,
    stateData,
    contract,
    onClickState,
    onMouseEnterState,
    onMouseLeaveState,
    hideStateTitle,
    selected,
    hovered,
  } = props

  const { dimensions, textCoordinates, abbreviation, line } = stateData

  const fill = probToColor(contract) ?? ''

  return (
    <>
      <path
        d={dimensions}
        fill={fill}
        data-name={state}
        className={clsx(
          !!onClickState && 'transition-all group-hover:cursor-pointer'
        )}
        onClick={onClickState as MouseEventHandler<SVGPathElement> | undefined}
        id={state}
        stroke={
          !!selected ? SELECTED_OUTLINE_COLOR : hovered ? '#fff' : undefined
        }
        strokeWidth={!!selected || !!hovered ? 2 : undefined}
        onMouseEnter={onMouseEnterState}
        onMouseLeave={onMouseLeaveState}
      />
      {StateText({
        line,
        textCoordinates,
        abbreviation,
        onMouseEnter: line ? onMouseEnterState : undefined,
        onMouseLeave: line ? onMouseLeaveState : undefined,
        isHovered: !!hovered,
        fill,
        onClick: line ? onClickState : undefined,
        selected,
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
  selected?: boolean
}) => {
  const {
    line,
    textCoordinates,
    abbreviation,
    onMouseEnter,
    onMouseLeave,
    isHovered,
    fill,
    selected,
    onClick,
  } = props
  if (!textCoordinates) return null // Return null if there are no textCoordinates

  const textColor = !!line
    ? isHovered || selected
      ? fill
      : OFFSET_TEXT_COLOR
    : '#FFF'

  return (
    <>
      {line && (!!isHovered || !!selected) && (
        <text
          key={`${abbreviation}-outline`}
          x={textCoordinates.x}
          y={textCoordinates.y}
          textAnchor="middle"
          fill={'#ffff'}
          stroke={'#ffff'}
          strokeWidth={2}
        >
          {abbreviation}
        </text>
      )}

      <text
        key={abbreviation}
        x={textCoordinates.x}
        y={textCoordinates.y}
        textAnchor="middle"
        fill={textColor}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        className={line ? 'cursor-pointer' : 'pointer-events-none'}
        onClick={onClick as MouseEventHandler<SVGTextElement> | undefined}
      >
        {abbreviation}
      </text>
      {line && (
        <>
          {/* Outline Line - Only shown when hovered */}
          {(isHovered || selected) && (
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
            stroke={isHovered || selected ? fill : OFFSET_TEXT_COLOR}
            strokeWidth={1} // Assuming the regular line is thinner
          />
        </>
      )}
    </>
  )
}
