import { Row } from 'web/components/layout/row'
import { DEM_DARK_HEX, REP_DARK_HEX, probToColor } from './state-election-map'
import { Col } from 'web/components/layout/col'
import { ChevronDownIcon } from '@heroicons/react/solid'
import { HIGHLIGHTED_OUTLINE_COLOR, SELECTED_OUTLINE_COLOR } from './usa-map'
import clsx from 'clsx'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { currentSenate } from 'web/public/data/senate-state-data'
import { partition } from 'lodash'
import { sortByDemocraticDiff } from './electoral-college-visual'
import { MapContractsDictionary } from 'web/public/data/elections-data'
import { Answer, sortAnswers } from 'common/answer'
import { useMemo } from 'react'
import { CPMMMultiContract } from 'common/contract'
import { StateBar } from './senate-bar'
import { houseProbToColor } from './house-table-helpers'

export function HouseBar(props: {
  liveAnswers: Answer[]
  liveHouseContract: CPMMMultiContract
  handleClick: (newTargetAnswer: string | undefined) => void
  onMouseEnter: (hoverState: string) => void
  onMouseLeave: () => void
  targetAnswer: string | null | undefined
  hoveredAnswer: string | null | undefined
}) {
  const {
    liveAnswers,
    liveHouseContract,
    handleClick,
    onMouseEnter,
    onMouseLeave,
    targetAnswer,
    hoveredAnswer,
  } = props

  const sortedAnswers = useMemo(
    () => sortAnswers(liveHouseContract, liveAnswers, 'prob-asc'),
    [liveAnswers]
  )
  const isMobile = useIsMobile()
  const [republicans, democrats] = partition(
    currentSenate,
    ({ party1 }) => party1 === 'Republican'
  )

  const sureDemocratic = 173
  const sureRepublican = 193
  const totalSeats = 438
  const edgesSubtracted = 170
  const democraticPortion = sureDemocratic - edgesSubtracted
  const republicanPortion = sureRepublican - edgesSubtracted
  const seatPortion = totalSeats - edgesSubtracted * 2
  return (
    <Col className="mb-8 mt-2 w-full text-xs sm:text-base">
      <Col className="text-ink-700 mx-auto items-center">
        <div className="-mb-1 ">Majority</div>
        <ChevronDownIcon className="h-5 w-5" />
      </Col>
      <Row className="overflow-none relative gap-[1px] rounded sm:gap-0.5">
        <StateBar
          key={'DEM'}
          handleClick={() => {}}
          onMouseEnter={() => {
            onMouseEnter('Likely DEM - 170 seats')
          }}
          onMouseLeave={onMouseLeave}
          targetState={targetAnswer}
          hoveredState={hoveredAnswer}
          state={'Likely DEM - 170 seats'}
          width={`${(democraticPortion / seatPortion) * 100}%`}
          fill={DEM_DARK_HEX}
          isMobile={isMobile}
        />
        {sortedAnswers.map((answer, index) => {
          const fill = houseProbToColor(answer.prob) ?? ''
          return (
            <StateBar
              key={answer.id}
              handleClick={handleClick}
              onMouseEnter={onMouseEnter}
              onMouseLeave={onMouseLeave}
              targetState={targetAnswer}
              hoveredState={hoveredAnswer}
              state={answer.text}
              displayState={(state) => state.slice(0, 5)}
              fill={fill}
              width={`${(1 / seatPortion) * 100}%`}
              isMobile={isMobile}
            />
          )
        })}

        <StateBar
          key={'REP'}
          handleClick={() => {}}
          onMouseEnter={() => {
            onMouseEnter('Likely REP - 193 seats')
          }}
          onMouseLeave={onMouseLeave}
          targetState={targetAnswer}
          hoveredState={hoveredAnswer}
          state={'Likely REP - 193 seats'}
          fill={REP_DARK_HEX}
          width={`${(republicanPortion / seatPortion) * 100}%`}
          isMobile={isMobile}
        />
      </Row>
    </Col>
  )
}
