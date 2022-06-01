import { tradingAllowed } from 'web/lib/firebase/contracts'
import { Col } from '../layout/col'
import { Spacer } from '../layout/spacer'
import { ContractProbGraph } from './contract-prob-graph'
import { useUser } from 'web/hooks/use-user'
import { Row } from '../layout/row'
import { Linkify } from '../linkify'
import clsx from 'clsx'

import {
  FreeResponseResolutionOrChance,
  BinaryResolutionOrChance,
  NumericResolutionOrExpectation,
} from './contract-card'
import { Bet } from 'common/bet'
import { Comment } from 'common/comment'
import BetRow from '../bet-row'
import { AnswersGraph } from '../answers/answers-graph'
import { Contract } from 'common/contract'
import { ContractDescription } from './contract-description'
import { ContractDetails } from './contract-details'
import { ShareMarket } from '../share-market'
import { NumericGraph } from './numeric-graph'

export const ContractOverview = (props: {
  contract: Contract
  bets: Bet[]
  comments: Comment[]
  className?: string
}) => {
  const { contract, bets, className } = props
  const { question, creatorId, outcomeType, resolution } = contract

  const user = useUser()
  const isCreator = user?.id === creatorId
  const isBinary = outcomeType === 'BINARY'

  return (
    <Col className={clsx('mb-6', className)}>
      <Col className="gap-4 px-2">
        <Row className="justify-between gap-4">
          <div className="text-2xl text-indigo-700 md:text-3xl">
            <Linkify text={question} />
          </div>

          {isBinary && (
            <BinaryResolutionOrChance
              className="hidden items-end xl:flex"
              contract={contract}
              large
            />
          )}

          {outcomeType === 'NUMERIC' && (
            <NumericResolutionOrExpectation
              contract={contract}
              className="hidden items-end xl:flex"
            />
          )}
        </Row>

        {isBinary ? (
          <Row className="items-center justify-between gap-4 xl:hidden">
            <BinaryResolutionOrChance contract={contract} />

            {tradingAllowed(contract) && <BetRow contract={contract} />}
          </Row>
        ) : (
          outcomeType === 'FREE_RESPONSE' &&
          resolution && (
            <FreeResponseResolutionOrChance
              contract={contract}
              truncate="none"
            />
          )
        )}

        {outcomeType === 'NUMERIC' && (
          <Row className="items-center justify-between gap-4 xl:hidden">
            <NumericResolutionOrExpectation contract={contract} />
          </Row>
        )}

        <ContractDetails
          contract={contract}
          bets={bets}
          isCreator={isCreator}
        />
      </Col>
      <Spacer h={4} />
      {isBinary && <ContractProbGraph contract={contract} bets={bets} />}{' '}
      {outcomeType === 'FREE_RESPONSE' && (
        <AnswersGraph contract={contract} bets={bets} />
      )}
      {outcomeType === 'NUMERIC' && <NumericGraph contract={contract} />}
      {(contract.description || isCreator) && <Spacer h={6} />}
      {isCreator && <ShareMarket className="px-2" contract={contract} />}
      <ContractDescription
        className="px-2"
        contract={contract}
        isCreator={isCreator}
      />
    </Col>
  )
}
