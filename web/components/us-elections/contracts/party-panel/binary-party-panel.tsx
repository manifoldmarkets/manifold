import { track } from 'web/lib/service/analytics'
import clsx from 'clsx'
import { Bet } from 'common/bet'
import { getDisplayProbability, getProbability } from 'common/calculate'
import { BinaryContract, Contract } from 'common/contract'
import { TRADE_TERM } from 'common/envs/constants'
import { User } from 'common/user'
import { formatPercent } from 'common/util/format'
import { capitalize } from 'lodash'
import Image from 'next/image'
import { useState } from 'react'
import {
  AnswerBar,
  CreatorAndAnswerLabel,
} from 'web/components/answers/answer-components'
import { BetDialog } from 'web/components/bet/bet-dialog'
import { BinaryOutcomes } from 'web/components/bet/bet-panel'
import { Button } from 'web/components/buttons/button'
import { isClosed } from 'web/components/contract/contracts-table'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { SizedContainer } from 'web/components/sized-container'
import { ProbabilityNeedle } from 'web/components/us-elections/probability-needle'
import { useSaveBinaryShares } from 'web/hooks/use-save-binary-shares'
import { useUser } from 'web/hooks/use-user'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { firebaseLogin } from 'web/lib/firebase/users'
import { BubblePercentChange } from '../candidates-panel/candidate-bar'
import { BinaryUserPosition } from '../candidates-panel/candidates-user-position'
import { ELECTIONS_PARTY_QUESTION_PSEUDONYM } from 'web/components/elections-page'
import { sliderColors } from 'web/components/widgets/slider'

const politicsBinaryPseudonym = {
  YES: {
    pseudonymName: 'TRUMP',
    pseudonymColor: 'sienna' as keyof typeof sliderColors,
  },
  NO: {
    pseudonymName: 'HARRIS',
    pseudonymColor: 'azure' as keyof typeof sliderColors,
  },
}

// just the bars
export function BinaryPartyPanel(props: { contract: BinaryContract }) {
  const { contract } = props
  const user = useUser()

  const userBets = useUserContractBets(user?.id, contract.id)

  const { sharesOutcome } = useSaveBinaryShares(contract, userBets)

  const republicanProb = getDisplayProbability(contract)
  const democraticProb = 1 - republicanProb

  return (
    <Col className=" mx-[2px] gap-2">
      <div className="relative hidden md:flex md:items-center md:justify-between">
        <div
          style={{ overflow: 'hidden' }}
          className="absolute -bottom-4 -left-[18px]"
        >
          <Image
            height={250}
            width={250} // Double the width to ensure the image is not stretched
            src="/political-candidates/trump-right.png"
            alt={'trump'}
            className="h-full rounded-bl-lg"
          />
        </div>
        <div
          style={{ overflow: 'hidden' }}
          className="absolute -bottom-4 -right-[18px]"
        >
          <Image
            height={250}
            width={250} // Double the width to ensure the image is not stretched
            src="/political-candidates/kamala-left.png"
            alt={'trump'}
            className="h-full rounded-br-lg"
          />
        </div>
        <BinaryPartyAnswerSnippet
          contract={contract}
          isDemocraticParty={false}
          color={getPartyColor('Republican Party')}
          betUp={sharesOutcome == 'YES'}
          user={user}
          className="absolute left-[90px]"
          probability={republicanProb}
          userBets={userBets}
        />
        <SizedContainer className="mx-auto h-[210px] w-1/2 lg:w-2/5 xl:w-1/2">
          {(width, height) => (
            <ProbabilityNeedle
              percentage={democraticProb}
              width={width}
              height={height}
            />
          )}
        </SizedContainer>

        <BinaryPartyAnswerSnippet
          contract={contract}
          isDemocraticParty={true}
          color={getPartyColor('Democratic Party')}
          // userBets={userBetsByAnswer[democraticAnswer.id]}
          betUp={sharesOutcome == 'NO'}
          user={user}
          className="absolute right-[90px]"
          probability={democraticProb}
          userBets={userBets}
        />
      </div>
      <SizedContainer className="h-[210px] w-full md:hidden">
        {(width, height) => (
          <ProbabilityNeedle
            percentage={democraticProb}
            width={width}
            height={height}
          />
        )}
      </SizedContainer>
      <Col className="gap-2 md:hidden">
        <BinaryPartyAnswer
          contract={contract}
          userBets={userBets}
          user={user}
          sharesOutcome={sharesOutcome}
        />
      </Col>
    </Col>
  )
}

