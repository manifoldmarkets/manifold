import clsx from 'clsx'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowRightIcon,
} from '@heroicons/react/outline'
import { sortBy } from 'lodash'

import { CPMMMultiContract, contractPath } from 'common/contract'
import { useLovers } from 'love/hooks/use-lovers'
import { useMatches } from 'love/hooks/use-matches'
import { Col } from 'web/components/layout/col'
import { AddAMatchButton } from './add-a-match-button'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Row } from 'web/components/layout/row'
import { formatMoney, formatPercent } from 'common/util/format'
import { UserLink } from 'web/components/widgets/user-link'
import { Button } from 'web/components/buttons/button'
import { RejectButton } from './reject-button'
import { useUser } from 'web/hooks/use-user'
import { Avatar } from 'web/components/widgets/avatar'
import { MODAL_CLASS, Modal } from 'web/components/layout/modal'
import { BuyPanel } from 'web/components/bet/bet-panel'
import { Subtitle } from 'web/components/widgets/subtitle'
import { linkClass } from 'web/components/widgets/site-link'
import { areGenderCompatible } from 'love/lib/util/gender'
import { track } from 'web/lib/service/analytics'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { getCPMMContractUserContractMetrics } from 'common/supabase/contract-metrics'
import { db } from 'web/lib/supabase/db'
import {
  BinaryOutcomeLabel,
  NoLabel,
  YesLabel,
} from 'web/components/outcome-label'
import { SendMessageButton } from 'web/components/messaging/send-message-button'
import { CommentsButton } from 'web/components/comments/comments-button'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { getCumulativeRelationshipProb } from 'love/lib/util/relationship-market'
import { ControlledTabs } from 'web/components/layout/tabs'
import { Answer } from 'common/answer'
import { ConfirmStageButton } from './confirm-stage-button'
import { useAnswersCpmm } from 'web/hooks/use-answers'
import { Lover } from 'common/love/lover'

const relationshipStages = ['1st date', '2nd date', '3rd date', '6-month']

export const Matches = (props: { userId: string }) => {
  const { userId } = props
  const lovers = useLovers()
  const matches = useMatches(userId)
  const user = useUser()

  const [tabIndex, setTabIndex] = usePersistentInMemoryState(
    0,
    `matches-tab-${userId}`
  )

  const truncatedSize = 5
  const [expanded, setExpanded] = useState(false)

  if (!lovers || !matches) return <LoadingIndicator />

  const lover = lovers.find((lover) => lover.user_id === userId)

  const matchesSet = new Set([
    ...matches.map((contract) => contract.loverUserId1),
    ...matches.map((contract) => contract.loverUserId2),
  ])
  const potentialLovers = lovers
    .filter((l) => l.user_id !== userId)
    .filter((l) => !matchesSet.has(l.user_id))
    .filter((l) => !lover || areGenderCompatible(lover, l))
    .filter((l) => l.looking_for_matches)

  const currentMatches = sortBy(
    matches.filter((c) => !c.isResolved),
    (c) => (c.answers[tabIndex].resolution ? 1 : 0),
    (c) => -1 * c.answers[tabIndex].prob
  )
  const areYourMatches = userId === user?.id

  return (
    <Col className="bg-canvas-0 max-w-lg gap-4 rounded px-2 py-1.5 sm:px-4 sm:py-3">
      {currentMatches.length > 0 ? (
        <Col>
          <div className="text-lg font-semibold">Relationship chances</div>
          <ControlledTabs
            tabs={relationshipStages.map((stage) => ({
              title: stage,
              content: null,
            }))}
            activeIndex={tabIndex}
            onClick={(_title, index) => setTabIndex(index)}
          />

          <Col className="gap-4">
            {(expanded
              ? currentMatches
              : currentMatches.slice(0, truncatedSize)
            ).map((contract) => {
              const matchedLoverId =
                contract.loverUserId1 === userId
                  ? contract.loverUserId2
                  : contract.loverUserId1
              const matchedLover = lovers.find(
                (lover) =>
                  lover.user_id === matchedLoverId && lover.looking_for_matches
              )
              return (
                matchedLover && (
                  <MatchContract
                    key={contract.id}
                    contract={contract}
                    answer={contract.answers[tabIndex]}
                    lover={matchedLover}
                    isYourMatch={areYourMatches}
                    previousStage={relationshipStages[tabIndex - 1]}
                    stage={relationshipStages[tabIndex]}
                  />
                )
              )
            })}
          </Col>
          {!expanded && currentMatches.length > truncatedSize && (
            <Button
              className="self-start"
              size="xs"
              color="indigo-outline"
              onClick={() => setExpanded(true)}
            >
              Show {currentMatches.length - truncatedSize} more
            </Button>
          )}
        </Col>
      ) : (
        <span className={'text-ink-500 text-sm'}>No matches yet.</span>
      )}

      {lover && (
        <AddAMatchButton lover={lover} potentialLovers={potentialLovers} />
      )}
    </Col>
  )
}

