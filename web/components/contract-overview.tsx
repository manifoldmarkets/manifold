import {
  contractMetrics,
  Contract,
  deleteContract,
  contractPath,
  tradingAllowed,
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
import { ContractFeed, getContractFeedItems } from './contract-feed'
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
  const { resolution, creatorId, creatorName } = contract
  const { probPercent, truePool } = contractMetrics(contract)

  const user = useUser()
  const isCreator = user?.id === creatorId

  const tweetQuestion = isCreator
    ? contract.question
    : `${creatorName}: ${contract.question}`
  const tweetDescription = resolution
    ? `Resolved ${resolution}!`
    : `Currently ${probPercent} chance, place your bets here:`
  const url = `https://manifold.markets${contractPath(contract)}`
  const tweetText = `${tweetQuestion}\n\n${tweetDescription}\n\n${url}`

  const activityItems = getContractFeedItems(contract, bets, comments, user, {
    feedType: 'market',
    expanded: true,
  })

  return (
    <Col className={clsx('mb-6', className)}>
      <Row className="justify-between gap-4 px-2">
        <Col className="gap-4">
          <div className="text-2xl md:text-3xl text-indigo-700">
            <Linkify text={contract.question} />
          </div>

          <Row className="justify-between items-center gap-4">
            <ResolutionOrChance
              className="md:hidden"
              resolution={resolution}
              probPercent={probPercent}
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

          <ContractDetails contract={contract} />
        </Col>

        <Col className="hidden md:flex justify-between items-end">
          <ResolutionOrChance
            className="items-end"
            resolution={resolution}
            probPercent={probPercent}
            large
          />
        </Col>
      </Row>

      <Spacer h={4} />

      <ContractProbGraph contract={contract} />

      <Row className="hidden sm:flex justify-between items-center mt-6 ml-4 gap-4">
        {folds.length === 0 ? (
          <TagsInput className={clsx('mx-4')} contract={contract} />
        ) : (
          <FoldTagList folds={folds} />
        )}
        <TweetButton tweetText={tweetText} />
      </Row>

      <Col className="sm:hidden mt-6 ml-4 gap-4">
        <TweetButton className="self-end" tweetText={tweetText} />
        {folds.length === 0 ? (
          <TagsInput contract={contract} />
        ) : (
          <FoldTagList folds={folds} />
        )}
      </Col>

      {folds.length > 0 && (
        <RevealableTagsInput className="mt-4 mx-4" contract={contract} />
      )}

      <Spacer h={12} />

      {/* Show a delete button for contracts without any trading */}
      {isCreator && truePool === 0 && (
        <>
          <Spacer h={8} />
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

      <ContractFeed
        contract={contract}
        activityItems={activityItems}
        feedType="market"
        betRowClassName="md:hidden !mt-0"
      />
    </Col>
  )
}
