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
import { RevealableTagsInput, TagsInput } from './tags-input'
import BetRow from './bet-row'
import { Fold } from '../../common/fold'
import { FoldTagList } from './tags-list'
import { ContractActivity } from './feed/contract-activity'
import { AnswersGraph } from './answers/answers-graph'
import { DPM, FreeResponse, FullContract } from '../../common/contract'

export const ContractOverview = (props: {
  contract: Contract
  bets: Bet[]
  comments: Comment[]
  folds: Fold[]
  children?: any
  className?: string
}) => {
  const { contract, bets, comments, folds, children, className } = props
  const { question, resolution, creatorId, outcomeType } = contract

  const user = useUser()
  const isCreator = user?.id === creatorId
  const isBinary = outcomeType === 'BINARY'

  return (
    <Col className={clsx('mb-6', className)}>
      <Row className="justify-between gap-4 px-2">
        <Col className="gap-4">
          <div className="text-2xl text-indigo-700 md:text-3xl">
            <Linkify text={question} />
          </div>

          <Row className="items-center justify-between gap-4">
            {(isBinary || resolution) && (
              <ResolutionOrChance
                className="md:hidden"
                contract={contract}
                large
              />
            )}

            {isBinary && tradingAllowed(contract) && (
              <BetRow
                contract={contract}
                className="md:hidden"
                labelClassName="hidden"
              />
            )}
          </Row>

          <ContractDetails contract={contract} isCreator={isCreator} />
        </Col>

        {(isBinary || resolution) && (
          <Col className="hidden items-end justify-between md:flex">
            <ResolutionOrChance
              className="items-end"
              contract={contract}
              large
            />
          </Col>
        )}
      </Row>

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

      <Row className="mt-6 hidden items-center justify-between gap-4 sm:flex">
        {folds.length === 0 ? (
          <TagsInput className={clsx('mx-4')} contract={contract} />
        ) : (
          <FoldTagList folds={folds} />
        )}
      </Row>

      <Col className="mt-6 gap-4 sm:hidden">
        {folds.length === 0 ? (
          <TagsInput contract={contract} />
        ) : (
          <FoldTagList folds={folds} />
        )}
      </Col>

      {folds.length > 0 && (
        <RevealableTagsInput className="mt-4" contract={contract} />
      )}

      <Spacer h={12} />

      <ContractActivity
        contract={contract}
        bets={bets}
        comments={comments}
        user={user}
        mode="all"
        betRowClassName="!mt-0"
      />
    </Col>
  )
}
