import { tradingAllowed } from 'web/lib/firebase/contracts'
import { Col } from '../layout/col'
import { ContractChart } from 'web/components/charts/contract'
import { useUser } from 'web/hooks/use-user'
import { Row } from '../layout/row'
import { Linkify } from '../linkify'
import {
  BinaryResolutionOrChance,
  FreeResponseResolutionOrChance,
  NumericResolutionOrExpectation,
  PseudoNumericResolutionOrExpectation,
} from './contract-card'
import { Bet } from 'common/bet'
import BetButton, { BinaryMobileBetting } from '../bet-button'
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
import { SizedContainer } from 'web/components/sized-container'

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
}) => {
  const { fullHeight, mobileHeight, contract, bets } = props
  return (
    <SizedContainer fullHeight={fullHeight} mobileHeight={mobileHeight}>
      {(width, height) => (
        <ContractChart
          width={width}
          height={height}
          contract={contract}
          bets={bets}
        />
      )}
    </SizedContainer>
  )
}

const NumericOverview = (props: { contract: NumericContract; bets: Bet[] }) => {
  const { contract, bets } = props
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
      />
    </Col>
  )
}

const BinaryOverview = (props: { contract: BinaryContract; bets: Bet[] }) => {
  const { contract, bets } = props
  return (
    <Col className="gap-1 md:gap-2">
      <Col className="gap-1 px-2">
        <ContractDetails contract={contract} />
        <Row className="justify-between gap-4">
          <OverviewQuestion text={contract.question} />
          <BinaryResolutionOrChance
            className="flex items-end"
            contract={contract}
            large
          />
        </Row>
      </Col>
      <SizedContractChart
        contract={contract}
        bets={bets}
        fullHeight={250}
        mobileHeight={150}
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
}) => {
  const { contract, bets } = props
  const { question, resolution } = contract
  return (
    <Col className="gap-1 md:gap-2">
      <Col className="gap-3 px-2 sm:gap-4">
        <ContractDetails contract={contract} />
        <OverviewQuestion text={question} />
        {resolution && (
          <FreeResponseResolutionOrChance contract={contract} truncate="none" />
        )}
      </Col>
      <SizedContractChart
        contract={contract}
        bets={bets}
        fullHeight={350}
        mobileHeight={250}
      />
    </Col>
  )
}

const PseudoNumericOverview = (props: {
  contract: PseudoNumericContract
  bets: Bet[]
}) => {
  const { contract, bets } = props
  return (
    <Col className="gap-1 md:gap-2">
      <Col className="gap-3 px-2 sm:gap-4">
        <ContractDetails contract={contract} />
        <Row className="justify-between gap-4">
          <OverviewQuestion text={contract.question} />
          <PseudoNumericResolutionOrExpectation
            contract={contract}
            className="hidden items-end xl:flex"
          />
        </Row>
        <Row className="items-center justify-between gap-4 xl:hidden">
          <PseudoNumericResolutionOrExpectation contract={contract} />
          {tradingAllowed(contract) && <BetWidget contract={contract} />}
        </Row>
      </Col>
      <SizedContractChart
        contract={contract}
        bets={bets}
        fullHeight={250}
        mobileHeight={150}
      />
    </Col>
  )
}

export const ContractOverview = (props: {
  contract: Contract
  bets: Bet[]
}) => {
  const { contract, bets } = props
  switch (contract.outcomeType) {
    case 'BINARY':
      return <BinaryOverview contract={contract} bets={bets} />
    case 'NUMERIC':
      return <NumericOverview contract={contract} bets={bets} />
    case 'PSEUDO_NUMERIC':
      return <PseudoNumericOverview contract={contract} bets={bets} />
    case 'FREE_RESPONSE':
    case 'MULTIPLE_CHOICE':
      return <ChoiceOverview contract={contract} bets={bets} />
  }
}
