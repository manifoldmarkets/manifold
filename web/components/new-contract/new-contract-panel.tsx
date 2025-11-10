import { ChevronRightIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { usePathname } from 'next/navigation'
import { useRouter } from 'next/router'
import { ReactNode, useEffect, useState } from 'react'

import { DocumentTextIcon } from '@heroicons/react/outline'
import {
  AIGeneratedMarket,
  CreateableOutcomeType,
  add_answers_mode,
} from 'common/contract'
import { User } from 'common/user'
import { WEEK_MS } from 'common/util/time'
import { capitalize } from 'lodash'
import { FaMagic, FaQuestion, FaUsers } from 'react-icons/fa'
import { ExpandSection } from 'web/components/explainer-panel'
import { useDefinedSearchParams } from 'web/hooks/use-defined-search-params'
import { track } from 'web/lib/service/analytics'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Spacer } from '../layout/spacer'
import { AIMarketSuggestionsPanel } from './ai-market-suggestions-panel'
import { ChoosingContractForm } from './choosing-contract-form'
import { ContractParamsForm } from './contract-params-form'
import {
  ALL_CONTRACT_TYPES,
  getContractTypeFromValue,
  getOutcomeTypeAndSumsToOne,
} from './create-contract-types'

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

// Helper to convert between URL type param and outcomeType + shouldAnswersSumToOne
type QuestionTypeKey = keyof typeof ALL_CONTRACT_TYPES

function getTypeFromUrl(typeParam: string | null): {
  outcomeType: CreateableOutcomeType | undefined
  shouldAnswersSumToOne: boolean | undefined
} {
  if (!typeParam)
    return { outcomeType: undefined, shouldAnswersSumToOne: undefined }

  const upperType = typeParam.toUpperCase() as QuestionTypeKey
  if (upperType in ALL_CONTRACT_TYPES) {
    const { outcomeType, shouldSumToOne } =
      getOutcomeTypeAndSumsToOne(upperType)
    return { outcomeType, shouldAnswersSumToOne: shouldSumToOne }
  }

  return { outcomeType: undefined, shouldAnswersSumToOne: undefined }
}

function getUrlFromType(
  outcomeType: CreateableOutcomeType | undefined,
  shouldAnswersSumToOne: boolean | undefined
): string | null {
  if (!outcomeType) return null

  if (outcomeType === 'MULTIPLE_CHOICE') {
    return shouldAnswersSumToOne
      ? 'dependent_multiple_choice'
      : 'independent_multiple_choice'
  }

  // Find matching type in ALL_CONTRACT_TYPES
  const matchingType = Object.entries(ALL_CONTRACT_TYPES).find(
    ([_, config]) => {
      if (config.outcomeType !== outcomeType) return false
      if ('shouldSumToOne' in config) {
        return config.shouldSumToOne === shouldAnswersSumToOne
      }
      return true
    }
  )

  return matchingType ? matchingType[0].toLowerCase() : null
}

