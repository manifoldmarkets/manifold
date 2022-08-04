import { contractUrl, tradingAllowed } from 'web/lib/firebase/contracts'
import { Col } from '../layout/col'
import { Spacer } from '../layout/spacer'
import { ContractProbGraph } from './contract-prob-graph'
import { useUser } from 'web/hooks/use-user'
import { Row } from '../layout/row'
import { Linkify } from '../linkify'
import clsx from 'clsx'

import {
  BinaryResolutionOrChance,
  FreeResponseResolutionOrChance,
  NumericResolutionOrExpectation,
  PseudoNumericResolutionOrExpectation,
} from './contract-card'
import { Bet } from 'common/bet'
import BetRow from '../bet-row'
import { AnswersGraph } from '../answers/answers-graph'
import { Contract, CPMMBinaryContract } from 'common/contract'
import { ContractDescription } from './contract-description'
import { ContractDetails } from './contract-details'
import { NumericGraph } from './numeric-graph'
import { CreateChallengeButton } from 'web/components/challenges/create-challenge-button'
import React from 'react'
import { copyToClipboard } from 'web/lib/util/copy'
import toast from 'react-hot-toast'
import { LinkIcon } from '@heroicons/react/outline'

export const ContractOverview = (props: {
  contract: Contract
  bets: Bet[]
  className?: string
}) => {
  const { contract, bets, className } = props
  const { question, creatorId, outcomeType, resolution } = contract

  const user = useUser()
  const isCreator = user?.id === creatorId

  const isBinary = outcomeType === 'BINARY'
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'
  const showChallenge = user && isBinary && !resolution

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

          {isPseudoNumeric && (
            <PseudoNumericResolutionOrExpectation
              contract={contract}
              className="hidden items-end xl:flex"
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

            {tradingAllowed(contract) && (
              <BetRow contract={contract as CPMMBinaryContract} />
            )}
          </Row>
        ) : isPseudoNumeric ? (
          <Row className="items-center justify-between gap-4 xl:hidden">
            <PseudoNumericResolutionOrExpectation contract={contract} />
            {tradingAllowed(contract) && <BetRow contract={contract} />}
          </Row>
        ) : isPseudoNumeric ? (
          <Row className="items-center justify-between gap-4 xl:hidden">
            <PseudoNumericResolutionOrExpectation contract={contract} />
            {tradingAllowed(contract) && <BetRow contract={contract} />}
          </Row>
        ) : (
          (outcomeType === 'FREE_RESPONSE' ||
            outcomeType === 'MULTIPLE_CHOICE') &&
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
      {(isBinary || isPseudoNumeric) && (
        <ContractProbGraph contract={contract} bets={bets} />
      )}{' '}
      {(outcomeType === 'FREE_RESPONSE' ||
        outcomeType === 'MULTIPLE_CHOICE') && (
        <AnswersGraph contract={contract} bets={bets} />
      )}
      {outcomeType === 'NUMERIC' && <NumericGraph contract={contract} />}
      {/* {(contract.description || isCreator) && <Spacer h={6} />} */}
      <ContractDescription
        className="px-2"
        contract={contract}
        isCreator={isCreator}
      />
      {/*<Row className="mx-4 mt-4 hidden justify-around sm:block">*/}
      {/*  {showChallenge && (*/}
      {/*    <Col className="gap-3">*/}
      {/*      <div className="text-lg">⚔️ Challenge a friend ⚔️</div>*/}
      {/*      <CreateChallengeButton user={user} contract={contract} />*/}
      {/*    </Col>*/}
      {/*  )}*/}
      {/*  {isCreator && (*/}
      {/*    <Col className="gap-3">*/}
      {/*      <div className="text-lg">Share your market</div>*/}
      {/*      <ShareMarketButton contract={contract} />*/}
      {/*    </Col>*/}
      {/*  )}*/}
      {/*</Row>*/}
      <Row className="mx-4 mt-6 block justify-around">
        {showChallenge && (
          <Col className="gap-3">
            <CreateChallengeButton user={user} contract={contract} />
          </Col>
        )}
        {isCreator && (
          <Col className="gap-3">
            <button
              onClick={() => {
                copyToClipboard(contractUrl(contract))
                toast('Link copied to clipboard!')
              }}
              className={'btn btn-outline mb-4 whitespace-nowrap normal-case'}
            >
              <LinkIcon className={'mr-2 h-5 w-5'} />
              Share market
            </button>
          </Col>
        )}
      </Row>
    </Col>
  )
}
