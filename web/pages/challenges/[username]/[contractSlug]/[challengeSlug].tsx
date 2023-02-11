import React, { useEffect, useState } from 'react'
import Confetti from 'react-confetti'

import { contractPath, getContractFromSlug } from 'web/lib/firebase/contracts'
import { DOMAIN, ENV_CONFIG } from 'common/envs/constants'
import { Col } from 'web/components/layout/col'
import { SiteLink } from 'web/components/widgets/site-link'
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
import { Page } from 'web/components/layout/page'
import { useUser, useUserById } from 'web/hooks/use-user'
import { AcceptChallengeButton } from 'web/components/challenges/accept-challenge-button'
import { Avatar } from 'web/components/widgets/avatar'
import { BinaryOutcomeLabel } from 'web/components/outcome-label'
import { formatMoney } from 'common/util/format'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useWindowSize } from 'web/hooks/use-window-size'
import { Bet } from 'web/lib/firebase/bets'
import Custom404 from 'web/pages/404'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { BinaryContract } from 'common/contract'
import { Title } from 'web/components/widgets/title'
import { UserLink } from 'web/components/widgets/user-link'
import { useContract } from 'web/hooks/use-contracts'
import { getBets } from 'web/lib/supabase/bets'

export async function getStaticProps(props: {
  params: { username: string; contractSlug: string; challengeSlug: string }
}) {
  const { username, contractSlug, challengeSlug } = props.params
  const contract = (await getContractFromSlug(contractSlug)) || null
  const user = (await getUserByUsername(username)) || null
  const bets = contract?.id ? await getBets({ contractId: contract.id }) : []
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
  const contract = (useContract(props.contract?.id) ??
    props.contract) as BinaryContract | null

  const challenge =
    useChallenge(props.challengeSlug, contract?.id) ?? props.challenge

  const { user, bets } = props
  const currentUser = useUser()

  useSaveReferral(currentUser, {
    defaultReferrerUsername: challenge?.creatorUsername,
    contractId: challenge?.contractId,
  })

  if (!contract || !challenge) return <Custom404 />

  return (
    <Page>
      {challenge.acceptances.length >= challenge.maxUses ? (
        <ClosedChallengeContent
          contract={contract}
          challenge={challenge}
          creator={user}
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

      <FAQ />
    </Page>
  )
}

function FAQ() {
  const [toggleWhatIsThis, setToggleWhatIsThis] = useState(false)
  const [toggleWhatIsMana, setToggleWhatIsMana] = useState(false)
  return (
    <Col className={'items-center gap-4 p-2 md:p-6 lg:items-start'}>
      <Row className={'text-xl text-indigo-700'}>FAQ</Row>
      <Row className={'text-lg text-indigo-700'}>
        <span
          className={'mx-2 cursor-pointer'}
          onClick={() => setToggleWhatIsThis(!toggleWhatIsThis)}
        >
          {toggleWhatIsThis ? '-' : '+'}
          What is this?
        </span>
      </Row>
      {toggleWhatIsThis && (
        <Row className={'mx-4'}>
          <span>
            This is a challenge bet, or a bet offered from one person to another
            that is only realized if both parties agree. You can agree to the
            challenge (if it's open) or create your own from a market page. See
            more markets{' '}
            <SiteLink className={'font-bold'} href={'/home'}>
              here.
            </SiteLink>
          </span>
        </Row>
      )}
      <Row className={'text-lg text-indigo-700'}>
        <span
          className={'mx-2 cursor-pointer'}
          onClick={() => setToggleWhatIsMana(!toggleWhatIsMana)}
        >
          {toggleWhatIsMana ? '-' : '+'}
          What is {ENV_CONFIG.moneyMoniker}?
        </span>
      </Row>
      {toggleWhatIsMana && (
        <Row className={'mx-4'}>
          Mana ({ENV_CONFIG.moneyMoniker}) is the play-money used by our
          platform to keep track of your bets. It's completely free to get
          started, and you can donate your winnings to charity!
        </Row>
      )}
    </Col>
  )
}

function ClosedChallengeContent(props: {
  contract: BinaryContract
  challenge: Challenge
  creator: User
}) {
  const { contract, challenge, creator } = props
  const { resolution, question } = contract
  const {
    acceptances,
    creatorAmount,
    creatorOutcome,
    acceptorOutcome,
    acceptorAmount,
  } = challenge

  const user = useUserById(acceptances[0].userId)

  const [showConfetti, setShowConfetti] = useState(false)
  const { width = 500, height = 500 } = useWindowSize()
  useEffect(() => {
    if (acceptances.length === 0) return
    if (acceptances[0].createdTime > Date.now() - 1000 * 60)
      setShowConfetti(true)
  }, [acceptances])

  const creatorWon = resolution === creatorOutcome

  const href = `https://${DOMAIN}${contractPath(contract)}`

  if (!user) return <LoadingIndicator />

  const winner = (creatorWon ? creator : user).name

  return (
    <>
      {showConfetti && (
        <Confetti
          width={width}
          height={height}
          confettiSource={{
            x: (width - 200) / 2,
            y: 0,
            w: 200,
            h: 0,
          }}
          recycle={false}
          initialVelocityY={{ min: 1, max: 3 }}
          numberOfPieces={200}
        />
      )}
      <Col className=" w-full items-center justify-center rounded border-0 border-gray-100 bg-white py-6 pl-1 pr-2 sm:px-2 md:px-6 md:py-8 ">
        {resolution ? (
          <>
            <Title>🥇 {winner} wins the bet 🥇</Title>
            <SiteLink href={href} className={'mb-8 text-xl'}>
              {question}
            </SiteLink>
          </>
        ) : (
          <SiteLink href={href} className={'mb-8'}>
            <span className="text-3xl text-indigo-700">{question}</span>
          </SiteLink>
        )}
        <Col
          className={'w-full content-between justify-between gap-1 sm:flex-row'}
        >
          <UserBetColumn
            challenger={creator}
            outcome={creatorOutcome}
            amount={creatorAmount}
            isResolved={!!resolution}
          />

          <Col className="items-center justify-center py-8 text-2xl sm:text-4xl">
            VS
          </Col>

          <UserBetColumn
            challenger={user?.id === creator.id ? undefined : user}
            outcome={acceptorOutcome}
            amount={acceptorAmount}
            isResolved={!!resolution}
          />
        </Col>
        <Spacer h={3} />

        {/* <Row className="mt-8 items-center">
          <span className='mr-4'>Share</span> <CopyLinkButton url={window.location.href} />
        </Row> */}
      </Col>
    </>
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
    acceptorAmount,
    acceptorOutcome,
  } = challenge

  const href = `https://${DOMAIN}${contractPath(contract)}`

  return (
    <Col className="items-center">
      <Col className="h-full items-center justify-center rounded bg-white p-4 py-8 sm:p-8 sm:shadow-md">
        <SiteLink href={href} className={'mb-8'}>
          <span className="text-3xl text-indigo-700">{question}</span>
        </SiteLink>

        <Col
          className={
            ' w-full content-between justify-between gap-1 sm:flex-row'
          }
        >
          <UserBetColumn
            challenger={creator}
            outcome={creatorOutcome}
            amount={creatorAmount}
          />

          <Col className="items-center justify-center py-4 text-2xl sm:py-8 sm:text-4xl">
            VS
          </Col>

          <UserBetColumn
            challenger={user?.id === creatorId ? undefined : user}
            outcome={acceptorOutcome}
            amount={acceptorAmount}
          />
        </Col>

        <Spacer h={3} />
        <Row className={'my-4 text-center text-gray-500'}>
          <span>
            {`${creator.name} will bet ${formatMoney(
              creatorAmount
            )} on ${creatorOutcome} if you bet ${formatMoney(
              acceptorAmount
            )} on ${acceptorOutcome}. Whoever is right will get `}
            <span className="mr-1 font-bold ">
              {formatMoney(creatorAmount + acceptorAmount)}
            </span>
            total.
          </span>
        </Row>

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

const userCol = (challenger: User) => (
  <Col className={'mb-2 w-full items-center justify-center gap-2'}>
    <UserLink
      className={'text-2xl'}
      name={challenger.name}
      username={challenger.username}
    />
    <Avatar
      size={24}
      avatarUrl={challenger.avatarUrl}
      username={challenger.username}
    />
  </Col>
)

function UserBetColumn(props: {
  challenger: User | null | undefined
  outcome: string
  amount: number
  isResolved?: boolean
}) {
  const { challenger, outcome, amount, isResolved } = props

  return (
    <Col className="w-full items-start justify-center gap-1">
      {challenger ? (
        userCol(challenger)
      ) : (
        <Col className={'mb-2 w-full items-center justify-center gap-2'}>
          <span className={'text-2xl'}>You</span>
          <Avatar
            className={'h-[7.25rem] w-[7.25rem]'}
            avatarUrl={undefined}
            username={undefined}
          />
        </Col>
      )}
      <Row className={'w-full items-center justify-center'}>
        <span className={'text-lg'}>
          {isResolved ? 'had bet' : challenger ? '' : ''}
        </span>
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