export function getPartyColor(name: string) {
  // return 'bg-primary-500'
  if (name == 'Democratic Party' || name.includes('Democratic Party'))
    return '#adc4e3'
  if (name == 'Republican Party' || name.includes('Republican Party'))
    return '#ecbab5'
  return '#9E9FBD'
}

function BinaryPartyAnswer(props: {
  contract: BinaryContract
  onHover?: (hovering: boolean) => void
  userBets?: Bet[]
  user?: User | null
  sharesOutcome: BinaryOutcomes
}) {
  const { contract, onHover, userBets, user, sharesOutcome } = props

  const { resolution } = contract

  const repProb = getProbability(contract)
  const demProb = 1 - repProb
  const repResolvedProb = contract.resolutionProbability
  const demResolvedProb = repResolvedProb ? 1 - repResolvedProb : undefined
  const probChangesToday = contract.probChanges.day

  const harrisHead = (
    <Image
      height={80}
      width={80} // Double the width to ensure the image is not stretched
      src={'/political-candidates/harris.png'}
      alt={''}
      className={clsx('absolute -bottom-3.5 -left-3 h-14 w-14 rounded-bl')}
    />
  )

  const trumpHead = (
    <Image
      height={80}
      width={80} // Double the width to ensure the image is not stretched
      src={'/political-candidates/trump.png'}
      alt={''}
      className={clsx('absolute -bottom-3.5 -left-3 h-14 w-14 rounded-bl')}
    />
  )

  return (
    <Col className={'w-full gap-2'}>
      <AnswerBar
        color={'#ecbab5'}
        prob={repProb}
        resolvedProb={repResolvedProb}
        className={clsx('cursor-pointer py-1.5')}
        label={
          <Row className="relative h-8">
            {trumpHead}
            <Col className={'ml-12'}>
              <CreatorAndAnswerLabel
                text={'Trump'}
                createdTime={contract.createdTime}
                className={clsx('items-center !leading-none ')}
              />
              {!resolution && sharesOutcome == 'YES' && user && !!userBets && (
                <BinaryUserPosition
                  contract={contract}
                  userBets={userBets}
                  user={user}
                  className={clsx(
                    'text-ink-500 dark:text-ink-700 absolute -bottom-[22px] text-xs hover:underline'
                  )}
                  binaryPseudonym={politicsBinaryPseudonym}
                />
              )}
            </Col>
          </Row>
        }
        end={
          <Row className={'items-center gap-2'}>
            <div className="relative">
              <div className="text-lg font-bold">{formatPercent(repProb)}</div>
              {probChangesToday > 0 && (
                <BubblePercentChange
                  probChange={Math.abs(probChangesToday)}
                  className="whitespace-nowrap text-sm"
                />
              )}
            </div>
            <BinaryBetButton
              contract={contract}
              initialOutcome={'YES'}
              questionPseudonym={ELECTIONS_PARTY_QUESTION_PSEUDONYM}
            />
          </Row>
        }
      />
      <AnswerBar
        color={'#adc4e3'}
        prob={demProb}
        resolvedProb={demResolvedProb}
        className={clsx('cursor-pointer py-1.5')}
        label={
          <Row className="relative h-8">
            {harrisHead}
            <Col className={'ml-12'}>
              <CreatorAndAnswerLabel
                text={'Harris'}
                createdTime={contract.createdTime}
                className={clsx('items-center !leading-none ')}
              />
              {!resolution && sharesOutcome == 'NO' && user && !!userBets && (
                <BinaryUserPosition
                  contract={contract}
                  userBets={userBets}
                  user={user}
                  className={clsx(
                    'text-ink-500 dark:text-ink-700 absolute -bottom-2 text-xs hover:underline'
                  )}
                  binaryPseudonym={politicsBinaryPseudonym}
                />
              )}
            </Col>
          </Row>
        }
        end={
          <Row className={'items-center gap-2'}>
            <div className="relative">
              <div className="text-lg font-bold">{formatPercent(demProb)}</div>
              {probChangesToday < 0 && (
                <BubblePercentChange
                  probChange={Math.abs(probChangesToday)}
                  className="whitespace-nowrap text-sm"
                />
              )}
            </div>
            <BinaryBetButton
              contract={contract}
              initialOutcome={'NO'}
              questionPseudonym={ELECTIONS_PARTY_QUESTION_PSEUDONYM}
            />
          </Row>
        }
      />
    </Col>
  )
}

