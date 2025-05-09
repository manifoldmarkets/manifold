import clsx from 'clsx'
import { ReactNode, useEffect, useState } from 'react'
import { ChevronRightIcon } from '@heroicons/react/solid'
import { User } from 'common/user'
import {
  AIGeneratedMarket,
  CreateableOutcomeType,
  add_answers_mode,
} from 'common/contract'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { ChoosingContractForm } from './choosing-contract-form'
import { ContractParamsForm } from './contract-params-form'
import {
  getOutcomeTypeAndSumsToOne,
  getContractTypeFromValue,
} from './create-contract-types'
import { capitalize } from 'lodash'
import { track } from 'web/lib/service/analytics'
import { FaMagic, FaQuestion, FaUsers } from 'react-icons/fa'
import { ExpandSection } from 'web/components/explainer-panel'
import { AIMarketSuggestionsPanel } from './ai-market-suggestions-panel'
import { Button } from '../buttons/button'
import { Spacer } from '../layout/spacer'
import { WEEK_MS } from 'common/util/time'
import Router from 'next/router'
import { DocumentTextIcon } from '@heroicons/react/outline'

export type NewQuestionParams = {
  groupIds?: string[]
  groupSlugs?: string[]
  q: string
  description: string
  closeTime: number
  outcomeType?: CreateableOutcomeType
  visibility: string
  // Params for PSEUDO_NUMERIC outcomeType
  min?: number
  max?: number
  isLogScale?: boolean
  initValue?: number
  answers?: string[]
  addAnswersMode?: add_answers_mode
  shouldAnswersSumToOne?: boolean
  precision?: number
  sportsStartTimestamp?: string
  sportsEventId?: string
  sportsLeague?: string
  unit?: string
  midpoints?: number[]
  rand?: string
  overrideKey?: string
}

export type CreateContractStateType =
  | 'choosing contract'
  | 'filling contract params'
  | 'ai chat'

// Allow user to create a new contract
export function NewContractPanel(props: {
  creator: User
  params?: NewQuestionParams
}) {
  const { creator } = props
  const [params, setParams] = useState<Partial<NewQuestionParams> | undefined>(
    props.params
  )
  useEffect(() => {
    if (props.params) {
      setParams(props.params)
      setState(
        props.params.outcomeType
          ? 'filling contract params'
          : 'choosing contract'
      )
    }
  }, [props.params])

  const [state, setState] = useState<CreateContractStateType>(
    params?.outcomeType ? 'filling contract params' : 'choosing contract'
  )
  const setKeyOnParams = (key: keyof NewQuestionParams, value: any) => {
    setParams((prev) => ({ ...(prev ?? {}), [key]: value }))
  }

  // Add function to handle AI suggestions
  const handleAISuggestion = (m: AIGeneratedMarket) => {
    const { outcomeType, shouldSumToOne } = getOutcomeTypeAndSumsToOne(
      m.outcomeType
    )
    setParams({
      q: m.question,
      outcomeType,
      answers: m.answers,
      description: JSON.stringify(m.description),
      closeTime: new Date(m.closeDate).getTime(),
      visibility: 'public',
      shouldAnswersSumToOne: shouldSumToOne,
      addAnswersMode: m.addAnswersMode,
      overrideKey: '',
    })
    setState('filling contract params')
  }

  return (
    <Col
      className={clsx(
        'text-ink-1000 bg-canvas-0 mx-auto w-full max-w-2xl transition-colors'
      )}
    >
      <CreateStepTracker
        outcomeType={params?.outcomeType}
        shouldAnswersSumToOne={params?.shouldAnswersSumToOne}
        setState={setState}
        state={state}
      />
      <Col className={clsx('px-6 py-2')}>
        {state == 'choosing contract' && (
          <>
            <span className="mb-3 text-lg">Create from an idea:</span>
            <Button
              className="hover:ring-primary-200 bg-primary-600/5 cursor-pointer rounded-lg px-4 py-2 text-left transition-all hover:ring-2"
              color="none"
              onClick={() => setState('ai chat')}
            >
              <Row className="w-full items-center justify-start gap-8">
                <FaMagic className="h-10 w-10 text-fuchsia-500" />
                <Col className="w-full items-start gap-0.5">
                  <div className="py-0.5 font-semibold sm:text-lg">
                    AI-assisted creation
                  </div>
                  <span className="text-sm">
                    Get high-quality questions with clear resolution criteria
                    from your prompt
                  </span>
                </Col>
              </Row>
            </Button>
            <Spacer h={4} />
            <ChoosingContractForm
              outcomeType={params?.outcomeType}
              setOutcomeType={(outcomeType) => {
                setKeyOnParams('outcomeType', outcomeType)
              }}
              shouldAnswersSumToOne={params?.shouldAnswersSumToOne}
              setShouldAnswersSumToOne={(bool) => {
                setKeyOnParams('shouldAnswersSumToOne', bool)
              }}
              setState={setState}
            />
            <Spacer h={2} />
            <Button
              className="hover:ring-primary-200 bg-primary-600/5 cursor-pointer rounded-lg px-4 py-2 text-left transition-all hover:ring-2"
              color="none"
              onClick={() => Router.push('/create-post')}
            >
              <Row className="w-full justify-start gap-4">
                <DocumentTextIcon className="h-14 w-14 self-center text-cyan-600" />
                <Col className="w-full items-start gap-0.5">
                  <div className="font-semibold sm:text-lg">Post</div>
                  <span className=" text-left text-sm  ">
                    Share groups of markets, updates, ideas, or stories with the
                    community.
                  </span>
                </Col>
              </Row>
            </Button>
            {creator.createdTime > Date.now() - WEEK_MS && <ExplainerPanel />}
          </>
        )}
        {state === 'ai chat' && (
          <AIMarketSuggestionsPanel onSelectSuggestion={handleAISuggestion} />
        )}
        {state == 'filling contract params' && params?.outcomeType && (
          <ContractParamsForm
            outcomeType={params.outcomeType}
            creator={creator}
            params={params}
          />
        )}
      </Col>
    </Col>
  )
}

