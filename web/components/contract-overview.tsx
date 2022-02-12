import {
  Contract,
  deleteContract,
  contractPath,
  tradingAllowed,
  getBinaryProbPercent,
} from '../lib/firebase/contracts'
import { Col } from './layout/col'
import { Spacer } from './layout/spacer'
import { ContractProbGraph } from './contract-prob-graph'
import router from 'next/router'
import { useUser } from '../hooks/use-user'
import { Row } from './layout/row'
import { Linkify } from './linkify'
import clsx from 'clsx'
import { ContractDetails, ResolutionOrChance } from './contract-card'
import { ContractFeed } from './contract-feed'
import { TweetButton } from './tweet-button'
import { Bet } from '../../common/bet'
import { Comment } from '../../common/comment'
import { RevealableTagsInput, TagsInput } from './tags-input'
import BetRow from './bet-row'
import { Fold } from '../../common/fold'
import { FoldTagList } from './tags-list'

export const ContractOverview = (props: {
  contract: Contract
  bets: Bet[]
  comments: Comment[]
  folds: Fold[]
  className?: string
}) => {
  const { contract, bets, comments, folds, className } = props
  const { question, resolution, creatorId, outcomeType } = contract

  const user = useUser()
  const isCreator = user?.id === creatorId
  const isBinary = outcomeType === 'BINARY'

  const tweetText = getTweetText(contract, isCreator)

  return (
    <Col className={clsx('mb-6', className)}>
      <Row className="justify-between gap-4 px-2">
        <Col className="gap-4">
          <div className="text-2xl text-indigo-700 md:text-3xl">
            <Linkify text={question} />
          </div>

          {isBinary && (
            <Row className="items-center justify-between gap-4">
              <ResolutionOrChance
                className="md:hidden"
                resolution={resolution}
                probPercent={getBinaryProbPercent(contract)}
                large
              />

              {tradingAllowed(contract) && (
                <BetRow
                  contract={contract}
                  className="md:hidden"
                  labelClassName="hidden"
                />
              )}
            </Row>
          )}

          <ContractDetails contract={contract} />
        </Col>

        {isBinary && (
          <Col className="hidden items-end justify-between md:flex">
            <ResolutionOrChance
              className="items-end"
              resolution={resolution}
              probPercent={getBinaryProbPercent(contract)}
              large
            />
          </Col>
        )}
      </Row>

      <Spacer h={4} />

      {isBinary && <ContractProbGraph contract={contract} bets={bets} />}

      <Row className="mt-6 ml-4 hidden items-center justify-between gap-4 sm:flex">
        {folds.length === 0 ? (
          <TagsInput className={clsx('mx-4')} contract={contract} />
        ) : (
          <FoldTagList folds={folds} />
        )}
        <TweetButton tweetText={tweetText} />
      </Row>

      <Col className="mt-6 ml-4 gap-4 sm:hidden">
        <TweetButton className="self-end" tweetText={tweetText} />
        {folds.length === 0 ? (
          <TagsInput contract={contract} />
        ) : (
          <FoldTagList folds={folds} />
        )}
      </Col>

      {folds.length > 0 && (
        <RevealableTagsInput className="mx-4 mt-4" contract={contract} />
      )}

      {/* Show a delete button for contracts without any trading */}
      {isCreator && (isBinary ? bets.length <= 2 : bets.length <= 1) && (
        <>
          <button
            className="btn btn-xs btn-error btn-outline mt-1 max-w-fit self-end"
            onClick={async (e) => {
              e.preventDefault()
              await deleteContract(contract.id)
              router.push('/markets')
            }}
          >
            Delete
          </button>
        </>
      )}

      <Spacer h={12} />

      <ContractFeed
        contract={contract}
        bets={bets}
        comments={comments}
        feedType="market"
        betRowClassName="md:hidden !mt-0"
      />
    </Col>
  )
}

const getTweetText = (contract: Contract, isCreator: boolean) => {
  const { question, creatorName, resolution, outcomeType } = contract
  const isBinary = outcomeType === 'BINARY'

  const tweetQuestion = isCreator
    ? question
    : `${question} Asked by ${creatorName}.`
  const tweetDescription = resolution
    ? `Resolved ${resolution}!`
    : isBinary
    ? `Currently ${getBinaryProbPercent(
        contract
      )} chance, place your bets here:`
    : `Submit your own answer:`
  const url = `https://manifold.markets${contractPath(contract)}`

  return `${tweetQuestion}\n\n${tweetDescription}\n\n${url}`
}
