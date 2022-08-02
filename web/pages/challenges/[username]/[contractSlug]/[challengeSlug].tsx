import React, { useEffect, useState } from 'react'
import Confetti from 'react-confetti'

import { fromPropz, usePropz } from 'web/hooks/use-propz'
import {
  Contract,
  contractPath,
  getContractFromSlug,
} from 'web/lib/firebase/contracts'
import { useContractWithPreload } from 'web/hooks/use-contract'
import { DOMAIN } from 'common/envs/constants'
import { Col } from 'web/components/layout/col'
import { SiteLink } from 'web/components/site-link'
import { Spacer } from 'web/components/layout/spacer'
import { Row } from 'web/components/layout/row'
import { Challenge } from 'common/challenge'
import {
  getChallenge,
  getChallengeUrl,
  useChallenge,
} from 'web/lib/firebase/challenges'
import { getUserByUsername } from 'web/lib/firebase/users'
import { User } from 'common/user'
import { Page } from 'web/components/page'
import { useUser, useUserById } from 'web/hooks/use-user'
import { AcceptChallengeButton } from 'web/components/challenges/accept-challenge-button'
import { Avatar } from 'web/components/avatar'
import { UserLink } from 'web/components/user-page'
import { BinaryOutcomeLabel } from 'web/components/outcome-label'
import { formatMoney } from 'common/util/format'
import { LoadingIndicator } from 'web/components/loading-indicator'
import { useWindowSize } from 'web/hooks/use-window-size'
import { Bet, listAllBets } from 'web/lib/firebase/bets'
import {
  BinaryResolutionOrChance,
  PseudoNumericResolutionOrExpectation,
} from 'web/components/contract/contract-card'
import { ContractProbGraph } from 'web/components/contract/contract-prob-graph'
import { SEO } from 'web/components/SEO'
import { getOpenGraphProps } from 'web/components/contract/contract-card-preview'
import Custom404 from 'web/pages/404'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { BinaryContract } from 'common/contract'
import { Title } from 'web/components/title'

export const getStaticProps = fromPropz(getStaticPropz)