function BinaryPartyAnswerSnippet(props: {
  contract: BinaryContract
  color: string
  betUp: boolean
  user?: User | null
  className?: string
  isDemocraticParty: boolean
  probability: number
  userBets: Bet[]
}) {
  const {
    contract,
    betUp,
    user,
    className,
    isDemocraticParty,
    probability,
    userBets,
  } = props

  const { resolution } = contract

  const probChangesToday = contract.probChanges.day

  return (
    <Col
      className={clsx(
        className,

        isDemocraticParty ? 'items-end text-right' : ''
      )}
    >
      <div className="text-ink-700">
        {isDemocraticParty ? 'Harris' : 'Trump'}
      </div>
      <Spacer h={1} />
      <Row className={isDemocraticParty ? 'flex-row-reverse' : ''}>
        <div className="!text-5xl font-bold">{formatPercent(probability)}</div>
        {(isDemocraticParty && probChangesToday < 0) ||
          (!isDemocraticParty && probChangesToday > 0 && (
            <BubblePercentChange
              probChange={Math.abs(probChangesToday)}
              className="whitespace-nowrap text-sm"
            />
          ))}
      </Row>

      <Spacer h={2} />
      <div className="relative">
        <BinaryBetButton
          contract={contract}
          initialOutcome={isDemocraticParty ? 'NO' : 'YES'}
          className="w-20"
          questionPseudonym={ELECTIONS_PARTY_QUESTION_PSEUDONYM}
        />

        {!resolution && betUp && user && (
          <BinaryUserPosition
            contract={contract}
            userBets={userBets}
            user={user}
            className={clsx(
              'text-ink-500 dark:text-ink-700 absolute -bottom-[22px] text-xs hover:underline',
              isDemocraticParty ? 'right-0' : 'left-0'
            )}
            binaryPseudonym={politicsBinaryPseudonym}
          />
        )}
      </div>
    </Col>
  )
}

export function BinaryBetButton(props: {
  contract: Contract
  initialOutcome?: BinaryOutcomes
  className?: string
  questionPseudonym?: string
  binaryPseudonym?: {
    YES: {
      pseudonymName: string
      pseudonymColor: keyof typeof sliderColors
    }
    NO: {
      pseudonymName: string
      pseudonymColor: keyof typeof sliderColors
    }
  }
}) {
  const {
    contract,
    initialOutcome,
    className,
    questionPseudonym,
    binaryPseudonym,
  } = props
  const user = useUser()
  const [open, setOpen] = useState(false)
  const isCashContract = contract.token == 'CASH'

  if (
    !isClosed(contract) &&
    !contract.isResolved &&
    (contract.mechanism === 'cpmm-1' || contract.mechanism === 'cpmm-multi-1')
  ) {
    return (
      <>
        <Button
          size="2xs"
          color={'indigo-outline'}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            track('bet intent', {
              location: 'contract table',
              token: contract.token,
            })
            if (!user) {
              firebaseLogin()
              return
            }

            setOpen(true)
          }}
          className={clsx('bg-primary-50', className)}
        >
          {capitalize(TRADE_TERM)}
        </Button>

        {open && (
          <BetDialog
            contract={contract as BinaryContract}
            open={open}
            setOpen={setOpen}
            trackingLocation="contract table"
            initialOutcome={initialOutcome}
            binaryPseudonym={binaryPseudonym ?? politicsBinaryPseudonym}
            questionPseudonym={questionPseudonym}
          />
        )}
      </>
    )
  }
  return <></>
}
