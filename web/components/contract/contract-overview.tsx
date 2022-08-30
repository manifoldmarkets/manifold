import React from 'react'
import clsx from 'clsx'

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
import { Contract, CPMMBinaryContract } from 'common/contract'
import { ContractDescription } from './contract-description'
import { ContractDetails } from './contract-details'
import { NumericGraph } from './numeric-graph'
import { ShareRow } from './share-row'
import { LikeMarketButton } from 'web/components/contract/like-market-button'

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

  return (
    <Col className={clsx('mb-6', className)}>
      <Col className="gap-3 px-2 sm:gap-4">
        <Row className="justify-between gap-4">
          <div className="text-2xl text-indigo-700 md:text-3xl">
            <Linkify text={question} />
          </div>
          {(outcomeType === 'FREE_RESPONSE' ||
            outcomeType === 'MULTIPLE_CHOICE') &&
            !resolution && (
              <div className={'sm:hidden'}>
                <LikeMarketButton contract={contract} user={user} />
              </div>
            )}
          <Row className={'hidden gap-3 xl:flex'}>
            {isBinary && (
              <BinaryResolutionOrChance
                className="items-end"
                contract={contract}
                large
              />
            )}

            {isPseudoNumeric && (
              <PseudoNumericResolutionOrExpectation
                contract={contract}
                className="items-end"
              />
            )}

            {outcomeType === 'NUMERIC' && (
              <NumericResolutionOrExpectation
                contract={contract}
                className="items-end"
              />
            )}
          </Row>
        </Row>

        {isBinary ? (
          <Row className="items-center justify-between gap-4 xl:hidden">
            <BinaryResolutionOrChance contract={contract} />
            {tradingAllowed(contract) && (
              <Row>
                <div className={'sm:hidden'}>
                  <LikeMarketButton contract={contract} user={user} />
                </div>
                <Col>
                  <BetButton contract={contract as CPMMBinaryContract} />
                  {!user && (
                    <div className="mt-1 text-center text-sm text-gray-500">
                      (with play money!)
                    </div>
                  )}
                </Col>
              </Row>
            )}
          </Row>
        ) : isPseudoNumeric ? (
          <Row className="items-center justify-between gap-4 xl:hidden">
            <PseudoNumericResolutionOrExpectation contract={contract} />
            {tradingAllowed(contract) && (
              <Row>
                <div className={'sm:hidden'}>
                  <LikeMarketButton contract={contract} user={user} />
                </div>
                <Col>
                  <BetButton contract={contract} />
                  {!user && (
                    <div className="mt-1 text-center text-sm text-gray-500">
                      (with play money!)
                    </div>
                  )}
                </Col>
              </Row>
            )}
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
          user={user}
        />
      </Col>
      <div className={'my-1 md:my-2'}></div>
      {(isBinary || isPseudoNumeric) && (
        <ContractProbGraph contract={contract} bets={bets} />
      )}{' '}
      {(outcomeType === 'FREE_RESPONSE' ||
        outcomeType === 'MULTIPLE_CHOICE') && (
        <AnswersGraph contract={contract} bets={bets} />
      )}
      {outcomeType === 'NUMERIC' && <NumericGraph contract={contract} />}
      <ShareRow user={user} contract={contract} />
      <ContractDescription
        className="px-2"
        contract={contract}
        isCreator={isCreator}
      />
    </Col>
  )
}
