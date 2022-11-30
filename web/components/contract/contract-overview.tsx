import { tradingAllowed } from 'web/lib/firebase/contracts'
import { Col } from '../layout/col'
import { ContractChart } from 'web/components/charts/contract'
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
import { BetPoint } from 'web/pages/[username]/[contractSlug]'

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

const SizedContractChart = (props: {
  contract: Contract
  bets: Bet[]
  fullHeight: number
  mobileHeight: number
  betPoints: BetPoint[]
}) => {
  const { fullHeight, betPoints, mobileHeight, contract, bets } = props
  return (
    <SizedContainer fullHeight={fullHeight} mobileHeight={mobileHeight}>
      {(width, height) => (
        <ContractChart
          width={width}
          height={height}
          contract={contract}
          bets={bets}
          betPoints={betPoints}
        />
      )}
    </SizedContainer>
  )
}

const NumericOverview = (props: {
  contract: NumericContract
  bets: Bet[]
  betPoints: BetPoint[]
}) => {
  const { contract, bets, betPoints } = props
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
      <SizedContractChart
        contract={contract}
        bets={bets}
        fullHeight={250}
        mobileHeight={150}
        betPoints={betPoints}
      />
    </Col>
  )
}

const BinaryOverview = (props: {
  contract: BinaryContract
  bets: Bet[]
  betPoints: BetPoint[]
}) => {
  const { contract, bets, betPoints } = props
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
      <SizedContractChart
        contract={contract}
        bets={bets}
        fullHeight={250}
        mobileHeight={150}
        betPoints={betPoints}
      />
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
  betPoints: BetPoint[]
}) => {
  const { contract, bets, betPoints } = props
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
        <SizedContractChart
          contract={contract}
          bets={bets}
          fullHeight={350}
          mobileHeight={250}
          betPoints={betPoints}
        />
      )}
    </Col>
  )
}

const PseudoNumericOverview = (props: {
  contract: PseudoNumericContract
  bets: Bet[]
  betPoints: BetPoint[]
}) => {
  const { contract, bets, betPoints } = props
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
      <SizedContractChart
        contract={contract}
        bets={bets}
        fullHeight={250}
        mobileHeight={150}
        betPoints={betPoints}
      />
    </Col>
  )
}

export const ContractOverview = (props: {
  contract: Contract
  bets: Bet[]
  betPoints: BetPoint[]
}) => {
  const { betPoints, contract, bets } = props
  switch (contract.outcomeType) {
    case 'BINARY':
      return (
        <BinaryOverview betPoints={betPoints} contract={contract} bets={bets} />
      )
    case 'NUMERIC':
      return (
        <NumericOverview
          contract={contract}
          bets={bets}
          betPoints={betPoints}
        />
      )
    case 'PSEUDO_NUMERIC':
      return (
        <PseudoNumericOverview
          contract={contract}
          bets={bets}
          betPoints={betPoints}
        />
      )
    case 'FREE_RESPONSE':
    case 'MULTIPLE_CHOICE':
      return (
        <ChoiceOverview contract={contract} bets={bets} betPoints={betPoints} />
      )
  }
}
