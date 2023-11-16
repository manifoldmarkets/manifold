import { useState } from 'react'

import { UserIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Answer } from 'common/answer'
import { CPMMMultiContract } from 'common/contract'
import { Lover } from 'common/love/lover'
import Image from 'next/image'
import Link from 'next/link'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { useAnswersCpmm } from 'web/hooks/use-answers'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { useUser } from 'web/hooks/use-user'

import { contractPath } from 'common/contract'
import { BuyPanel } from 'web/components/bet/bet-panel'
import { MODAL_CLASS, Modal } from 'web/components/layout/modal'
import { linkClass } from 'web/components/widgets/site-link'
import { Subtitle } from 'web/components/widgets/subtitle'
import { User } from 'common/user'
import { formatPercent } from 'common/util/format'
import { Button } from 'web/components/buttons/button'
import { track } from 'web/lib/service/analytics'
import { Spacer } from 'web/components/layout/spacer'
import { CommentsButton } from 'web/components/comments/comments-button'
import { MatchTracker } from './match-tracker'

const relationshipStages = [
  '1st date',
  '2nd date',
  '3rd date',
  '6 month relationship',
]

export const MatchTile = (props: {
  contract: CPMMMultiContract
  answers: Answer[]
  lover: Lover
  isYourMatch: boolean
}) => {
  const { lover, isYourMatch } = props
  const contract = (useFirebasePublicContract(
    props.contract.visibility,
    props.contract.id
  ) ?? props.contract) as CPMMMultiContract
  const fetchedAnswers = useAnswersCpmm(contract.id)
  const answers = fetchedAnswers ?? props.answers

  const { user, pinned_url } = lover
  const currentUser = useUser()

  const lastResolved = answers.reduce((acc, answer, index) => {
    return answer.resolution !== undefined ? index : acc
  }, -1)

  const [stage, setStage] = useState(lastResolved + 1)
  const [open, setOpen] = useState(false)
  const answer = answers[stage]
  //   const showConfirmStage =
  //     !answer.resolution && (!prevAnswer || prevAnswer.resolution === 'YES')

  //   const conditionProb =
  //     answer.index && getCumulativeRelationshipProb(contract, answer.index - 1)

  //   const [positions, setPositions] = usePersistentInMemoryState<
  //     undefined | Awaited<ReturnType<typeof getCPMMContractUserContractMetrics>>
  //   >(undefined, 'market-card-feed-positions-' + contract.id)
  //   useEffect(() => {
  //     getCPMMContractUserContractMetrics(contract.id, 10, answer.id, db).then(
  //       (positions) => {
  //         const yesPositions = sortBy(
  //           positions.YES.filter(
  //             (metric) => metric.userUsername !== 'ManifoldLove'
  //           ),
  //           (metric) => metric.invested
  //         ).reverse()
  //         const noPositions = sortBy(
  //           positions.NO.filter(
  //             (metric) => metric.userUsername !== 'ManifoldLove'
  //           ),
  //           (metric) => metric.invested
  //         ).reverse()
  //         setPositions({ YES: yesPositions, NO: noPositions })
  //       }
  //     )
  //   }, [contract.id, answer.id])

  const firstDateDate = answer.text
    .substring(answer.text.indexOf('by'), answer.text.length - 1)
    .trim()

  return (
    <Col className=" overflow-hidden rounded drop-shadow">
      <Col className="relative h-40 overflow-hidden">
        {pinned_url ? (
          <Image
            src={pinned_url}
            // You must set these so we don't pay an extra $1k/month to vercel
            width={180}
            height={240}
            alt={`${user.username}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <Col className="bg-ink-300 h-full w-full items-center justify-center">
            <UserIcon className="h-20 w-20" />
          </Col>
        )}
        <BetModal
          open={open}
          setOpen={setOpen}
          contract={contract}
          answer={answer}
          answers={answers}
          user={user}
        />
      </Col>
      <Col className="bg-canvas-0 text-ink-1000 grow justify-between p-2 text-sm">
        <Col className="gap-2">
          <MatchTracker
            lastResolved={lastResolved}
            stage={stage}
            setStage={setStage}
          />
          <Row className="w-full justify-between">
            <Col>
              <span>
                Chance of{' '}
                <span className="font-semibold">
                  {relationshipStages[stage]}
                </span>
              </span>
              <div className="text-ink-500 text-xs">
                {stage === 0 ? (
                  <> {firstDateDate}</>
                ) : (
                  <> if {relationshipStages[stage - 1]} happens</>
                )}
              </div>
            </Col>
            <div className="font-semibold">{formatPercent(answer.prob)}</div>
          </Row>
        </Col>
        <Row className="w-full items-center justify-end gap-2">
          <CommentsButton contract={contract} user={currentUser} />
          <Button
            size={'2xs'}
            color={'indigo-outline'}
            onClick={() => {
              setOpen(true)
              track('love bet button click')
            }}
          >
            Bet
          </Button>
        </Row>
      </Col>
    </Col>
  )
}

function BetModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  contract: CPMMMultiContract
  answer: Answer
  answers: Answer[]
  user: User
}) {
  const { open, setOpen, contract, answer, answers, user } = props
  return (
    <Modal
      open={open}
      setOpen={setOpen}
      className={clsx(
        MODAL_CLASS,
        'pointer-events-auto max-h-[32rem] overflow-auto'
      )}
    >
      <Col>
        <Link href={contractPath(contract)}>
          <Subtitle className={clsx('!mb-4 !mt-0 !text-xl', linkClass)}>
            {answer.text}
          </Subtitle>
        </Link>
        <BuyPanel
          contract={contract}
          multiProps={{ answers, answerToBuy: answer }}
          user={user}
          initialOutcome="YES"
          onBuySuccess={() => setTimeout(() => setOpen(false), 500)}
          location={'love profile'}
          inModal={true}
        />
      </Col>
    </Modal>
  )
}
