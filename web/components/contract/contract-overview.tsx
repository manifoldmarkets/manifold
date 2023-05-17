import { memo, useState } from 'react'

import { tradingAllowed } from 'web/lib/firebase/contracts'
import {
  BinaryContractChart,
  ChoiceContractChart,
  NumericContractChart,
  PseudoNumericContractChart,
} from 'web/components/charts/contract'
import { useSingleValueHistoryChartViewScale } from 'web/components/charts/generic-charts'
import { useUser } from 'web/hooks/use-user'
import { Row } from '../layout/row'
import { Bet } from 'common/bet'
import { SignedInBinaryMobileBetting } from '../bet/bet-button'
import {
  Contract,
  FreeResponseContract,
  MultipleChoiceContract,
  NumericContract,
  PseudoNumericContract,
  BinaryContract,
  CPMMStonkContract,
} from 'common/contract'
import { SizedContainer } from 'web/components/sized-container'
import { CertOverview } from './cert-overview'
import { TimeRangePicker } from '../charts/time-range-picker'
import { Period } from 'web/lib/firebase/users'
import { useEvent } from 'web/hooks/use-event'
import { periodDurations } from 'web/lib/util/time'
import { getDateRange } from '../charts/helpers'
import { QfOverview } from './qf-overview'
import { StonkContractChart } from '../charts/contract/stonk'
import { YES_GRAPH_COLOR } from 'common/envs/constants'
import {
  BinaryResolutionOrChance,
  FreeResponseResolution,
  OldNumericResolution,
  PseudoNumericResolutionOrExpectation,
  StonkPrice,
} from 'web/components/contract/contract-price'
import { HistoryPoint } from 'common/chart'

export const ContractOverview = memo(
  (props: {
    contract: Contract
    bets: Bet[]
    betPoints: HistoryPoint<Partial<Bet>>[]
  }) => {
    const { betPoints, contract } = props

    switch (contract.outcomeType) {
      case 'BINARY':
        return <BinaryOverview betPoints={betPoints} contract={contract} />
      case 'NUMERIC':
        return <OldNumericOverview contract={contract} />
      case 'PSEUDO_NUMERIC':
        return (
          <PseudoNumericOverview contract={contract} betPoints={betPoints} />
        )
      case 'CERT':
        return <CertOverview contract={contract} />
      case 'QUADRATIC_FUNDING':
        return <QfOverview contract={contract} />
      case 'FREE_RESPONSE':
      case 'MULTIPLE_CHOICE':
        return <></>
      // return <ChoiceOverview contract={contract} bets={bets} />
      case 'STONK':
        return <StonkOverview contract={contract} betPoints={betPoints} />
    }
  }
)

const OldNumericOverview = (props: { contract: NumericContract }) => {
  const { contract } = props
  return (
    <>
      <OldNumericResolution contract={contract} />
      <SizedContainer fullHeight={250} mobileHeight={150}>
        {(w, h) => (
          <NumericContractChart width={w} height={h} contract={contract} />
        )}
      </SizedContainer>
    </>
  )
}

const BinaryOverview = (props: {
  contract: BinaryContract
  betPoints: HistoryPoint<Partial<Bet>>[]
}) => {
  const { contract, betPoints } = props
  const user = useUser()

  const { viewScale, currentTimePeriod, setTimePeriod, start, maxRange } =
    useTimePicker(contract)

  return (
    <>
      <Row className="items-end justify-between gap-4">
        <BinaryResolutionOrChance contract={contract} />
        <TimeRangePicker
          currentTimePeriod={currentTimePeriod}
          setCurrentTimePeriod={setTimePeriod}
          maxRange={maxRange}
          color="green"
        />
      </Row>
      <SizedContainer fullHeight={250} mobileHeight={150}>
        {(w, h) => (
          <BinaryContractChart
            width={w}
            height={h}
            betPoints={betPoints}
            viewScaleProps={viewScale}
            controlledStart={start}
            contract={contract}
          />
        )}
      </SizedContainer>

      {user && tradingAllowed(contract) && (
        <SignedInBinaryMobileBetting contract={contract} user={user} />
      )}
    </>
  )
}

const ChoiceOverview = (props: {
  contract: FreeResponseContract | MultipleChoiceContract
  bets: Bet[]
}) => {
  const { contract, bets } = props

  return (
    <>
      <FreeResponseResolution contract={contract} />
      <SizedContainer fullHeight={350} mobileHeight={250}>
        {(w, h) => (
          <ChoiceContractChart
            width={w}
            height={h}
            bets={bets}
            contract={contract}
          />
        )}
      </SizedContainer>
    </>
  )
}

const PseudoNumericOverview = (props: {
  contract: PseudoNumericContract
  betPoints: HistoryPoint<Partial<Bet>>[]
}) => {
  const { contract, betPoints } = props
  const { viewScale, currentTimePeriod, setTimePeriod, start, maxRange } =
    useTimePicker(contract)
  const user = useUser()

  return (
    <>
      <Row className="items-end justify-between gap-4">
        <PseudoNumericResolutionOrExpectation contract={contract} />
        <TimeRangePicker
          currentTimePeriod={currentTimePeriod}
          setCurrentTimePeriod={setTimePeriod}
          maxRange={maxRange}
          color="indigo"
        />
      </Row>
      <SizedContainer fullHeight={250} mobileHeight={150}>
        {(w, h) => (
          <PseudoNumericContractChart
            width={w}
            height={h}
            betPoints={betPoints}
            viewScaleProps={viewScale}
            controlledStart={start}
            contract={contract}
          />
        )}
      </SizedContainer>

      {user && tradingAllowed(contract) && (
        <SignedInBinaryMobileBetting contract={contract} user={user} />
      )}
    </>
  )
}
const StonkOverview = (props: {
  contract: CPMMStonkContract
  betPoints: HistoryPoint<Partial<Bet>>[]
}) => {
  const { contract, betPoints } = props
  const { viewScale, currentTimePeriod, setTimePeriod, start, maxRange } =
    useTimePicker(contract)
  const user = useUser()

  return (
    <>
      <Row className="items-end justify-between gap-4">
        <StonkPrice contract={contract} />
        <TimeRangePicker
          currentTimePeriod={currentTimePeriod}
          setCurrentTimePeriod={setTimePeriod}
          maxRange={maxRange}
          color="green"
        />
      </Row>
      <SizedContainer fullHeight={250} mobileHeight={150}>
        {(w, h) => (
          <StonkContractChart
            width={w}
            height={h}
            betPoints={betPoints}
            viewScaleProps={viewScale}
            controlledStart={start}
            contract={contract}
            color={YES_GRAPH_COLOR}
          />
        )}
      </SizedContainer>

      {user && tradingAllowed(contract) && (
        <SignedInBinaryMobileBetting contract={contract} user={user} />
      )}
    </>
  )
}

export const useTimePicker = (contract: Contract) => {
  const viewScale = useSingleValueHistoryChartViewScale()
  const [currentTimePeriod, setCurrentTimePeriod] = useState<Period>('allTime')

  //zooms out of graph if zoomed in upon time selection change
  const setTimePeriod = useEvent((timePeriod: Period) => {
    setCurrentTimePeriod(timePeriod)
    viewScale.setViewXScale(undefined)
    viewScale.setViewYScale(undefined)
  })

  const [, endRange] = getDateRange(contract)
  const end = endRange ?? Date.now()
  const start =
    currentTimePeriod === 'allTime'
      ? undefined
      : end - periodDurations[currentTimePeriod]
  const maxRange = end - contract.createdTime

  return { viewScale, currentTimePeriod, setTimePeriod, start, maxRange }
}