const MatchContract = (props: {
  contract: CPMMMultiContract
  answer: Answer
  lover: Lover
  isYourMatch: boolean
  previousStage: string | undefined
  stage: string
}) => {
  const { lover, isYourMatch, previousStage, stage } = props
  const contract = (useFirebasePublicContract(
    props.contract.visibility,
    props.contract.id
  ) ?? props.contract) as CPMMMultiContract
  const answers = useAnswersCpmm(contract.id)
  contract.answers = answers && answers.length > 0 ? answers : contract.answers
  const answer = answers
    ? answers.find((a) => a.id === props.answer.id) ?? props.answer
    : props.answer

  const { user, pinned_url } = lover
  const currentUser = useUser()
  const prevAnswer = contract.answers[answer.index - 1]
  const showConfirmStage =
    !answer.resolution && (!prevAnswer || prevAnswer.resolution === 'YES')

  const conditionProb =
    answer.index && getCumulativeRelationshipProb(contract, answer.index - 1)

  const [positions, setPositions] = usePersistentInMemoryState<
    undefined | Awaited<ReturnType<typeof getCPMMContractUserContractMetrics>>
  >(undefined, 'market-card-feed-positions-' + contract.id)
  useEffect(() => {
    getCPMMContractUserContractMetrics(contract.id, 10, answer.id, db).then(
      (positions) => {
        const yesPositions = sortBy(
          positions.YES.filter(
            (metric) => metric.userUsername !== 'ManifoldLove'
          ),
          (metric) => metric.invested
        ).reverse()
        const noPositions = sortBy(
          positions.NO.filter(
            (metric) => metric.userUsername !== 'ManifoldLove'
          ),
          (metric) => metric.invested
        ).reverse()
        setPositions({ YES: yesPositions, NO: noPositions })
      }
    )
  }, [contract.id, answer.id])

  const [expanded, setExpanded] = useState(false)

  return (
    <Col>
      {previousStage ? (
        <Link href={contractPath(contract)}>
          <Row className="text-ink-600 bg-canvas-50 items-center justify-between gap-2 px-2 py-1 text-sm">
            <div>
              Assuming {previousStage.toLowerCase()} (
              {formatPercent(conditionProb)} chance)
            </div>
            <ArrowRightIcon className="h-4 w-4" />
          </Row>
        </Link>
      ) : (
        <div className="mt-2" />
      )}
      <Row
        className="items-center justify-between gap-2"
        onClick={() => setExpanded((b) => !b)}
      >
        {pinned_url && (
          <Avatar avatarUrl={pinned_url} username={user.username} />
        )}
        <UserLink
          className="truncate"
          name={user.name}
          username={user.username}
          hideBadge
        />
        <div className="flex-1" />
        <CommentsButton
          className="min-w-[36px]"
          contract={contract}
          user={currentUser}
        />
        {answer.resolution ? (
          <div>
            Resolved <BinaryOutcomeLabel outcome={answer.resolution} />
          </div>
        ) : (
          <>
            <BetButton contract={contract} answer={answer} lover={lover} />
            <div className="font-semibold">{formatPercent(answer.prob)}</div>
          </>
        )}
        {expanded ? (
          <ChevronUpIcon className={'mr-2 h-4 w-4'} />
        ) : (
          <ChevronDownIcon className={'mr-2 h-4 w-4'} />
        )}
      </Row>

      {expanded && isYourMatch && (
        <Row className="mt-2 justify-between gap-2">
          <Row className="gap-2">
            {showConfirmStage && (
              <ConfirmStageButton
                lover={lover}
                stage={stage}
                contractId={contract.id}
                answerId={answer.id}
              />
            )}
            <RejectButton lover={lover} />
          </Row>
          <SendMessageButton toUser={user} currentUser={currentUser} />
        </Row>
      )}

      {expanded && positions && (
        <Row className="mb-2 mt-2 max-w-full gap-6 overflow-hidden sm:gap-8">
          <Col className="w-[50%] gap-2">
            <div>
              Invested in <YesLabel />
            </div>
            {positions.YES.length === 0 && (
              <div className="text-ink-500">None</div>
            )}
            {positions.YES.map((position) => (
              <Row key={position.userId} className="justify-between gap-4">
                <Row className="items-center gap-2">
                  {pinned_url && (
                    <Avatar
                      avatarUrl={position.userAvatarUrl}
                      username={position.userUsername}
                      size="xs"
                    />
                  )}
                  <UserLink
                    name={position.userName}
                    username={position.userUsername}
                    hideBadge
                    short
                  />
                </Row>
                <div>{formatMoney(position.invested)}</div>
              </Row>
            ))}
          </Col>
          <Col className="w-[50%] gap-2">
            <div>
              Invested in <NoLabel />
            </div>
            {positions.NO.length === 0 && (
              <div className="text-ink-500">None</div>
            )}
            {positions.NO.map((position) => (
              <Row key={position.userId} className="justify-between gap-4">
                <Row className="items-center gap-2">
                  {pinned_url && (
                    <Avatar
                      avatarUrl={position.userAvatarUrl}
                      username={position.userUsername}
                      size="xs"
                    />
                  )}
                  <UserLink
                    name={position.userName}
                    username={position.userUsername}
                    hideBadge
                    short
                  />
                </Row>
                <div>{formatMoney(position.invested)}</div>
              </Row>
            ))}
          </Col>
        </Row>
      )}
    </Col>
  )
}

const BetButton = (props: {
  contract: CPMMMultiContract
  answer: Answer
  lover: Lover
}) => {
  const { contract, answer } = props
  const { answers } = contract

  const user = useUser()
  const [open, setOpen] = useState(false)
  const [outcome, setOutcome] = useState<'YES' | 'NO'>('YES')

  return (
    <>
      <Row className="gap-1">
        <Button
          size="xs"
          color="green-outline"
          onClick={(e) => {
            e.stopPropagation()
            setOutcome('YES')
            setOpen(true)
            track('love bet yes button click')
          }}
        >
          Yes
        </Button>
        <Button
          size="xs"
          color="red-outline"
          onClick={(e) => {
            e.stopPropagation()
            setOutcome('NO')
            setOpen(true)
            track('love bet no button click')
          }}
        >
          No
        </Button>
      </Row>
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
            initialOutcome={outcome}
            onBuySuccess={() => setTimeout(() => setOpen(false), 500)}
            location={'love profile'}
            inModal={true}
          />
        </Col>
      </Modal>
    </>
  )
}
