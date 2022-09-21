import { sortBy, partition, sum } from 'lodash'
import { useEffect, useState } from 'react'

import { FreeResponseContract, MultipleChoiceContract } from 'common/contract'
import { Col } from '../layout/col'
import { useUser } from 'web/hooks/use-user'
import { getDpmOutcomeProbability } from 'common/calculate-dpm'
import { useAnswers } from 'web/hooks/use-answers'
import { tradingAllowed } from 'web/lib/firebase/contracts'
import { AnswerItem } from './answer-item'
import { CreateAnswerPanel } from './create-answer-panel'
import { AnswerResolvePanel } from './answer-resolve-panel'
import { Spacer } from '../layout/spacer'
import { getOutcomeProbability } from 'common/calculate'
import { Answer } from 'common/answer'
import clsx from 'clsx'
import { formatPercent } from 'common/util/format'
import { Modal } from 'web/components/layout/modal'
import { AnswerBetPanel } from 'web/components/answers/answer-bet-panel'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/avatar'
import { Linkify } from 'web/components/linkify'
import { BuyButton } from 'web/components/yes-no-selector'
import { UserLink } from 'web/components/user-link'
import { Button } from 'web/components/button'
import { useAdmin } from 'web/hooks/use-admin'
import { needsAdminToResolve } from 'web/pages/[username]/[contractSlug]'

export function AnswersPanel(props: {
  contract: FreeResponseContract | MultipleChoiceContract
}) {
  const isAdmin = useAdmin()
  const { contract } = props
  const { creatorId, resolution, resolutions, totalBets, outcomeType } =
    contract
  const [showAllAnswers, setShowAllAnswers] = useState(false)

  const answers = (useAnswers(contract.id) ?? contract.answers).filter(
    (a) => a.number != 0 || contract.outcomeType === 'MULTIPLE_CHOICE'
  )
  const [winningAnswers, notWinningAnswers] = partition(
    answers,
    (a) => a.id === resolution || (resolutions && resolutions[a.id])
  )
  const [visibleAnswers, invisibleAnswers] = partition(
    sortBy(notWinningAnswers, (a) => -getOutcomeProbability(contract, a.id)),
    (a) => showAllAnswers || totalBets[a.id] > 0
  )

  const user = useUser()

  const [resolveOption, setResolveOption] = useState<
    'CHOOSE' | 'CHOOSE_MULTIPLE' | 'CANCEL' | undefined
  >()
  const [chosenAnswers, setChosenAnswers] = useState<{
    [answerId: string]: number
  }>({})

  const chosenTotal = sum(Object.values(chosenAnswers))

  const onChoose = (answerId: string, prob: number) => {
    if (resolveOption === 'CHOOSE') {
      setChosenAnswers({ [answerId]: prob })
    } else {
      setChosenAnswers((chosenAnswers) => {
        return {
          ...chosenAnswers,
          [answerId]: prob,
        }
      })
    }
  }

  const onDeselect = (answerId: string) => {
    setChosenAnswers((chosenAnswers) => {
      const newChosenAnswers = { ...chosenAnswers }
      delete newChosenAnswers[answerId]
      return newChosenAnswers
    })
  }

  useEffect(() => {
    setChosenAnswers({})
  }, [resolveOption])

  const showChoice = resolution
    ? undefined
    : resolveOption === 'CHOOSE'
    ? 'radio'
    : resolveOption === 'CHOOSE_MULTIPLE'
    ? 'checkbox'
    : undefined

  return (
    <Col className="gap-3">
      {(resolveOption || resolution) &&
        sortBy(winningAnswers, (a) => -(resolutions?.[a.id] ?? 0)).map((a) => (
          <AnswerItem
            key={a.id}
            answer={a}
            contract={contract}
            showChoice={showChoice}
            chosenProb={chosenAnswers[a.id]}
            totalChosenProb={chosenTotal}
            onChoose={onChoose}
            onDeselect={onDeselect}
          />
        ))}

      {!resolveOption && (
        <Col
          className={clsx(
            'gap-2 pr-2 md:pr-0',
            tradingAllowed(contract) ? '' : '-mb-6'
          )}
        >
          {visibleAnswers.map((a) => (
            <OpenAnswer key={a.id} answer={a} contract={contract} />
          ))}
          {invisibleAnswers.length > 0 && !showAllAnswers && (
            <Button
              className="self-end"
              color="gray-white"
              onClick={() => setShowAllAnswers(true)}
              size="md"
            >
              Show More
            </Button>
          )}
        </Col>
      )}

      {answers.length === 0 && (
        <div className="pb-4 text-gray-500">No answers yet...</div>
      )}

      {outcomeType === 'FREE_RESPONSE' &&
        tradingAllowed(contract) &&
        (!resolveOption || resolveOption === 'CANCEL') && (
          <CreateAnswerPanel contract={contract} />
        )}

      {(user?.id === creatorId || (isAdmin && needsAdminToResolve(contract))) &&
        !resolution && (
          <>
            <Spacer h={2} />
            <AnswerResolvePanel
              isAdmin={isAdmin}
              isCreator={user?.id === creatorId}
              contract={contract}
              resolveOption={resolveOption}
              setResolveOption={setResolveOption}
              chosenAnswers={chosenAnswers}
            />
          </>
        )}
    </Col>
  )
}

function OpenAnswer(props: {
  contract: FreeResponseContract | MultipleChoiceContract
  answer: Answer
}) {
  const { answer, contract } = props
  const { username, avatarUrl, name, text } = answer
  const prob = getDpmOutcomeProbability(contract.totalShares, answer.id)
  const probPercent = formatPercent(prob)
  const [open, setOpen] = useState(false)

  return (
    <Col className="border-base-200 bg-base-200 relative flex-1 rounded-md px-2">
      <Modal open={open} setOpen={setOpen} position="center">
        <AnswerBetPanel
          answer={answer}
          contract={contract}
          closePanel={() => setOpen(false)}
          className="sm:max-w-84 !rounded-md bg-white !px-8 !py-6"
          isModal={true}
        />
      </Modal>

      <div
        className="pointer-events-none absolute -mx-2 h-full rounded-tl-md bg-green-600 bg-opacity-10"
        style={{ width: `${100 * Math.max(prob, 0.01)}%` }}
      />

      <Row className="my-4 gap-3">
        <Avatar className="mx-1" username={username} avatarUrl={avatarUrl} />
        <Col className="min-w-0 flex-1 lg:gap-1">
          <div className="text-sm text-gray-500">
            <UserLink username={username} name={name} /> answered
          </div>

          <Col className="align-items justify-between gap-4 sm:flex-row">
            <Linkify className="whitespace-pre-line text-lg" text={text} />
            <Row className="align-items items-center justify-end gap-4">
              <span
                className={clsx(
                  'text-2xl',
                  tradingAllowed(contract) ? 'text-primary' : 'text-gray-500'
                )}
              >
                {probPercent}
              </span>
              <BuyButton
                className={clsx(
                  'btn-sm flex-initial !px-6 sm:flex',
                  tradingAllowed(contract) ? '' : '!hidden'
                )}
                onClick={() => setOpen(true)}
              />
            </Row>
          </Col>
        </Col>
      </Row>
    </Col>
  )
}
