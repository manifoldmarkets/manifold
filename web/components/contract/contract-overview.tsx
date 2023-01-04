import { memo } from 'react'
import { tradingAllowed } from 'web/lib/firebase/contracts'
import { Col } from '../layout/col'
import {
  BinaryContractChart,
  ChoiceContractChart,
  NumericContractChart,
  PseudoNumericContractChart,
} from 'web/components/charts/contract'
import { HistoryPoint } from 'web/components/charts/generic-charts'
import { useUser } from 'web/hooks/use-user'
import { Row } from '../layout/row'
import { Linkify } from '../widgets/linkify'
import {
  BinaryResolutionOrChance,
  FreeResponseResolutionOrChance,
  NumericResolutionOrExpectation,
  PseudoNumericResolutionOrExpectation,
} from './contract-card'
import { Bet } from 'common/bet'
import BetButton, { BinaryMobileBetting } from '../bet/bet-button'
import {
  Contract,
  CPMMContract,
  FreeResponseContract,
  MultipleChoiceContract,
  NumericContract,
  PseudoNumericContract,
  BinaryContract,
} from 'common/contract'
import { ContractDetails } from './contract-details'
import { ContractReportResolution } from './contract-report-resolution'
import { SizedContainer } from 'web/components/sized-container'
import { CertOverview } from './cert-overview'

const OverviewQuestion = (props: { text: string }) => (
  <Linkify className="text-lg text-indigo-700 sm:text-2xl" text={props.text} />
)

const BetWidget = (props: { contract: CPMMContract }) => {
  const user = useUser()
  return (
    <Col>
      <BetButton contract={props.contract} />
      {!user && (
        <div className="mt-1 text-center text-sm text-gray-500">
          (with play money!)
        </div>
      )}
    </Col>
  )
}

const NumericOverview = (props: { contract: NumericContract }) => {
  const { contract } = props
  return (
    <Col className="gap-1 md:gap-2">
      <Col className="gap-3 px-2 sm:gap-4">
        <ContractDetails contract={contract} />
        <Row className="justify-between gap-4">
          <OverviewQuestion text={contract.question} />
          <NumericResolutionOrExpectation
            contract={contract}
            className="hidden items-end xl:flex"
          />
        </Row>
        <NumericResolutionOrExpectation
          className="items-center justify-between gap-4 xl:hidden"
          contract={contract}
        />
      </Col>
      <SizedContainer fullHeight={250} mobileHeight={150}>
        {(w, h) => (
          <NumericContractChart width={w} height={h} contract={contract} />
        )}
      </SizedContainer>
    </Col>
  )
}

const BinaryOverview = (props: {
  contract: BinaryContract
  betPoints: HistoryPoint<Partial<Bet>>[]
}) => {
  const { contract, betPoints } = props
  return (
    <Col className="gap-1 md:gap-2">
      <Col className="gap-1 px-2">
        <ContractDetails contract={contract} />
        <Row className="justify-between gap-4">
          <OverviewQuestion text={contract.question} />
          <Row className={'items-center'}>
            <BinaryResolutionOrChance
              className="flex items-end"
              contract={contract}
              large
            />
            <ContractReportResolution contract={contract} />
          </Row>
        </Row>
      </Col>
      <SizedContainer fullHeight={250} mobileHeight={150}>
        {(w, h) => (
          <BinaryContractChart
            width={w}
            height={h}
            betPoints={betPoints}
            contract={contract}
          />
        )}
      </SizedContainer>
      <Row className="items-center justify-between gap-4 xl:hidden">
        {tradingAllowed(contract) && (
          <BinaryMobileBetting contract={contract} />
        )}
      </Row>
    </Col>
  )
}

const ChoiceOverview = (props: {
  contract: FreeResponseContract | MultipleChoiceContract
  bets: Bet[]
}) => {
  const { contract, bets } = props
  const { question, resolution, slug } = contract

  // TODO(James): Remove hideGraph once market is resolved.
  const hideGraph = slug === 'which-team-will-win-the-2022-fifa-w'

  return (
    <Col className="gap-1 md:gap-2">
      <Col className="gap-3 px-2 sm:gap-4">
        <ContractDetails contract={contract} />
        <OverviewQuestion text={question} />
        {resolution && (
          <Row>
            <FreeResponseResolutionOrChance
              contract={contract}
              truncate="none"
            />
            <ContractReportResolution contract={contract} />
          </Row>
        )}
      </Col>
      {!hideGraph && (
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
      )}
    </Col>
  )
}

const PseudoNumericOverview = (props: {
  contract: PseudoNumericContract
  betPoints: HistoryPoint<Partial<Bet>>[]
}) => {
  const { contract, betPoints } = props
  return (
    <Col className="gap-1 md:gap-2">
      <Col className="gap-3 px-2 sm:gap-4">
        <ContractDetails contract={contract} />
        <Row className="items-center justify-between gap-4">
          <OverviewQuestion text={contract.question} />
          <PseudoNumericResolutionOrExpectation
            contract={contract}
            className="hidden items-end xl:flex"
          />
          <div className="hidden items-end xl:flex">
            <ContractReportResolution contract={contract} />
          </div>
        </Row>
        <Row className="items-center justify-between gap-4 xl:hidden">
          <Row className={'items-center gap-2'}>
            <PseudoNumericResolutionOrExpectation contract={contract} />
            <ContractReportResolution contract={contract} />
          </Row>
          {tradingAllowed(contract) && <BetWidget contract={contract} />}
        </Row>
      </Col>
      <SizedContainer fullHeight={250} mobileHeight={150}>
        {(w, h) => (
          <PseudoNumericContractChart
            width={w}
            height={h}
            betPoints={betPoints}
            contract={contract}
          />
        )}
      </SizedContainer>
    </Col>
  )
}

export const ContractOverview = memo(
  (props: {
    contract: Contract
    bets: Bet[]
    betPoints: HistoryPoint<Partial<Bet>>[]
  }) => {
    const { betPoints, contract, bets } = props
    switch (contract.outcomeType) {
      case 'BINARY':
        return <BinaryOverview betPoints={betPoints} contract={contract} />
      case 'NUMERIC':
        return <NumericOverview contract={contract} />
      case 'PSEUDO_NUMERIC':
        return (
          <PseudoNumericOverview contract={contract} betPoints={betPoints} />
        )
      case 'CERT':
        return <CertOverview contract={contract} />
      case 'FREE_RESPONSE':
      case 'MULTIPLE_CHOICE':
        return <ChoiceOverview contract={contract} bets={bets} />
    }
  }
)
