import clsx from 'clsx'
import { ClickHandler, SELECTED_OUTLINE_COLOR } from './usa-map'
import { StateDataType } from './usa-map-data'
import { MouseEventHandler, useState } from 'react'
import { MultiContract } from 'common/contract'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { useAnswersCpmm } from 'web/hooks/use-answers'
import { probToColor } from './state-election-map'

type TextCoordinates = { x: number; y: number }

export const OFFSET_TEXT_COLOR = '#bd9e9f'

export function USAState(props: {
  state: string
  stateData: StateDataType
  stateContract: MultiContract
  onClickState?: ClickHandler
  onMouseEnterState?: () => void | undefined
  onMouseLeaveState?: () => void | undefined
  hideStateTitle?: boolean
  selected?: boolean
}) {
  const {
    state,
    stateData,
    stateContract,
    onClickState,
    onMouseEnterState,
    onMouseLeaveState,
    hideStateTitle,
    selected,
  } = props

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

  const contract =
    (useFirebasePublicContract(
      stateContract.visibility,
      stateContract.id
    ) as MultiContract) ?? stateContract

  if (contract.mechanism === 'cpmm-multi-1') {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const answers = useAnswersCpmm(contract.id)
    if (answers) {
      contract.answers = answers
    }
  }
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

  const textColor = !!line ? (isHovered ? fill : OFFSET_TEXT_COLOR) : '#FFF'

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
            stroke={isHovered ? fill : OFFSET_TEXT_COLOR}
            strokeWidth={1} // Assuming the regular line is thinner
          />
        </>
      )}
    </>
  )
}