// Allow user to create a new contract
export function NewContractPanel(props: {
  creator: User
  params?: NewQuestionParams
}) {
  const { creator } = props
  const router = useRouter()
  const pathName = usePathname()
  const { searchParams } = useDefinedSearchParams()

  // Get type from URL
  const urlType = searchParams.get('type')
  const typeFromUrl = getTypeFromUrl(urlType)

  // Initialize params with URL type if present, or props.params
  const [params, setParams] = useState<Partial<NewQuestionParams> | undefined>(
    () => {
      if (props.params?.outcomeType) {
        return props.params
      } else if (typeFromUrl.outcomeType) {
        return {
          ...props.params,
          outcomeType: typeFromUrl.outcomeType,
          shouldAnswersSumToOne: typeFromUrl.shouldAnswersSumToOne,
        }
      }
      return props.params
    }
  )

  const [state, setState] = useState<CreateContractStateType>(() => {
    if (props.params?.outcomeType || typeFromUrl.outcomeType) {
      return 'filling contract params'
    }
    return 'choosing contract'
  })

  // Update params when props.params changes (for duplicate functionality)
  useEffect(() => {
    if (props.params && Object.keys(props.params).length > 0) {
      setParams(props.params)
      setState(
        props.params.outcomeType
          ? 'filling contract params'
          : 'choosing contract'
      )
    }
  }, [props.params])

  // Update state when URL type parameter changes (for back/forward navigation)
  useEffect(() => {
    const typeFromUrl = getTypeFromUrl(searchParams.get('type'))

    if (typeFromUrl.outcomeType) {
      // URL has a type - show that type
      setParams((prev) => ({
        ...(prev ?? {}),
        outcomeType: typeFromUrl.outcomeType,
        shouldAnswersSumToOne: typeFromUrl.shouldAnswersSumToOne,
      }))
      setState('filling contract params')
    } else if (!searchParams.get('type') && !props.params?.outcomeType) {
      // No type in URL and no params from props - go back to choosing
      setParams((prev) => {
        if (!prev) return prev
        const {
          outcomeType: _outcomeType,
          shouldAnswersSumToOne: _shouldAnswersSumToOne,
          ...rest
        } = prev
        return Object.keys(rest).length > 0 ? rest : undefined
      })
      setState('choosing contract')
    }
  }, [searchParams, props.params?.outcomeType])

  const setKeyOnParams = (key: keyof NewQuestionParams, value: any) => {
    setParams((prev) => ({ ...(prev ?? {}), [key]: value }))
  }

  // Update URL when outcomeType changes
  const setOutcomeTypeWithUrl = (
    outcomeType: CreateableOutcomeType,
    shouldAnswersSumToOne: boolean
  ) => {
    setKeyOnParams('outcomeType', outcomeType)
    setKeyOnParams('shouldAnswersSumToOne', shouldAnswersSumToOne)

    const urlType = getUrlFromType(outcomeType, shouldAnswersSumToOne)
    if (urlType) {
      // Preserve existing params (like duplicate question params) and add/update type
      const newParams = new URLSearchParams(searchParams as any)
      newParams.set('type', urlType)
      const newUrl = pathName + '?' + newParams.toString()
      router.push(newUrl, undefined, { shallow: true })
    }
  }

  // Clear all URL parameters and local state when going back to choosing
  const clearTypeAndGoBackToChoosing = () => {
    // Clear all params from local state
    setParams(undefined)

    // Clear all URL parameters (use push to preserve history)
    router.push(pathName, undefined, { shallow: true })

    // Set state to choosing
    setState('choosing contract')
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
    setOutcomeTypeWithUrl(outcomeType, shouldSumToOne)
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
        clearTypeAndGoBackToChoosing={clearTypeAndGoBackToChoosing}
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
              setOutcomeType={(outcomeType, shouldAnswersSumToOne) => {
                setOutcomeTypeWithUrl(outcomeType, shouldAnswersSumToOne)
              }}
              shouldAnswersSumToOne={params?.shouldAnswersSumToOne}
              setState={setState}
            />
            <Spacer h={2} />
            <Button
              className="hover:ring-primary-200 bg-primary-600/5 cursor-pointer rounded-lg px-4 py-2 text-left transition-all hover:ring-2"
              color="none"
              onClick={() => router.push('/create-post')}
            >
              <Row className="4 w-full justify-start  gap-3">
                <DocumentTextIcon className="h-14 w-14 self-center text-cyan-600" />
                <Col className="w-full items-start gap-0.5">
                  <div className="text-base font-semibold sm:text-lg">
                    Discussion Post
                  </div>
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
  clearTypeAndGoBackToChoosing: () => void
}) {
  const {
    outcomeType,
    shouldAnswersSumToOne,
    setState,
    state,
    clearTypeAndGoBackToChoosing,
  } = props
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
      <CreateStepButton
        onClick={() => {
          clearTypeAndGoBackToChoosing()
        }}
      >
        Choose question type
      </CreateStepButton>
      <ChevronRightIcon className={clsx('h-5 w-5')} />
      {state === 'ai chat' ? (
        <CreateStepButton
          disabled={false}
          onClick={() => {
            clearTypeAndGoBackToChoosing()
          }}
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