function CreateStepTracker(props: {
  outcomeType: CreateableOutcomeType | undefined
  shouldAnswersSumToOne: boolean | undefined
  setState: (state: CreateContractStateType) => void
  state: CreateContractStateType
}) {
  const { outcomeType, shouldAnswersSumToOne, setState, state } = props
  const outcomeKey =
    outcomeType == 'MULTIPLE_CHOICE'
      ? shouldAnswersSumToOne
        ? 'DEPENDENT_MULTIPLE_CHOICE'
        : 'INDEPENDENT_MULTIPLE_CHOICE'
      : outcomeType
  return (
    <Row
      className={clsx(
        'text-ink-400 bg-canvas-0 border-1 border-ink-200 sticky z-10 w-full items-center gap-1 border-b pb-2 pt-4',
        'top-0 px-6'
      )}
    >
      <CreateStepButton onClick={() => setState('choosing contract')}>
        Choose question type
      </CreateStepButton>
      <ChevronRightIcon className={clsx('h-5 w-5')} />
      {state === 'ai chat' ? (
        <CreateStepButton
          disabled={false}
          onClick={() => setState('choosing contract')}
        >
          AI Assistant
        </CreateStepButton>
      ) : (
        <CreateStepButton
          disabled={!outcomeType}
          onClick={() => {
            if (outcomeType) {
              setState('filling contract params')
            }
          }}
        >
          {outcomeKey
            ? capitalize(
                getContractTypeFromValue(
                  outcomeKey as CreateableOutcomeType,
                  'name'
                )
              )
            : ''}
        </CreateStepButton>
      )}
    </Row>
  )
}

function CreateStepButton(props: {
  onClick: () => void
  className?: string
  children: ReactNode
  disabled?: boolean
}) {
  const { onClick, children, className, disabled } = props
  return (
    <button
      className={clsx(
        className,
        'disabled:text-ink-400 text-primary-600 enabled:hover:text-primary-800 transition-all  disabled:cursor-not-allowed'
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

const ExplainerPanel = (props: { className?: string }) => {
  const { className } = props
  const handleSectionClick = (sectionTitle: string) => {
    track('create explainer section click', { sectionTitle })
  }
  return (
    <Col className={clsx('mt-4', className)}>
      <h2 className={clsx('text-ink-600 mb-2 text-xl')}>What is this?</h2>
      <ResolutionPanel onClick={handleSectionClick} />
      <TraderPanel onClick={handleSectionClick} />
    </Col>
  )
}

const ResolutionPanel = ({
  onClick,
}: {
  onClick: (sectionTitle: string) => void
}) => (
  <ExpandSection
    title={
      <Row className="items-start">
        <FaQuestion className="mr-2 mt-[0.25em] flex-shrink-0 align-text-bottom" />{' '}
        Who decides on the answer?
      </Row>
    }
    onClick={() => onClick('Who decides on the answer?')}
  >
    <div className="pb-2">You do!</div>
    <div className="pb-2">
      Isn't this a conflict of interest? If the creator resolves their question
      dishonestly, that will likely be the last question they get traders on.
    </div>
    <div className="pb-2">
      Traders are attracted to markets with clear resolution criteria and
      trustworthy creators. On top of that, mods can step in and re-resolve the
      market if it's clear the creator is being dishonest.
    </div>
  </ExpandSection>
)

const TraderPanel = ({
  onClick,
}: {
  onClick: (sectionTitle: string) => void
}) => (
  <ExpandSection
    title={
      <Row className="items-start">
        <FaUsers className="mr-2 mt-[0.25em] flex-shrink-0 align-text-bottom" />{' '}
        Who will weigh in?
      </Row>
    }
    onClick={() => onClick('Who will weigh in?')}
  >
    <div className="pb-2">Our thousands of daily, active traders.</div>
    <div className="pb-2">
      The traders that have insight into your question will push the probability
      towards the correct answer. The traders that are correct earn more mana
      (our play-money currency), and influence the probability more.
    </div>
  </ExpandSection>
)
