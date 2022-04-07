import {
  Contract,
  getBinaryProbPercent,
  tradingAllowed,
} from '../lib/firebase/contracts'
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
  const allowTrade = tradingAllowed(contract)

  return (
    <Col className={clsx('mb-6', className)}>
      <Row>
        <Col className="gap-4 px-2">
          <Row className="justify-between gap-4">
            <div className="text-2xl text-indigo-700 md:text-3xl">
              <Linkify text={question} />
            </div>

            {/* {(isBinary || resolution) && (
            <ResolutionOrChance
              className="items-end xl:flex"
              contract={contract}
              large
            />
          )} */}
          </Row>

          <ContractDetails contract={contract} isCreator={isCreator} />
        </Col>
        <QuickBetWidget contract={contract} />
      </Row>

      <Spacer h={4} />

      {/* {isBinary && allowTrade && (
        <Row className="my-6 items-center justify-between gap-4 lg:justify-center">
          {(isBinary || resolution) && (
            <ResolutionOrChance contract={contract} className="lg:hidden" />
          )}
          {isBinary && tradingAllowed(contract) && (
            <BetRow large contract={contract} labelClassName="hidden" />
          )}
        </Row>
      )} */}

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
        betRowClassName="!mt-0 xl:hidden"
      />
    </Col>
  )
}

function Triangle(props: {
  direction: 'up' | 'down'
  width: number
  color: string
  className?: string
}) {
  const { direction, width, color, className } = props

  return (
    <div
      className={clsx(
        'border-x-solid group h-0 w-0 cursor-pointer border-x-[30px] border-x-transparent transition-colors',
        'relative',
        className,
        direction === 'up' &&
          'border-b-solid border-b-[30px] border-b-gray-200 hover:border-b-green-300 focus:ring-green-500',
        direction === 'down' &&
          'border-t-solid border-t-[30px] border-t-gray-200 hover:border-t-red-300'
      )}
      tabIndex={0}
    >
      {/* {direction === 'up' && (
        <div className="absolute top-4 -left-2 select-none text-xs text-gray-500 opacity-0 transition-opacity group-hover:opacity-100">
          M$
        </div>
      )}
      {direction === 'down' && (
        <div className="absolute -top-9 -left-2 hidden select-none text-xs text-gray-500 group-hover:block">
          M$
        </div>
      )} */}
    </div>
  )
}

function QuickBetWidget(props: { contract: Contract }) {
  const { contract } = props
  return (
    <Col className="items-center gap-2">
      <div className="whitespace-nowrap text-sm text-gray-500">
        Click to trade
      </div>
      <Triangle direction="up" width={50} color="#e3e3e3" />
      <div className="text-primary text-3xl">
        {getBinaryProbPercent(contract)}
      </div>
      <Triangle direction="down" width={50} color="#e3e3e3" />
    </Col>
  )
}