export async function getStaticPropz(props: {
  params: { username: string; contractSlug: string; challengeSlug: string }
}) {
  const { username, contractSlug, challengeSlug } = props.params
  const contract = (await getContractFromSlug(contractSlug)) || null
  const user = (await getUserByUsername(username)) || null
  const bets = contract?.id ? await listAllBets(contract.id) : []
  const challenge = contract?.id
    ? await getChallenge(challengeSlug, contract.id)
    : null

  return {
    props: {
      contract,
      user,
      slug: contractSlug,
      challengeSlug,
      bets,
      challenge,
    },

    revalidate: 60, // regenerate after a minute
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function ChallengePage(props: {
  contract: BinaryContract | null
  user: User
  slug: string
  bets: Bet[]
  challenge: Challenge | null
  challengeSlug: string
}) {
  props = usePropz(props, getStaticPropz) ?? {
    contract: null,
    user: null,
    challengeSlug: '',
    bets: [],
    challenge: null,
    slug: '',
  }
  const contract = (useContractWithPreload(props.contract) ??
    props.contract) as BinaryContract

  const challenge =
    useChallenge(props.challengeSlug, contract?.id) ?? props.challenge

  const { user, bets } = props
  const currentUser = useUser()

  useSaveReferral(currentUser, {
    defaultReferrerUsername: challenge?.creatorUsername,
  })

  if (!contract || !challenge) return <Custom404 />

  const ogCardProps = getOpenGraphProps(contract)
  ogCardProps.creatorUsername = challenge.creatorUsername
  ogCardProps.creatorName = challenge.creatorName
  ogCardProps.creatorAvatarUrl = challenge.creatorAvatarUrl

  return (
    <Page>
      <SEO
        title={ogCardProps.question}
        description={ogCardProps.description}
        url={getChallengeUrl(challenge).replace('https://', '')}
        ogCardProps={ogCardProps}
        challengeCardProps={{
          challengeOutcome: challenge.creatorOutcome,
          challengeAmount: challenge.creatorAmount + '',
        }}
      />
      {challenge.acceptances.length >= challenge.maxUses ? (
        <ClosedChallengeContent
          contract={contract}
          challenge={challenge}
          creator={user}
          bets={bets}
        />
      ) : (
        <OpenChallengeContent
          user={currentUser}
          contract={contract}
          challenge={challenge}
          creator={user}
          bets={bets}
        />
      )}
    </Page>
  )
}

const userRow = (challenger: User) => (
  <Row className={'mb-2 w-full items-center justify-center gap-2'}>
    <Avatar
      size={12}
      avatarUrl={challenger.avatarUrl}
      username={challenger.username}
    />
    <UserLink
      className={'text-2xl'}
      name={challenger.name}
      username={challenger.username}
    />
  </Row>
)

function ClosedChallengeContent(props: {
  contract: BinaryContract
  challenge: Challenge
  creator: User
  bets: Bet[]
}) {
  const { contract, challenge, creator, bets } = props
  const { resolution } = contract
  const {
    acceptances,
    creatorAmount,
    creatorOutcome,
    creatorOutcomeProb,
    yourOutcome,
  } = challenge

  const user = useUserById(acceptances[0].userId)
  const [showConfetti, setShowConfetti] = useState(false)
  const { width, height } = useWindowSize()
  useEffect(() => {
    if (acceptances.length === 0) return
    if (acceptances[0].createdTime > Date.now() - 1000 * 60)
      setShowConfetti(true)
  }, [acceptances])
  const creatorWon = resolution === creatorOutcome
  const amountWon = creatorWon ? acceptances[0].amount : creatorAmount
  const yourCost =
    ((1 - creatorOutcomeProb) / creatorOutcomeProb) * creatorAmount

  if (!user) return <LoadingIndicator />

  const userWonCol = (user: User, amount: number) => (
    <Col className="w-full items-start justify-center gap-1 p-4">
      <Row className={'mb-2 w-full items-center justify-center gap-2'}>
        <span className={'mx-2 text-3xl'}>🥇</span>
        <Avatar size={12} avatarUrl={user.avatarUrl} username={user.username} />
        <UserLink
          className={'text-2xl'}
          name={user.name}
          username={user.username}
        />
        <span className={'mx-2 text-3xl'}>🥇</span>
      </Row>
      <Row className={'w-full items-center justify-center'}>
        <span className={'text-lg'}>
          WON <span className={'text-primary'}>{formatMoney(amount)}</span>
        </span>
      </Row>
    </Col>
  )

  const userLostCol = (challenger: User, amount: number) => (
    <Col className="w-full items-start justify-center gap-1">
      {userRow(challenger)}
      <Row className={'w-full items-center justify-center'}>
        <span className={'text-lg'}>
          LOST <span className={'text-red-500'}>{formatMoney(amount)}</span>
        </span>
      </Row>
    </Col>
  )

  const userCol = (
    challenger: User,
    outcome: string,
    prob: number,
    amount: number
  ) => (
    <Col className="w-full items-start justify-center gap-1">
      {userRow(challenger)}
      <Row className={'w-full items-center justify-center'}>
        <span className={'text-lg'}>
          is betting {formatMoney(amount)}
          {' on '}
          <BinaryOutcomeLabel outcome={outcome as any} /> at{' '}
          {Math.round(prob * 100)}%
        </span>
      </Row>
    </Col>
  )
  return (
    <>
      {showConfetti && (
        <Confetti
          width={width ?? 500}
          height={height ?? 500}
          confettiSource={{
            x: ((width ?? 500) - 200) / 2,
            y: 0,
            w: 200,
            h: 0,
          }}
          recycle={false}
          initialVelocityY={{ min: 1, max: 3 }}
          numberOfPieces={200}
        />
      )}
      <Col className=" w-full rounded border-0 border-gray-100 bg-white py-6 pl-1 pr-2 sm:items-center sm:justify-center sm:px-2 md:px-6 md:py-8">
        {!resolution && (
          <Row
            className={
              'items-center justify-center gap-2 text-xl text-gray-600'
            }
          >
            <span className={'text-xl'}>⚔️️</span>
            Challenge Accepted
            <span className={'text-xl'}>⚔️️</span>
          </Row>
        )}
        {resolution == 'YES' || resolution == 'NO' ? (
          <Col
            className={
              'max-h-[60vh] w-full content-between justify-between gap-1'
            }
          >
            <Row className={'mt-4 w-full'}>
              {userWonCol(creatorWon ? creator : user, amountWon)}
            </Row>
            <Row className={'mt-4'}>
              {userLostCol(creatorWon ? user : creator, amountWon)}
            </Row>
          </Col>
        ) : (
          <Col
            className={
              'h-full w-full content-between justify-between gap-1  py-10 sm:flex-row'
            }
          >
            {userCol(
              creator,
              creatorOutcome,
              creatorOutcomeProb,
              creatorAmount
            )}
            <Col className="items-center justify-center py-4 text-xl">VS</Col>
            {userCol(user, yourOutcome, 1 - creatorOutcomeProb, yourCost)}
          </Col>
        )}
        <Spacer h={3} />
        <ChallengeContract contract={contract} bets={bets} />
      </Col>
    </>
  )
}

function ChallengeContract(props: { contract: Contract; bets: Bet[] }) {
  const { contract, bets } = props
  const { question } = contract
  const href = `https://${DOMAIN}${contractPath(contract)}`

  const isBinary = contract.outcomeType === 'BINARY'
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'
  return (
    <Col className="mt-5 w-full flex-1 bg-white px-10">
      <div className="relative flex flex-col pt-2">
        <Row className="justify-between px-3 text-xl text-indigo-700 md:text-2xl">
          <SiteLink href={href}>{question}</SiteLink>
          {isBinary && <BinaryResolutionOrChance contract={contract} />}
          {isPseudoNumeric && (
            <PseudoNumericResolutionOrExpectation contract={contract} />
          )}
        </Row>

        {(isBinary || isPseudoNumeric) && (
          <ContractProbGraph contract={contract} bets={bets} height={400} />
        )}
      </div>
    </Col>
  )
}

function OpenChallengeContent(props: {
  contract: BinaryContract
  challenge: Challenge
  creator: User
  user: User | null | undefined
  bets: Bet[]
}) {
  const { contract, challenge, creator, user } = props
  const { question } = contract
  const {
    creatorAmount,
    creatorId,
    creatorOutcome,
    creatorOutcomeProb,
    yourOutcome,
  } = challenge

  const href = `https://${DOMAIN}${contractPath(contract)}`

  const yourCost =
    ((1 - creatorOutcomeProb) / creatorOutcomeProb) * creatorAmount

  const title = `${creator.name} is challenging you to bet`

  return (
    <Col className="items-center">
      <Col className="h-full rounded bg-white p-4 py-8 sm:p-8 sm:shadow-md">
        <Title className="!mt-0" text={`⚔️ ${title} ⚔️`} />

        <Row className="my-4 justify-center px-8 pb-4 text-lg sm:text-xl">
          <SiteLink href={href}>{question}</SiteLink>
        </Row>

        <Col
          className={
            'h-full max-h-[50vh] w-full content-between justify-between gap-1 sm:flex-row'
          }
        >
          <UserBetColumn
            challenger={creator}
            outcome={creatorOutcome}
            amount={creatorAmount}
          />

          <Col className="items-center justify-center py-8 text-2xl sm:text-4xl">
            VS
          </Col>

          <UserBetColumn
            challenger={user?.id === creatorId ? undefined : user}
            outcome={yourOutcome}
            amount={yourCost}
          />
        </Col>

        <Spacer h={3} />

        <Row className="my-4 w-full items-center justify-center">
          <AcceptChallengeButton
            user={user}
            contract={contract}
            challenge={challenge}
          />
        </Row>
      </Col>
    </Col>
  )
}

function UserBetColumn(props: {
  challenger: User | null | undefined
  outcome: string
  amount: number
}) {
  const { challenger, outcome, amount } = props

  return (
    <Col className="w-full items-start justify-center gap-1">
      {challenger ? (
        userRow(challenger)
      ) : (
        <Row className={'mb-2 w-full items-center justify-center gap-2'}>
          <Avatar size={12} avatarUrl={undefined} username={undefined} />
          <span className={'text-2xl'}>You</span>
        </Row>
      )}
      <Row className={'w-full items-center justify-center'}>
        <span className={'text-lg'}>{challenger ? 'is' : 'are'} betting </span>
      </Row>
      <Row className={'w-full items-center justify-center'}>
        <span className={'text-lg'}>
          <span className="bold text-2xl">{formatMoney(amount)}</span>
          {' on '}
          <span className="bold text-2xl">
            <BinaryOutcomeLabel outcome={outcome as any} />
          </span>{' '}
        </span>
      </Row>
    </Col>
  )
}
