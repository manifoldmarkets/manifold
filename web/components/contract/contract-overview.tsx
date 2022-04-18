import { Contract, tradingAllowed } from '../../lib/firebase/contracts'
import { Col } from '../layout/col'
import { Spacer } from '../layout/spacer'
import { ContractProbGraph } from './contract-prob-graph'
import { useUser } from '../../hooks/use-user'
import { Row } from '../layout/row'
import { Linkify } from '../linkify'
import clsx from 'clsx'
import {
  FreeResponseResolution,
  ContractDetails,
  BinaryResolutionOrChance,
} from './contract-card'
import { Bet } from '../../../common/bet'
import { Comment } from '../../../common/comment'
import BetRow from '../bet-row'
import { AnswersGraph } from '../answers/answers-graph'
import { DPM, FreeResponse, FullContract } from '../../../common/contract'
import { ContractDescription } from './contract-description'

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
        </Row>

        {isBinary ? (
          <Row className="items-center justify-between gap-4 xl:hidden">
            <BinaryResolutionOrChance contract={contract} />

            {tradingAllowed(contract) && (
              <BetRow contract={contract} labelClassName="hidden" />
            )}
          </Row>
        ) : (
          outcomeType === 'FREE_RESPONSE' &&
          resolution && (
            <FreeResponseResolution
              contract={contract}
              resolution={resolution}
              truncate="none"
            />
          )
        )}

        <ContractDetails
          contract={contract}
          bets={bets}
          isCreator={isCreator}
        />
      </Col>

      <Spacer h={4} />

      {isBinary ? (
        <ContractProbGraph contract={contract} bets={bets} />
      ) : (
        <AnswersGraph
          contract={contract as FullContract<DPM, FreeResponse>}
          bets={bets}
        />
      )}

      {contract.description && <Spacer h={6} />}

      <ContractDescription
        className="px-2"
        contract={contract}
        isCreator={isCreator}
      />
    </Col>
  )
}
