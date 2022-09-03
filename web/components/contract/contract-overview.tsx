import React from 'react'

import { tradingAllowed } from 'web/lib/firebase/contracts'
import { Col } from '../layout/col'
import { ContractProbGraph } from './contract-prob-graph'
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
import BetButton from '../bet-button'
import { AnswersGraph } from '../answers/answers-graph'
import {
  Contract,
  BinaryContract,
  CPMMContract,
  CPMMBinaryContract,
  FreeResponseContract,
  MultipleChoiceContract,
  NumericContract,
  PseudoNumericContract,
} from 'common/contract'
import { ContractDetails, ExtraMobileContractDetails } from './contract-details'
import { NumericGraph } from './numeric-graph'

const OverviewQuestion = (props: { text: string }) => (
  <Linkify className="text-2xl text-indigo-700 md:text-3xl" text={props.text} />
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
      <NumericGraph contract={contract} />
    </Col>
  )
}

const BinaryOverview = (props: { contract: BinaryContract; bets: Bet[] }) => {
  const { contract, bets } = props
  return (
    <Col className="gap-1 md:gap-2">
      <Col className="gap-3 px-2 sm:gap-4">
        <ContractDetails contract={contract} />
        <Row className="justify-between gap-4">
          <OverviewQuestion text={contract.question} />
          <BinaryResolutionOrChance
            className="hidden items-end xl:flex"
            contract={contract}
            large
          />
        </Row>
        <Row className="items-center justify-between gap-4 xl:hidden">
          <BinaryResolutionOrChance contract={contract} />
          <ExtraMobileContractDetails contract={contract} />
          {tradingAllowed(contract) && (
            <BetWidget contract={contract as CPMMBinaryContract} />
          )}
        </Row>
      </Col>
      <ContractProbGraph contract={contract} bets={[...bets].reverse()} />
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
      <Col className={'mb-1 gap-y-2'}>
        <AnswersGraph contract={contract} bets={[...bets].reverse()} />
        <ExtraMobileContractDetails
          contract={contract}
          forceShowVolume={true}
        />
      </Col>
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
          <ExtraMobileContractDetails contract={contract} />
          {tradingAllowed(contract) && <BetWidget contract={contract} />}
        </Row>
      </Col>
      <ContractProbGraph contract={contract} bets={[...bets].reverse()} />
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
      return <NumericOverview contract={contract} />
    case 'PSEUDO_NUMERIC':
      return <PseudoNumericOverview contract={contract} bets={bets} />
    case 'FREE_RESPONSE':
    case 'MULTIPLE_CHOICE':
      return <ChoiceOverview contract={contract} bets={bets} />
  }
}
