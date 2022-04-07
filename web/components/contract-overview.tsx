import { Contract, tradingAllowed } from '../lib/firebase/contracts'
import { Col } from './layout/col'
import { Spacer } from './layout/spacer'
import { ContractProbGraph } from './contract-prob-graph'
import { useUser } from '../hooks/use-user'
import { Row } from './layout/row'
import { Linkify } from './linkify'
import clsx from 'clsx'
import { ContractDetails, ResolutionOrChance } from './contract-card'
import { Bet } from '../../common/bet'
import { Comment } from '../../common/comment'
import BetRow from './bet-row'
import { ContractActivity } from './feed/contract-activity'
import { AnswersGraph } from './answers/answers-graph'
import { DPM, FreeResponse, FullContract } from '../../common/contract'

export const ContractOverview = (props: {
  contract: Contract
  bets: Bet[]
  comments: Comment[]
  children?: any
  className?: string
}) => {
  const { contract, bets, comments, children, className } = props
  const { question, resolution, creatorId, outcomeType } = contract

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

          {(isBinary || resolution) && (
            <ResolutionOrChance
              className="hidden items-end xl:flex"
              contract={contract}
              large
            />
          )}
        </Row>

        <Row className="items-center justify-between gap-4 xl:hidden">
          {(isBinary || resolution) && (
            <ResolutionOrChance contract={contract} />
          )}

          {isBinary && tradingAllowed(contract) && (
            <BetRow contract={contract} labelClassName="hidden" />
          )}
        </Row>

        <ContractDetails contract={contract} isCreator={isCreator} />
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

      {children}

      <Spacer h={12} />

      <ContractActivity
        contract={contract}
        bets={bets}
        comments={comments}
        user={user}
        mode="all"
        betRowClassName="!mt-0 xl:hidden"
      />
    </Col>
  )
}
