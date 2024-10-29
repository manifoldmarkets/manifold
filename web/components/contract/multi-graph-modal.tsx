import clsx from 'clsx'
import { ReactNode, useEffect, useState } from 'react'

import { Answer, MultiSort, getDefaultSort, sortAnswers } from 'common/answer'
import { MultiPoints } from 'common/chart'
import { MultiContract } from 'common/contract'
import { isAdminId, isModId } from 'common/envs/constants'
import { type ChartAnnotation } from 'common/supabase/chart-annotations'
import { filterDefined } from 'common/util/array'
import { UserPositionSearchButton } from 'web/components/charts/user-position-search-button'
import { SizedContainer } from 'web/components/sized-container'
import { useAnnotateChartTools } from 'web/hooks/use-chart-annotations'
import { useChartPositions } from 'web/hooks/use-chart-positions'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { useUser } from 'web/hooks/use-user'
import {
  ChartAnnotations,
  EditChartAnnotationsButton,
} from '../charts/chart-annotations'
import { ChoiceContractChart } from '../charts/contract/choice'
import { TimeRangePicker } from '../charts/time-range-picker'
import { Row } from '../layout/row'
import { getShouldHideGraph, useTimePicker } from './contract-overview'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { Col } from '../layout/col'
import { SimpleAnswerBars } from '../answers/answers-panel'

export const MultiGraphModal = (props: {
  open: boolean
  setOpen: (open: boolean) => void
  points: MultiPoints
  contract: MultiContract
  chartAnnotations: ChartAnnotation[]
  zoomY?: boolean
  selectedAnswerIds: string[]
  setSelectedAnswerIds: (selectedAnswerIds: string[]) => void
}) => {
  const {
    points,
    contract,
    zoomY,
    open,
    setOpen,
    selectedAnswerIds,
    setSelectedAnswerIds,
  } = props

  const currentUser = useUser()
  const currentUserId = currentUser?.id
  const [showZoomer, setShowZoomer] = useState(false)
  const { currentTimePeriod, setTimePeriod, maxRange, zoomParams } =
    useTimePicker(contract, () => setShowZoomer(true))

  const {
    pointerMode,
    setPointerMode,
    hoveredAnnotation,
    setHoveredAnnotation,
    chartAnnotations,
    enableAdd,
  } = useAnnotateChartTools(contract, props.chartAnnotations)
  const {
    chartPositions,
    setHoveredChartPosition,
    hoveredChartPosition,
    displayUser,
    setDisplayUser,
  } = useChartPositions(contract)
  const contractPositionAnswerIds = chartPositions.map((cp) => cp.answerId)
  useEffect(() => {
    setSelectedAnswerIds(filterDefined(contractPositionAnswerIds))
  }, [JSON.stringify(contractPositionAnswerIds)])

  const primaryAnswerId = selectedAnswerIds[0]
  const primaryAnswer = contract.answers.find((a) => a.id === primaryAnswerId)
  console.log('primaryAnswer', primaryAnswer, primaryAnswerId)

  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className={MODAL_CLASS}>
        <div className="text-lg font-semibold">{primaryAnswer?.text}</div>
        <Row className="relative w-full justify-end gap-2">
          <Row className={'relative gap-1'}>
            <UserPositionSearchButton
              currentUser={currentUser}
              displayUser={displayUser}
              contract={contract}
              setDisplayUser={setDisplayUser}
            />
            {enableAdd && (
              <EditChartAnnotationsButton
                pointerMode={pointerMode}
                setPointerMode={setPointerMode}
              />
            )}
            <TimeRangePicker
              currentTimePeriod={currentTimePeriod}
              setCurrentTimePeriod={setTimePeriod}
              maxRange={maxRange}
              color="indigo"
            />
          </Row>
        </Row>

        {!!Object.keys(points).length &&
          contract.mechanism == 'cpmm-multi-1' && (
            <SizedContainer
              className={clsx(
                'h-[150px] w-full pb-4 pr-10 sm:h-[250px]',
                showZoomer && 'mb-12'
              )}
            >
              {(w, h) => (
                <ChoiceContractChart
                  showZoomer={showZoomer}
                  zoomParams={zoomParams}
                  width={w}
                  height={h}
                  multiPoints={points}
                  contract={contract}
                  selectedAnswerIds={
                    selectedAnswerIds.length ? selectedAnswerIds : []
                  }
                  pointerMode={pointerMode}
                  setHoveredAnnotation={setHoveredAnnotation}
                  hoveredAnnotation={hoveredAnnotation}
                  chartAnnotations={chartAnnotations}
                  hoveredChartPosition={hoveredChartPosition}
                  setHoveredChartPosition={setHoveredChartPosition}
                  zoomY={zoomY}
                />
              )}
            </SizedContainer>
          )}
        {chartAnnotations?.length ? (
          <ChartAnnotations
            annotations={chartAnnotations}
            hoveredAnnotation={hoveredAnnotation}
            setHoveredAnnotation={setHoveredAnnotation}
          />
        ) : null}
      </Col>
    </Modal>
  )
}
