import clsx from 'clsx'
import { ReactNode, useEffect, useState } from 'react'

import { Answer, MultiSort, getDefaultSort } from 'common/answer'
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

  const defaultSort = getDefaultSort(contract)
  const [sort, setSort] = usePersistentInMemoryState<MultiSort>(
    defaultSort,
    'answer-sort' + contract.id
  )
  const [hoverAnswerId, setHoverAnswerId] = useState<string>()
  const [showSetDefaultSort, setShowSetDefaultSort] = useState(false)
  const [defaultAnswerIdsToGraph, setDefaultAnswerIdsToGraph] = useState<
    string[]
  >([])

  useEffect(() => {
    if (
      ((contract.sort && sort !== contract.sort) ||
        (!contract.sort && sort !== defaultSort)) &&
      currentUserId &&
      (isModId(currentUserId) ||
        isAdminId(currentUserId) ||
        contract.creatorId === currentUserId)
    )
      setShowSetDefaultSort(true)
  }, [sort, contract.sort])

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

  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className={MODAL_CLASS}>
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
                  highlightAnswerId={hoverAnswerId}
                  selectedAnswerIds={
                    selectedAnswerIds.length
                      ? selectedAnswerIds
                      : defaultAnswerIdsToGraph
                  }
                  pointerMode={pointerMode}
                  setHoveredAnnotation={setHoveredAnnotation}
                  hoveredAnnotation={hoveredAnnotation}
                  chartAnnotations={chartAnnotations}
                  chartPositions={chartPositions?.filter((cp) =>
                    hoverAnswerId
                      ? cp.answerId === hoverAnswerId
                      : selectedAnswerIds.length === 0 ||
                        (cp.answerId && selectedAnswerIds.includes(cp.answerId))
                  )}
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
