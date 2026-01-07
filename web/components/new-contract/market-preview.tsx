import {
  EyeIcon,
  EyeOffIcon,
  PencilIcon,
  PlusIcon,
  XIcon,
} from '@heroicons/react/solid'
import { JSONContent } from '@tiptap/core'
import { Editor } from '@tiptap/react'
import clsx from 'clsx'
import { MAX_ANSWERS } from 'common/answer'
import { Contract, CreateableOutcomeType } from 'common/contract'
import { Group } from 'common/group'
import { User } from 'common/user'
import { formatMoney } from 'common/util/format'
import { removeEmojis } from 'common/util/string'
import dayjs from 'dayjs'
import { useCallback, useEffect, useRef, useState } from 'react'
import { VisibilityIcon } from 'web/components/contract/contracts-table'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { Content, TextEditor } from 'web/components/widgets/editor'
import { Input } from 'web/components/widgets/input'
import { Tooltip } from 'web/components/widgets/tooltip'
import { UserLink } from 'web/components/widgets/user-link'
import { useDebouncedEffect } from 'web/hooks/use-debounced-effect'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { api } from 'web/lib/api/api'
import { ValidationErrors } from 'web/lib/validation/contract-validation'
import { POLL_SEE_RESULTS_ANSWER } from '../answers/answer-constants'
import { AnswerInput } from '../answers/multiple-choice-answers'
import { Button } from '../buttons/button'
import { Modal } from '../layout/modal'
import { ContractTopicsList } from '../topics/contract-topics-list'
import { TopicTag } from '../topics/topic-tag'
import { InfoTooltip } from '../widgets/info-tooltip'
import { ProbabilitySlider } from '../widgets/probability-input'
import ShortToggle from '../widgets/short-toggle'
import { MarketTypeSuggestionBanner } from './market-type-suggestion-banner'
import {
  MarketTypeSuggestion,
  suggestMarketType,
} from './market-type-suggestions'
import { SimilarContractsSection } from './similar-contracts-section'

export type PreviewContractData = {
  question: string
  outcomeType:
    | 'BINARY'
    | 'MULTIPLE_CHOICE'
    | 'PSEUDO_NUMERIC'
    | 'STONK'
    | 'NUMBER'
    | 'POLL'
    | 'MULTI_NUMERIC'
    | 'DATE'
  description?: JSONContent
  probability?: number // For BINARY (0-100)
  answers?: Array<{
    text: string
    prob?: number
  }> // For MULTIPLE_CHOICE, POLL, etc
  closeTime?: number
  visibility: 'public' | 'unlisted'
  liquidityTier?: number
  min?: number
  max?: number
  minString?: string // For DATE markets
  maxString?: string // For DATE markets
  midpoints?: number[] // For MULTI_NUMERIC and DATE markets
  unit?: string

  // Multiple choice specific
  shouldAnswersSumToOne?: boolean
  addAnswersMode?: 'DISABLED' | 'ONLY_CREATOR' | 'ANYONE'

  // Poll specific
  includeSeeResults?: boolean
  pollType?: 'single' | 'multi-select' | 'ranked-choice'
}

export function MarketPreview(props: {
  data: PreviewContractData
  user: User
  onEditQuestion?: (question: string) => void
  onEditDescription?: (description: JSONContent) => void
  descriptionEditor?: Editor | null
  closeDate?: Date
  setCloseDate?: (date: Date) => void
  closeHoursMinutes?: string
  setCloseHoursMinutes?: (time: string) => void
  neverCloses?: boolean
  setNeverCloses?: (never: boolean) => void
  selectedGroups?: Group[]
  onUpdateGroups?: (groups: Group[]) => void
  onToggleVisibility?: () => void
  onEditAnswers?: (answers: string[]) => void
  onOpenTopicsModal?: (open: boolean) => void
  triggerTopicsModalOpen?: boolean
  className?: string
  isEditable?: boolean
  onToggleShouldAnswersSumToOne?: () => void
  isGeneratingDateRanges?: boolean
  onDateRangeChange?: (field: 'minString' | 'maxString', value: string) => void
  onGenerateDateRanges?: () => void
  isGeneratingNumericRanges?: boolean
  onNumericRangeChange?: (
    field: 'min' | 'max' | 'unit',
    value: number | string | undefined
  ) => void
  onGenerateNumericRanges?: () => void
  onProbabilityChange?: (probability: number) => void
  onOpenCloseDateModal?: () => void
  onGenerateDescription?: () => void
  isGeneratingDescription?: boolean
  onGenerateAnswers?: () => void
  isGeneratingAnswers?: boolean
  onSwitchMarketType?: (
    type: CreateableOutcomeType,
    shouldSumToOne?: boolean,
    addAnswersMode?: 'DISABLED' | 'ONLY_CREATOR' | 'ANYONE',
    removeOtherAnswer?: boolean
  ) => void
  similarContracts?: Contract[]
  setSimilarContracts?: (contracts: Contract[]) => void
  setDismissedSimilarContractTitles?: (
    func: (titles: string[]) => string[]
  ) => void
  fieldErrors?: ValidationErrors
  onToggleIncludeSeeResults?: () => void
}) {
  const {
    data,
    user,
    onEditQuestion,
    descriptionEditor,
    closeDate,
    setCloseDate,
    selectedGroups = [],
    onUpdateGroups,
    onToggleVisibility,
    onEditAnswers,
    onOpenTopicsModal,
    triggerTopicsModalOpen,
    className,
    isEditable = true,
    onToggleShouldAnswersSumToOne,
    isGeneratingDateRanges = false,
    onDateRangeChange,
    onGenerateDateRanges,
    isGeneratingNumericRanges = false,
    onNumericRangeChange,
    onGenerateNumericRanges,
    onProbabilityChange,
    onOpenCloseDateModal,
    onGenerateDescription,
    isGeneratingDescription = false,
    onGenerateAnswers,
    isGeneratingAnswers = false,
    onSwitchMarketType,
    similarContracts = [],
    setSimilarContracts,
    setDismissedSimilarContractTitles,
    fieldErrors = {},
    onToggleIncludeSeeResults,
  } = props
  const [isTopicsModalOpen, setIsTopicsModalOpen] = useState(false)
  const [dismissedSuggestion, setDismissedSuggestion] = useState(false)
  const [aiPollSuggestion, setAiPollSuggestion] = useState<{
    isSubjective: boolean
    confidence: number
    reason: string
  } | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isCheckingPollSuggestion, setIsCheckingPollSuggestion] =
    useState(false) // Could be used for loading indicator
  const questionTextareaRef = useRef<HTMLTextAreaElement>(null)
  const isMobile = useIsMobile()

  // Notify parent when topics modal opens/closes
  const handleSetTopicsModal = (open: boolean) => {
    setIsTopicsModalOpen(open)
    onOpenTopicsModal?.(open)
  }

  // Watch for external trigger to open topics modal
  useEffect(() => {
    if (triggerTopicsModalOpen) {
      handleSetTopicsModal(true)
    }
  }, [triggerTopicsModalOpen])

  // Scroll to first error field when validation errors appear
  useEffect(() => {
    if (!fieldErrors || Object.keys(fieldErrors).length === 0) return

    const firstErrorKey = Object.keys(fieldErrors)[0]

    // Map error keys to element selectors
    const errorElementMap: Record<string, string> = {
      question: '#market-preview-title-input',
      answers: '#answers-section',
      range: '#date-range-section, #numeric-range-section',
    }

    const selector = errorElementMap[firstErrorKey]
    if (!selector) return

    // Try each selector in the comma-separated list
    const selectors = selector.split(',').map((s) => s.trim())
    let element: Element | null = null

    for (const sel of selectors) {
      element = document.querySelector(sel)
      if (element) break
    }

    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [fieldErrors])

  const {
    question,
    outcomeType,
    description,
    probability = 50,
    answers = [],
    closeTime,
    visibility,
    min,
    max,
    unit,
    shouldAnswersSumToOne,
    addAnswersMode,
  } = data

  // Auto-resize question textarea to fit content
  const resizeQuestionTextarea = useCallback(() => {
    const textarea = questionTextareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = textarea.scrollHeight + 'px'
    }
  }, [])

  // Resize on mount, when question changes, and on window resize
  useEffect(() => {
    resizeQuestionTextarea()
  }, [question, resizeQuestionTextarea])

  useEffect(() => {
    window.addEventListener('resize', resizeQuestionTextarea)
    return () => window.removeEventListener('resize', resizeQuestionTextarea)
  }, [resizeQuestionTextarea])

  // Only show AI poll suggestions for newer users (< 100 unique traders on their markets)
  const isExperiencedCreator = (user.creatorTraders?.allTime ?? 0) >= 100

  // Debounced AI poll suggestion check
  useDebouncedEffect(
    () => {
      // Skip if already a POLL, not editable, question too short, or experienced user
      if (
        outcomeType === 'POLL' ||
        !isEditable ||
        !question ||
        question.length < 10 ||
        isExperiencedCreator
      ) {
        setAiPollSuggestion(null)
        return
      }

      const checkPollSuggestion = async () => {
        setIsCheckingPollSuggestion(true)
        try {
          const result = await api('check-poll-suggestion', {
            question,
            answers: answers?.map((a) => a.text) ?? [],
          })
          setAiPollSuggestion(result)
        } catch (e) {
          console.error('Error checking poll suggestion:', e)
          setAiPollSuggestion(null)
        } finally {
          setIsCheckingPollSuggestion(false)
        }
      }

      checkPollSuggestion()
    },
    1500, // 1.5 second debounce
    [question, outcomeType, isEditable, isExperiencedCreator]
  )

  // Create a mock contract for rendering components
  const mockContract: any = {
    id: 'preview',
    slug: 'preview',
    question,
    description: description || '',
    outcomeType,
    visibility,
    creatorId: user.id,
    creatorName: user.name,
    creatorUsername: user.username,
    creatorAvatarUrl: user.avatarUrl,
    createdTime: Date.now(),
    closeTime,
    isResolved: false,
    mechanism:
      outcomeType === 'POLL'
        ? 'none'
        : outcomeType === 'MULTIPLE_CHOICE'
        ? 'cpmm-multi-1'
        : 'cpmm-1',
    prob: probability / 100,
    token: 'MANA',
    volume: 0,
    volume24Hours: 0,
    elasticity: 1,
    uniqueBettorCount: 0,
    uniqueBettorCountDay: 0,
    collectedFees: { creatorFee: 0, liquidityFee: 0, platformFee: 0 },
    popularityScore: 0,
    importanceScore: 0,
    dailyScore: 0,
    freshnessScore: 0,
    conversionScore: 0,
    viewCount: 0,
    boosted: false,
  }

  // For BINARY
  if (outcomeType === 'BINARY') {
    mockContract.pool = { YES: 100, NO: 100 }
    mockContract.p = probability / 100
    mockContract.totalLiquidity = 100
    mockContract.subsidyPool = 0
    mockContract.probChanges = { day: 0, week: 0, month: 0 }
  }

  // For MULTIPLE_CHOICE
  let mcProbs: number[] = []
  if (outcomeType === 'MULTIPLE_CHOICE') {
    mockContract.shouldAnswersSumToOne = data.shouldAnswersSumToOne ?? true
    mockContract.addAnswersMode = data.addAnswersMode || 'DISABLED'

    const hasOther =
      mockContract.addAnswersMode !== 'DISABLED' && data.shouldAnswersSumToOne

    // If shouldAnswersSumToOne is true, distribute equally (100/numAnswers)
    // Otherwise show 50% for independent answers
    if (data.shouldAnswersSumToOne) {
      const totalAnswers = answers.length + (hasOther ? 1 : 0)
      const equalProb = 1 / totalAnswers
      mcProbs = answers.map(() => equalProb)
    } else {
      mcProbs = answers.map(() => 0.5)
    }

    mockContract.answers = answers.map((a, i) => ({
      id: `preview-${i}`,
      contractId: 'preview',
      creatorId: user.id,
      text: a.text,
      createdTime: Date.now(),
      prob: mcProbs[i] || 0.5,
      poolYes: 100,
      poolNo: 100,
      userId: user.id,
      totalLiquidity: 100,
      subsidyPool: 0,
      index: i,
      volume: 0,
      probChanges: { day: 0, week: 0, month: 0 },
    }))
  }

  // For MULTI_NUMERIC - also needs mcProbs calculated
  if (outcomeType === 'MULTI_NUMERIC') {
    mockContract.shouldAnswersSumToOne = data.shouldAnswersSumToOne ?? true

    // Calculate probabilities for numeric answers
    if (data.shouldAnswersSumToOne) {
      const equalProb = 1 / answers.length
      mcProbs = answers.map(() => equalProb)
    } else {
      mcProbs = answers.map(() => 0.5)
    }
  }

  // For DATE - also needs mcProbs calculated
  if (outcomeType === 'DATE') {
    mockContract.shouldAnswersSumToOne = data.shouldAnswersSumToOne ?? true

    // Calculate probabilities for date answers
    if (data.shouldAnswersSumToOne) {
      const equalProb = 1 / answers.length
      mcProbs = answers.map(() => equalProb)
    } else {
      mcProbs = answers.map(() => 0.5)
    }
  }

  const isBinary = outcomeType === 'BINARY'
  const isMultipleChoice = outcomeType === 'MULTIPLE_CHOICE'
  const isPoll = outcomeType === 'POLL'
  const isNumeric = outcomeType === 'MULTI_NUMERIC' || outcomeType === 'NUMBER'
  const isDate = outcomeType === 'DATE'
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'

  // Determine if we can remove an answer based on addAnswersMode and shouldAnswersSumToOne
  // - DISABLED (or undefined): need 2 user answers, so can only remove if > 2
  // - Enabled with shouldAnswersSumToOne (has Other): can go to 0 user answers
  // - Enabled without shouldAnswersSumToOne (no Other): need at least 1 user answer
  const addAnswersModeEnabled =
    addAnswersMode === 'ONLY_CREATOR' || addAnswersMode === 'ANYONE'
  const hasOtherAnswer =
    isMultipleChoice && addAnswersModeEnabled && shouldAnswersSumToOne === true
  const canRemoveMCAnswer =
    isMultipleChoice &&
    (!addAnswersModeEnabled
      ? answers.length > 2
      : hasOtherAnswer
      ? answers.length > 0
      : answers.length > 1)

  return (
    <Col
      className={clsx(
        'bg-canvas-0 ring-ink-100 relative gap-3 rounded-lg p-3 shadow-md ring-1 sm:p-4',
        'transition-all duration-200',
        className
      )}
    >
      {/* Creator Info */}
      <Row className="items-center justify-between gap-2">
        <Row className="items-center gap-2">
          <Avatar
            username={user.username}
            avatarUrl={user.avatarUrl}
            size="xs"
          />
          <UserLink
            user={user}
            short={isMobile}
            maxLength={9}
            className="text-ink-600 text-sm"
          />
          {isEditable && onToggleVisibility ? (
            <>
              <span className="text-ink-400 text-sm">·</span>
              <Tooltip
                text={
                  visibility === 'unlisted' ? (
                    'Click to make public'
                  ) : (
                    <>
                      Click to make unlisted
                      <br />
                      (not discoverable without a link)
                    </>
                  )
                }
                noTap
              >
                <button
                  onClick={() => onToggleVisibility()}
                  className="transition-opacity hover:opacity-70"
                >
                  {visibility === 'unlisted' ? (
                    <EyeOffIcon className="text-ink-900 inline h-4 w-4" />
                  ) : (
                    <EyeIcon className="text-ink-300 inline h-4 w-4" />
                  )}
                </button>
              </Tooltip>
            </>
          ) : visibility === 'unlisted' ? (
            <>
              <span className="text-ink-400 text-sm">·</span>
              <Tooltip text="This market will be unlisted">
                <VisibilityIcon contract={mockContract as Contract} />
              </Tooltip>
            </>
          ) : null}
        </Row>

        {/* Close Date Input */}
        {isEditable && setCloseDate && (
          <Row className="items-center gap-1">
            {onOpenCloseDateModal ? (
              <>
                <span className="text-ink-600 text-xs">
                  {closeDate ? 'Closes:' : ''}
                </span>
                <button
                  onClick={() => onOpenCloseDateModal()}
                  className="text-ink-600 hover:text-ink-700 flex items-center gap-1 text-xs transition-colors"
                >
                  <span>
                    {closeDate
                      ? dayjs(closeDate).format('MMM D, YYYY')
                      : 'close date'}
                  </span>
                  <span>📅</span>
                </button>
              </>
            ) : (
              <>
                <span className="text-ink-600 text-xs">Closes:</span>
                <Input
                  type="date"
                  className="dark:date-range-input-white cursor-pointer text-xs"
                  onChange={(e) => {
                    if (e.target.value) {
                      setCloseDate(new Date(e.target.value))
                    }
                  }}
                  min={dayjs().format('YYYY-MM-DD')}
                  max="9999-12-31"
                  value={closeDate ? dayjs(closeDate).format('YYYY-MM-DD') : ''}
                />
              </>
            )}
          </Row>
        )}
      </Row>

      {/* Question */}
      {isEditable && onEditQuestion ? (
        <textarea
          ref={questionTextareaRef}
          id="market-preview-title-input"
          value={question || ''}
          onChange={(e) => {
            // Remove any line breaks from the input
            const cleanedValue = e.target.value.replace(/[\r\n]/g, '')
            onEditQuestion(cleanedValue)
            resizeQuestionTextarea()
          }}
          onKeyDown={(e) => {
            // Prevent Enter key from creating line breaks
            if (e.key === 'Enter') {
              e.preventDefault()
            }
          }}
          placeholder="What's your question?"
          className={clsx(
            'text-ink-1000 placeholder:text-ink-400 bg-canvas-0 w-full resize-none overflow-hidden rounded-md border px-4 py-3 text-lg font-semibold shadow-sm transition-colors focus:outline-none sm:text-xl',
            fieldErrors.question
              ? 'border-0 ring-2 ring-red-500 hover:ring-red-500 focus:ring-2 focus:ring-red-500 dark:ring-red-600 dark:hover:ring-red-600 dark:focus:ring-red-600'
              : 'border-ink-300 hover:ring-primary-500 focus:ring-primary-500 focus:border-primary-500 hover:ring-1 focus:ring-1'
          )}
          rows={1}
          maxLength={120}
          autoFocus
        />
      ) : (
        <div className="text-ink-1000 text-lg font-semibold sm:text-xl">
          {question ? (
            removeEmojis(question)
          ) : (
            <span className="text-ink-400">What's your question?</span>
          )}
        </div>
      )}

      {/* Similar Contracts Warning */}
      {similarContracts.length > 0 &&
        setSimilarContracts &&
        setDismissedSimilarContractTitles && (
          <SimilarContractsSection
            similarContracts={similarContracts}
            setSimilarContracts={setSimilarContracts}
            setDismissedSimilarContractTitles={
              setDismissedSimilarContractTitles
            }
            outcomeType={outcomeType}
            question={question || ''}
          />
        )}

      {/* Market Type Suggestion Banner */}
      {isEditable && !dismissedSuggestion && onSwitchMarketType && question && (
        <>
          {(() => {
            // First check regex-based suggestions
            const regexSuggestion = suggestMarketType(
              question,
              outcomeType,
              answers?.map((a) => a.text),
              addAnswersMode,
              shouldAnswersSumToOne
            )
            if (regexSuggestion) {
              return (
                <MarketTypeSuggestionBanner
                  suggestion={regexSuggestion}
                  onSwitchType={onSwitchMarketType}
                  onDismiss={() => setDismissedSuggestion(true)}
                />
              )
            }

            // Then check AI-based poll suggestion (only if confidence > 0.7)
            if (
              aiPollSuggestion?.isSubjective &&
              aiPollSuggestion.confidence >= 0.7 &&
              outcomeType !== 'POLL'
            ) {
              const suggestion: MarketTypeSuggestion = {
                suggestedType: 'POLL',
                reason:
                  aiPollSuggestion.reason ||
                  'This question seems subjective or opinion-based',
                confidence:
                  aiPollSuggestion.confidence >= 0.85 ? 'high' : 'medium',
              }
              return (
                <MarketTypeSuggestionBanner
                  suggestion={suggestion}
                  onSwitchType={onSwitchMarketType}
                  onDismiss={() => setDismissedSuggestion(true)}
                />
              )
            }

            return null
          })()}
        </>
      )}

      {/* Date Range Inputs - Below Question for DATE markets */}
      {isDate && isEditable && onDateRangeChange && (
        <Col
          id="date-range-section"
          className={clsx(
            '-mx-4 -mb-1 gap-2 rounded-lg px-4 py-3 transition-all',
            fieldErrors.range ? 'ring-2 ring-red-500 dark:ring-red-600' : ''
          )}
        >
          <Col className="gap-0.5">
            <Row className="items-baseline gap-1">
              <span className="text-ink-700 text-sm font-medium">
                Date range
              </span>
              <InfoTooltip text="Enter the start and end dates for your question. You can use flexible formats like '2025', 'Q1 2025', 'January 2025', or 'Jan 1, 2025'." />
            </Row>
            <span className="text-ink-500 text-xs">
              Examples: "2025", "January 2025", "Q1 2025", "Jan 1, 2025"
            </span>
          </Col>
          <Row className="w-full gap-2">
            <Input
              type="text"
              className="w-full text-sm"
              placeholder="Start (e.g., 2025)"
              onChange={(e) => onDateRangeChange('minString', e.target.value)}
              value={data.minString || ''}
            />
            <Input
              type="text"
              className="w-full text-sm"
              placeholder="End (e.g., 2030)"
              onChange={(e) => onDateRangeChange('maxString', e.target.value)}
              value={data.maxString || ''}
            />
          </Row>
          {onGenerateDateRanges && (
            <Row className="justify-center">
              <Tooltip
                text={
                  !question
                    ? 'Enter a question first'
                    : !data.minString || !data.maxString
                    ? 'Enter start and end dates'
                    : ''
                }
                noTap={!!(question && data.minString && data.maxString)}
              >
                <Button
                  id="generate-date-ranges-button"
                  color="indigo-outline"
                  size="xs"
                  onClick={onGenerateDateRanges}
                  disabled={
                    !question ||
                    !data.minString ||
                    !data.maxString ||
                    isGeneratingDateRanges
                  }
                  loading={isGeneratingDateRanges}
                  className={clsx(
                    fieldErrors.answers &&
                      'ring-2 ring-red-500 dark:ring-red-600'
                  )}
                >
                  {answers.length > 0
                    ? 'Regenerate date ranges'
                    : 'Generate date ranges'}
                </Button>
              </Tooltip>
            </Row>
          )}
        </Col>
      )}

      {/* Numeric Range Inputs - Below Question for MULTI_NUMERIC markets */}
      {isNumeric && isEditable && onNumericRangeChange && (
        <Col
          id="numeric-range-section"
          className={clsx(
            '-mx-4 -mb-1 gap-2 rounded-lg px-4 py-3 transition-all',
            fieldErrors.range ? 'ring-2 ring-red-500 dark:ring-red-600' : ''
          )}
        >
          <Col className="gap-0.5">
            <Row className="items-baseline gap-1">
              <span className="text-ink-700 text-sm font-medium">
                Numeric range
              </span>
              <InfoTooltip text="Enter the minimum and maximum values for your numeric range, and specify the unit/metric." />
            </Row>
            <span className="text-ink-500 text-xs">
              Examples: Min: 0, Max: 100, Metric: "people" or "dollars"
            </span>
          </Col>
          <Row className="w-full gap-2">
            <Input
              type="number"
              className="w-full text-sm"
              placeholder="Min (e.g., 0)"
              onChange={(e) =>
                onNumericRangeChange(
                  'min',
                  e.target.value ? parseFloat(e.target.value) : undefined
                )
              }
              value={data.min !== undefined ? data.min : ''}
            />
            <Input
              type="number"
              className="w-full text-sm"
              placeholder="Max (e.g., 100)"
              onChange={(e) =>
                onNumericRangeChange(
                  'max',
                  e.target.value ? parseFloat(e.target.value) : undefined
                )
              }
              value={data.max !== undefined ? data.max : ''}
            />
            <Input
              type="text"
              className="w-full text-sm"
              placeholder="Metric (e.g., people)"
              onChange={(e) => onNumericRangeChange('unit', e.target.value)}
              value={data.unit || ''}
            />
          </Row>
          {onGenerateNumericRanges && (
            <Row className="justify-end">
              <Tooltip
                text={
                  !question
                    ? 'Enter a question first'
                    : data.min === undefined || data.max === undefined
                    ? 'Enter min and max values'
                    : ''
                }
                noTap={
                  !!(
                    question &&
                    data.min !== undefined &&
                    data.max !== undefined
                  )
                }
              >
                <Button
                  id="generate-numeric-ranges-button"
                  color="indigo-outline"
                  size="xs"
                  onClick={onGenerateNumericRanges}
                  disabled={
                    !question ||
                    data.min === undefined ||
                    data.max === undefined ||
                    isGeneratingNumericRanges
                  }
                  loading={isGeneratingNumericRanges}
                  className={clsx(
                    fieldErrors.answers &&
                      'ring-2 ring-red-500 dark:ring-red-600'
                  )}
                >
                  {answers.length > 0
                    ? 'Regenerate numeric ranges'
                    : 'Generate numeric ranges'}
                </Button>
              </Tooltip>
            </Row>
          )}
        </Col>
      )}

      {/* Outcome Type Specific Content */}
      <Col className="gap-3">
        {isMultipleChoice && (
          <Col
            id="answers-section"
            className={clsx(
              'gap-2 rounded-lg transition-all',
              fieldErrors.answers
                ? 'p-3 ring-2 ring-red-500 focus-within:ring-2 focus-within:ring-red-500 dark:ring-red-600 dark:focus-within:ring-red-600'
                : ''
            )}
          >
            {answers.length > 0 || addAnswersModeEnabled ? (
              <>
                {answers.map((answer, i) => (
                  <div
                    key={i}
                    className="bg-canvas-0 border-ink-200 rounded-lg border p-3"
                  >
                    {/* Desktop layout: horizontal */}
                    <Row className="hidden items-center gap-3 sm:flex">
                      {/* Probability - Prominent on left like real markets */}
                      <span className="text-ink-700 min-w-[3rem] text-lg font-semibold">
                        {Math.round(mcProbs[i] * 100)}%
                      </span>

                      {/* Answer text/input - grows to fill space */}
                      {isEditable && onEditAnswers ? (
                        <AnswerInput
                          id={`mc-answer-${i}`}
                          className="min-w-0 flex-1"
                          placeholder={`Answer ${i + 1}`}
                          value={answer.text}
                          onChange={(e) => {
                            const newAnswers = [...answers]
                            newAnswers[i] = {
                              ...newAnswers[i],
                              text: e.target.value,
                            }
                            onEditAnswers(newAnswers.map((a) => a.text))
                          }}
                          onUp={() => {
                            // Focus previous answer
                            if (i > 0) {
                              document
                                .getElementById(`mc-answer-${i - 1}`)
                                ?.focus()
                            }
                          }}
                          onDown={() => {
                            // If on last answer, add new one
                            if (
                              i === answers.length - 1 &&
                              answers.length < MAX_ANSWERS
                            ) {
                              onEditAnswers([...answers.map((a) => a.text), ''])
                              setTimeout(
                                () =>
                                  document
                                    .getElementById(`mc-answer-${i + 1}`)
                                    ?.focus(),
                                0
                              )
                            } else if (i < answers.length - 1) {
                              // Focus next answer
                              document
                                .getElementById(`mc-answer-${i + 1}`)
                                ?.focus()
                            }
                          }}
                          onDelete={() => {
                            if (canRemoveMCAnswer) {
                              const newAnswers = answers.filter(
                                (_, idx) => idx !== i
                              )
                              onEditAnswers(newAnswers.map((a) => a.text))
                            }
                          }}
                        />
                      ) : (
                        <span className="text-ink-900 flex-1 text-sm font-semibold">
                          {answer.text || `Answer ${i + 1}`}
                        </span>
                      )}

                      {/* YES/NO buttons - inline on right */}
                      <Row className="gap-2">
                        <button
                          tabIndex={-1}
                          className="opacity-85 cursor-not-allowed rounded bg-teal-500 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-600"
                        >
                          YES
                        </button>
                        <button
                          tabIndex={-1}
                          className="bg-scarlet-500 hover:bg-scarlet-600 opacity-85 cursor-not-allowed rounded px-3 py-1 text-xs font-semibold text-white"
                        >
                          NO
                        </button>
                      </Row>

                      {/* X button to remove - far right */}
                      {isEditable && onEditAnswers && canRemoveMCAnswer && (
                        <button
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            const newAnswers = answers.filter(
                              (_, idx) => idx !== i
                            )
                            onEditAnswers(newAnswers.map((a) => a.text))
                            // Focus previous answer after deletion
                            setTimeout(
                              () =>
                                document
                                  .getElementById(
                                    `mc-answer-${Math.max(0, i - 1)}`
                                  )
                                  ?.focus(),
                              0
                            )
                          }}
                          className="hover:bg-canvas-50 border-ink-300 text-ink-700 bg-canvas-0 focus:ring-primary-500 rounded-full border p-1 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
                        >
                          <XIcon className="h-5 w-5" aria-hidden="true" />
                        </button>
                      )}
                    </Row>

                    {/* Mobile layout: stacked */}
                    <Row className="items-center gap-2 sm:hidden">
                      {/* Probability - on the left, smaller */}
                      <span className="text-ink-700 shrink-0 text-sm font-semibold">
                        {Math.round(mcProbs[i] * 100)}%
                      </span>

                      {/* Answer text/input - with relative positioning for X button */}
                      <div className="relative flex-1">
                        {isEditable && onEditAnswers ? (
                          <AnswerInput
                            id={`mc-answer-mobile-${i}`}
                            className="w-full"
                            placeholder={`Answer ${i + 1}`}
                            value={answer.text}
                            onChange={(e) => {
                              const newAnswers = [...answers]
                              newAnswers[i] = {
                                ...newAnswers[i],
                                text: e.target.value,
                              }
                              onEditAnswers(newAnswers.map((a) => a.text))
                            }}
                            onUp={() => {
                              // Focus previous answer
                              if (i > 0) {
                                document
                                  .getElementById(`mc-answer-mobile-${i - 1}`)
                                  ?.focus()
                              }
                            }}
                            onDown={() => {
                              // If on last answer, add new one
                              if (
                                i === answers.length - 1 &&
                                answers.length < MAX_ANSWERS
                              ) {
                                onEditAnswers([
                                  ...answers.map((a) => a.text),
                                  '',
                                ])
                                setTimeout(
                                  () =>
                                    document
                                      .getElementById(
                                        `mc-answer-mobile-${i + 1}`
                                      )
                                      ?.focus(),
                                  0
                                )
                              } else if (i < answers.length - 1) {
                                // Focus next answer
                                document
                                  .getElementById(`mc-answer-mobile-${i + 1}`)
                                  ?.focus()
                              }
                            }}
                            onDelete={() => {
                              if (canRemoveMCAnswer) {
                                const newAnswers = answers.filter(
                                  (_, idx) => idx !== i
                                )
                                onEditAnswers(newAnswers.map((a) => a.text))
                              }
                            }}
                          />
                        ) : (
                          <span className="text-ink-900 text-sm font-semibold">
                            {answer.text || `Answer ${i + 1}`}
                          </span>
                        )}

                        {/* X button - positioned in top-right corner */}
                        {isEditable && onEditAnswers && canRemoveMCAnswer && (
                          <button
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              const newAnswers = answers.filter(
                                (_, idx) => idx !== i
                              )
                              onEditAnswers(newAnswers.map((a) => a.text))
                              // Focus previous answer after deletion
                              setTimeout(
                                () =>
                                  document
                                    .getElementById(
                                      `mc-answer-mobile-${Math.max(0, i - 1)}`
                                    )
                                    ?.focus(),
                                0
                              )
                            }}
                            className="hover:bg-canvas-50 border-ink-300 text-ink-700 bg-canvas-0 focus:ring-primary-500 absolute -right-1 -top-1 rounded-full border p-0.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
                          >
                            <XIcon className="h-3 w-3" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </Row>
                  </div>
                ))}

                {/* Show "Other" answer only for sum-to-one markets when answers can be added later */}
                {mockContract.addAnswersMode !== 'DISABLED' &&
                  data.shouldAnswersSumToOne && (
                    <div className="bg-canvas-0 border-ink-200 rounded-lg border p-3">
                      <Row className="items-center gap-3">
                        {/* Probability - Prominent on left like real markets */}
                        <span className="text-ink-700 min-w-[3rem] text-lg font-semibold">
                          {(() => {
                            const usedProb = mcProbs.reduce(
                              (sum, p) => sum + p,
                              0
                            )
                            const otherProb = Math.max(0, 1 - usedProb)
                            return `${Math.round(otherProb * 100)}%`
                          })()}
                        </span>

                        {/* "Other" text with info tooltip */}
                        <Row className="flex-1 items-center gap-2">
                          <span className="text-ink-900 text-sm font-semibold">
                            Other
                          </span>
                          <InfoTooltip text="Bet on all answers that aren't listed yet. A bet on Other automatically includes any answer added in the future." />
                        </Row>

                        {/* YES/NO buttons - inline on right (hidden on mobile) */}
                        <Row className="hidden gap-2 sm:flex">
                          <button
                            tabIndex={-1}
                            className="opacity-85 cursor-not-allowed rounded bg-teal-500 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-600"
                          >
                            YES
                          </button>
                          <button
                            tabIndex={-1}
                            className="bg-scarlet-500 hover:bg-scarlet-600 opacity-85 cursor-not-allowed rounded px-3 py-1 text-xs font-semibold text-white"
                          >
                            NO
                          </button>
                        </Row>

                        {/* Spacer to align with X button above */}
                        <div className="w-7" />
                      </Row>
                    </div>
                  )}

                {/* Action buttons row */}
                {isEditable && onEditAnswers && (
                  <Row className="gap-3">
                    {/* Generate with AI button */}
                    {data.question && onGenerateAnswers && (
                      <Button
                        color="indigo-outline"
                        size="xs"
                        loading={isGeneratingAnswers}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          onGenerateAnswers()
                        }}
                        disabled={!data.question || isGeneratingAnswers}
                      >
                        Generate AI Answers
                      </Button>
                    )}

                    {/* Add answer button */}
                    {answers.length < MAX_ANSWERS && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          onEditAnswers([...answers.map((a) => a.text), ''])
                        }}
                        className="text-primary-600 hover:text-primary-700 disabled:text-ink-400 flex items-center gap-1 text-sm font-medium disabled:cursor-not-allowed"
                      >
                        <PlusIcon className="h-4 w-4" />
                        Add answer
                        {(() => {
                          // Calculate marginal cost for adding one more answer
                          const currentCost =
                            data.liquidityTier && answers.length > 0
                              ? (() => {
                                  const tierIndex = [
                                    100, 1000, 10000, 100000,
                                  ].indexOf(data.liquidityTier)
                                  const answerCostTiers = [25, 100, 250, 1000]
                                  return Math.max(
                                    answers.length * answerCostTiers[tierIndex],
                                    data.liquidityTier
                                  )
                                })()
                              : 0
                          const newCost =
                            data.liquidityTier && answers.length > 0
                              ? (() => {
                                  const tierIndex = [
                                    100, 1000, 10000, 100000,
                                  ].indexOf(data.liquidityTier)
                                  const answerCostTiers = [25, 100, 250, 1000]
                                  return Math.max(
                                    (answers.length + 1) *
                                      answerCostTiers[tierIndex],
                                    data.liquidityTier
                                  )
                                })()
                              : 0
                          const marginalCost = newCost - currentCost
                          return marginalCost > 0 ? (
                            <span className="text-ink-500 text-xs">
                              +{formatMoney(marginalCost)}
                            </span>
                          ) : null
                        })()}
                      </button>
                    )}
                  </Row>
                )}
              </>
            ) : (
              <div className="text-ink-400 border-ink-200 rounded border-2 border-dashed p-6 text-center text-sm">
                Add at least 2 answer options to see your market preview
              </div>
            )}
          </Col>
        )}

        {isPoll && (
          <Col
            className={clsx(
              'gap-2 rounded-lg transition-all',
              fieldErrors.answers
                ? 'p-3 ring-2 ring-red-500 focus-within:ring-2 focus-within:ring-red-500 dark:ring-red-600 dark:focus-within:ring-red-600'
                : ''
            )}
          >
            {answers.length > 0 ? (
              <>
                {answers.map((answer, i) => (
                  <div
                    key={i}
                    className="bg-canvas-0 border-ink-200 rounded-lg border p-3"
                  >
                    <Row className="items-center gap-3">
                      {/* Answer text/input - grows to fill space */}
                      {isEditable && onEditAnswers ? (
                        <AnswerInput
                          id={`poll-option-${i}`}
                          className="min-w-0 flex-1"
                          placeholder={`Option ${i + 1}`}
                          value={answer.text}
                          onChange={(e) => {
                            const newAnswers = [...answers]
                            newAnswers[i] = {
                              ...newAnswers[i],
                              text: e.target.value,
                            }
                            onEditAnswers(newAnswers.map((a) => a.text))
                          }}
                          onUp={() => {
                            // Focus previous answer
                            if (i > 0) {
                              document
                                .getElementById(`poll-option-${i - 1}`)
                                ?.focus()
                            }
                          }}
                          onDown={() => {
                            // If on last answer, add new one
                            if (
                              i === answers.length - 1 &&
                              answers.length < MAX_ANSWERS
                            ) {
                              onEditAnswers([...answers.map((a) => a.text), ''])
                              setTimeout(
                                () =>
                                  document
                                    .getElementById(`poll-option-${i + 1}`)
                                    ?.focus(),
                                0
                              )
                            } else if (i < answers.length - 1) {
                              // Focus next answer
                              document
                                .getElementById(`poll-option-${i + 1}`)
                                ?.focus()
                            }
                          }}
                          onDelete={() => {
                            if (answers.length > 2) {
                              const newAnswers = answers.filter(
                                (_, idx) => idx !== i
                              )
                              onEditAnswers(newAnswers.map((a) => a.text))
                            }
                          }}
                        />
                      ) : (
                        <span className="text-ink-900 flex-1 text-sm font-semibold">
                          {answer.text || `Option ${i + 1}`}
                        </span>
                      )}

                      {/* X button to remove - far right */}
                      {isEditable && onEditAnswers && answers.length > 2 && (
                        <button
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            const newAnswers = answers.filter(
                              (_, idx) => idx !== i
                            )
                            onEditAnswers(newAnswers.map((a) => a.text))
                            // Focus previous answer after deletion
                            setTimeout(
                              () =>
                                document
                                  .getElementById(
                                    `poll-option-${Math.max(0, i - 1)}`
                                  )
                                  ?.focus(),
                              0
                            )
                          }}
                          className="hover:bg-canvas-50 border-ink-300 text-ink-700 bg-canvas-0 focus:ring-primary-500 rounded-full border p-1 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
                        >
                          <XIcon className="h-5 w-5" aria-hidden="true" />
                        </button>
                      )}
                    </Row>
                  </div>
                ))}

                {/* "See results" option - only for single-vote polls */}
                {isEditable &&
                  onToggleIncludeSeeResults &&
                  (!data.pollType || data.pollType === 'single') && (
                    <div
                      className={clsx(
                        'bg-canvas-50 border-ink-200 rounded-lg border p-3',
                        !data.includeSeeResults && 'opacity-50'
                      )}
                    >
                      <Row className="items-center gap-3">
                        <Row
                          className={clsx(
                            'flex-1 items-center gap-1',
                            !data.includeSeeResults && 'line-through opacity-70'
                          )}
                        >
                          <span className="text-ink-700 text-sm font-medium">
                            {POLL_SEE_RESULTS_ANSWER}
                          </span>
                          <InfoTooltip text="Adds an answer to the poll labeled 'See results'. Turns off automatically if you manually add it as an answer." />
                        </Row>
                        <Row className="items-center gap-2">
                          <span className="text-ink-500 text-xs">
                            {data.includeSeeResults ? 'Included' : 'Excluded'}
                          </span>
                          <ShortToggle
                            on={data.includeSeeResults ?? true}
                            setOn={() => onToggleIncludeSeeResults()}
                          />
                        </Row>
                      </Row>
                    </div>
                  )}

                {/* Add answer button */}
                {isEditable && onEditAnswers && (
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      onEditAnswers([...answers.map((a) => a.text), ''])
                    }}
                    disabled={answers.length >= MAX_ANSWERS}
                    className="text-primary-600 hover:text-primary-700 disabled:text-ink-400 flex items-center gap-1 text-sm font-medium disabled:cursor-not-allowed"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Add option
                  </button>
                )}
              </>
            ) : (
              <div className="text-ink-400 border-ink-200 rounded border-2 border-dashed p-6 text-center text-sm">
                Add at least 2 options for your poll
              </div>
            )}
          </Col>
        )}

        {isPseudoNumeric && min !== undefined && max !== undefined && (
          <Col className="gap-2">
            <div className="bg-primary-50 rounded-lg p-4 text-center">
              <div className="text-primary-700 text-3xl font-bold">
                {min + (max - min) / 2}
              </div>
              <div className="text-ink-600 text-sm">
                Expected value ({min} - {max})
              </div>
            </div>
            <Row className="text-ink-500 justify-between text-xs">
              <span>Min: {min}</span>
              <span>Max: {max}</span>
            </Row>
          </Col>
        )}

        {isNumeric && (
          <Col className="gap-3">
            {min !== undefined && max !== undefined ? (
              <>
                {/* Numeric Range Display - Market-like with Expected Value */}
                {answers.length > 0 &&
                data.midpoints &&
                data.midpoints.length > 0 ? (
                  <div className="bg-ink-100 border-ink-200 rounded-lg border p-2 sm:p-3">
                    <Row className="items-center justify-center gap-1 text-xs sm:justify-between sm:gap-2">
                      <span className="text-ink-600 min-w-0 shrink text-[10px] sm:text-xs">
                        Min: {min}
                        {unit ? ` ${unit}` : ''}
                      </span>
                      <span className="text-ink-400 shrink-0">→</span>
                      <Col className="shrink-0 items-center gap-0.5">
                        <span className="text-ink-900 text-[11px] font-semibold sm:text-xs">
                          {(() => {
                            // Calculate expected value from probabilities and midpoints
                            const probs = mcProbs.slice(0, answers.length)
                            const midpoints = data.midpoints || []

                            if (!probs.length || !midpoints.length)
                              return min + (max - min) / 2

                            if (data.shouldAnswersSumToOne) {
                              // Buckets: simple weighted average
                              const expected = probs.reduce(
                                (sum, p, i) => sum + p * midpoints[i],
                                0
                              )
                              return expected.toFixed(1)
                            } else {
                              // Thresholds: discrete probabilities
                              const discreteProbs = [probs[0]]
                              for (let i = 1; i < probs.length; i++) {
                                discreteProbs.push(probs[i] - probs[i - 1])
                              }

                              let expected = 0
                              for (let i = 0; i < probs.length; i++) {
                                expected += midpoints[i] * discreteProbs[i]
                              }

                              // Add tail probability
                              const afterLastProb = 1 - probs[probs.length - 1]
                              if (afterLastProb > 0 && midpoints.length > 1) {
                                const range =
                                  midpoints[midpoints.length - 1] -
                                  midpoints[midpoints.length - 2]
                                const beyondLast =
                                  midpoints[midpoints.length - 1] + range
                                expected += beyondLast * afterLastProb
                              }

                              return expected.toFixed(1)
                            }
                          })()}
                          {unit ? ` ${unit}` : ''}
                        </span>
                        <span className="text-ink-500 text-[9px] uppercase sm:text-[10px]">
                          Expected
                        </span>
                      </Col>
                      <span className="text-ink-400 shrink-0">→</span>
                      <span className="text-ink-600 min-w-0 shrink text-[10px] sm:text-xs">
                        Max: {max}
                        {unit ? ` ${unit}` : ''}
                      </span>
                    </Row>
                  </div>
                ) : (
                  <div className="bg-ink-100 border-ink-200 rounded-lg border p-2 sm:p-3">
                    <Row className="text-ink-600 justify-center gap-1 text-[10px] sm:justify-between sm:gap-2 sm:text-xs">
                      <span className="min-w-0 shrink">
                        Min: {min}
                        {unit ? ` ${unit}` : ''}
                      </span>
                      <span className="shrink-0">→</span>
                      <span className="min-w-0 shrink">
                        Max: {max}
                        {unit ? ` ${unit}` : ''}
                      </span>
                    </Row>
                  </div>
                )}

                {/* Buckets/Thresholds Toggle */}
                {answers.length > 0 &&
                  isEditable &&
                  onToggleShouldAnswersSumToOne && (
                    <Row className="items-center justify-between gap-2">
                      <span className="text-ink-700 text-sm font-medium">
                        Answer type
                      </span>
                      <Row className="bg-ink-100 rounded-lg p-1">
                        <button
                          onClick={() => {
                            if (!data.shouldAnswersSumToOne) {
                              onToggleShouldAnswersSumToOne()
                            }
                          }}
                          className={clsx(
                            'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                            data.shouldAnswersSumToOne
                              ? 'bg-canvas-0 text-ink-900 shadow-sm'
                              : 'text-ink-600 hover:text-ink-900'
                          )}
                        >
                          Buckets
                        </button>
                        <button
                          onClick={() => {
                            if (data.shouldAnswersSumToOne) {
                              onToggleShouldAnswersSumToOne()
                            }
                          }}
                          className={clsx(
                            'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                            !data.shouldAnswersSumToOne
                              ? 'bg-canvas-0 text-ink-900 shadow-sm'
                              : 'text-ink-600 hover:text-ink-900'
                          )}
                        >
                          Thresholds
                        </button>
                      </Row>
                    </Row>
                  )}

                {/* Show answer ranges - Editable with preview */}
                {answers.length > 0 && (
                  <Col
                    className={clsx(
                      'gap-2 rounded-lg transition-all',
                      fieldErrors.answers ? 'p-3 ring-2 ring-red-200' : ''
                    )}
                  >
                    {answers.map((answer, i) => (
                      <div
                        key={i}
                        className="bg-canvas-0 border-ink-200 rounded-lg border p-3"
                      >
                        {/* Desktop layout: horizontal */}
                        <Row className="hidden items-center gap-3 sm:flex">
                          {/* Probability - Prominent on left like real markets */}
                          <span className="text-ink-700 min-w-[3rem] text-lg font-semibold">
                            {Math.round((mcProbs[i] || 0.5) * 100)}%
                          </span>

                          {/* Answer text/input - grows to fill space */}
                          {isEditable ? (
                            <>
                              <span className="text-ink-600 text-sm">
                                {i + 1}.
                              </span>
                              <Input
                                className="min-w-0 flex-1"
                                value={answer.text || ''}
                                onChange={(e) => {
                                  if (onEditAnswers) {
                                    const newAnswers = [...answers]
                                    newAnswers[i] = { text: e.target.value }
                                    onEditAnswers(
                                      newAnswers.map((a) => a.text || '')
                                    )
                                  }
                                }}
                                placeholder={`Range ${i + 1}`}
                                error={!!fieldErrors.answers}
                              />
                            </>
                          ) : (
                            <span className="text-ink-900 flex-1 text-sm font-semibold">
                              {answer.text || `Range ${i + 1}`}
                            </span>
                          )}

                          {/* YES/NO buttons - inline on right */}
                          <Row className="gap-2">
                            <button
                              tabIndex={-1}
                              className="opacity-85 cursor-not-allowed rounded bg-teal-500 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-600"
                            >
                              YES
                            </button>
                            <button
                              tabIndex={-1}
                              className="bg-scarlet-500 hover:bg-scarlet-600 opacity-85 cursor-not-allowed rounded px-3 py-1 text-xs font-semibold text-white"
                            >
                              NO
                            </button>
                          </Row>

                          {/* X button to remove - far right */}
                          {isEditable && answers.length > 2 && (
                            <button
                              onClick={() => {
                                if (onEditAnswers) {
                                  const newAnswers = answers.filter(
                                    (_, idx) => idx !== i
                                  )
                                  onEditAnswers(
                                    newAnswers.map((a) => a.text || '')
                                  )
                                }
                              }}
                              className="hover:bg-canvas-50 border-ink-300 text-ink-700 bg-canvas-0 focus:ring-primary-500 rounded-full border p-1 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
                            >
                              <XIcon className="h-5 w-5" aria-hidden="true" />
                            </button>
                          )}
                        </Row>

                        {/* Mobile layout: compact */}
                        <Row className="items-center gap-2 sm:hidden">
                          {/* Probability - on the left, smaller */}
                          <span className="text-ink-700 shrink-0 text-sm font-semibold">
                            {Math.round((mcProbs[i] || 0.5) * 100)}%
                          </span>

                          {/* Answer text/input - with relative positioning for X button */}
                          <div className="relative flex-1">
                            {isEditable ? (
                              <Input
                                className="w-full"
                                value={answer.text || ''}
                                onChange={(e) => {
                                  if (onEditAnswers) {
                                    const newAnswers = [...answers]
                                    newAnswers[i] = { text: e.target.value }
                                    onEditAnswers(
                                      newAnswers.map((a) => a.text || '')
                                    )
                                  }
                                }}
                                placeholder={`Range ${i + 1}`}
                              />
                            ) : (
                              <span className="text-ink-900 text-sm font-semibold">
                                {answer.text || `Range ${i + 1}`}
                              </span>
                            )}

                            {/* X button - positioned in top-right corner */}
                            {isEditable && answers.length > 2 && (
                              <button
                                onClick={() => {
                                  if (onEditAnswers) {
                                    const newAnswers = answers.filter(
                                      (_, idx) => idx !== i
                                    )
                                    onEditAnswers(
                                      newAnswers.map((a) => a.text || '')
                                    )
                                  }
                                }}
                                className="hover:bg-canvas-50 border-ink-300 text-ink-700 bg-canvas-0 focus:ring-primary-500 absolute -right-1 -top-1 rounded-full border p-0.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
                              >
                                <XIcon className="h-3 w-3" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        </Row>
                      </div>
                    ))}
                    {isEditable && (
                      <button
                        onClick={() => {
                          if (onEditAnswers) {
                            onEditAnswers([
                              ...answers.map((a) => a.text || ''),
                              '',
                            ])
                          }
                        }}
                        disabled={answers.length >= 12}
                        className="text-primary-600 hover:text-primary-700 disabled:text-ink-400 flex items-center gap-1 text-sm font-medium disabled:cursor-not-allowed"
                      >
                        <PlusIcon className="h-4 w-4" />
                        Add{' '}
                        {data.shouldAnswersSumToOne ? 'bucket' : 'threshold'}
                        {(() => {
                          // Calculate marginal cost for adding one more answer
                          const currentCost =
                            data.liquidityTier && answers.length > 0
                              ? (() => {
                                  const tierIndex = [
                                    100, 1000, 10000, 100000,
                                  ].indexOf(data.liquidityTier)
                                  const answerCostTiers = [25, 100, 250, 1000]
                                  return Math.max(
                                    answers.length * answerCostTiers[tierIndex],
                                    data.liquidityTier
                                  )
                                })()
                              : 0
                          const newCost =
                            data.liquidityTier && answers.length > 0
                              ? (() => {
                                  const tierIndex = [
                                    100, 1000, 10000, 100000,
                                  ].indexOf(data.liquidityTier)
                                  const answerCostTiers = [25, 100, 250, 1000]
                                  return Math.max(
                                    (answers.length + 1) *
                                      answerCostTiers[tierIndex],
                                    data.liquidityTier
                                  )
                                })()
                              : 0
                          const marginalCost = newCost - currentCost

                          return marginalCost > 0 ? (
                            <span className="text-ink-500 text-xs">
                              +{formatMoney(marginalCost)}
                            </span>
                          ) : null
                        })()}
                      </button>
                    )}
                  </Col>
                )}
              </>
            ) : (
              <div className="text-ink-400 border-ink-200 rounded border-2 border-dashed p-6 text-center text-sm">
                Set min and max values to see preview
              </div>
            )}
          </Col>
        )}

        {isDate && (
          <Col className="gap-3">
            {data.minString && data.maxString ? (
              <>
                {/* Date Range Display - Market-like with Expected Date */}
                {(() => {
                  // Helper to validate timestamp
                  const isValidTimestamp = (ts: number) =>
                    !isNaN(ts) && isFinite(ts) && ts > 0

                  const minDate =
                    data.midpoints && data.midpoints.length > 0
                      ? Math.min(...data.midpoints)
                      : null
                  const maxDate =
                    data.midpoints && data.midpoints.length > 0
                      ? Math.max(...data.midpoints)
                      : null

                  // Calculate expected date
                  const expectedDate = (() => {
                    if (
                      !answers.length ||
                      !data.midpoints ||
                      !data.midpoints.length
                    )
                      return null

                    const probs = mcProbs.slice(0, answers.length)
                    const midpoints = data.midpoints

                    if (!probs.length || !midpoints.length) return null

                    let result: number
                    if (data.shouldAnswersSumToOne) {
                      // Buckets: simple weighted average
                      result = probs.reduce(
                        (sum, p, i) => sum + p * (midpoints[i] || 0),
                        0
                      )
                    } else {
                      // Thresholds: discrete probabilities
                      const discreteProbs = [probs[0]]
                      for (let i = 1; i < probs.length; i++) {
                        discreteProbs.push(probs[i] - probs[i - 1])
                      }

                      let expected = 0
                      for (let i = 0; i < probs.length; i++) {
                        expected += (midpoints[i] || 0) * discreteProbs[i]
                      }

                      // Add tail probability
                      const afterLastProb = 1 - probs[probs.length - 1]
                      if (afterLastProb > 0 && midpoints.length > 1) {
                        const timePeriod =
                          midpoints[midpoints.length - 1] -
                          midpoints[midpoints.length - 2]
                        const beyondLast =
                          midpoints[midpoints.length - 1] + timePeriod
                        expected += beyondLast * afterLastProb
                      }

                      result = expected
                    }

                    return isValidTimestamp(result) ? result : null
                  })()

                  // Only show if all dates are valid
                  return minDate &&
                    maxDate &&
                    expectedDate &&
                    isValidTimestamp(minDate) &&
                    isValidTimestamp(maxDate) &&
                    isValidTimestamp(expectedDate) ? (
                    <div className="bg-ink-100 border-ink-200 rounded-lg border p-2 sm:p-3">
                      <Row className="items-center justify-center gap-1 text-xs sm:justify-between sm:gap-2">
                        <span className="text-ink-600 min-w-0 shrink text-[10px] sm:text-xs">
                          <span className="hidden sm:inline">📅 </span>
                          {new Intl.DateTimeFormat('en-US', {
                            month: 'short',
                            year: 'numeric',
                          }).format(minDate)}
                        </span>
                        <span className="text-ink-400 shrink-0">→</span>
                        <Col className="shrink-0 items-center gap-0.5">
                          <span className="text-ink-900 text-[11px] font-semibold sm:text-xs">
                            {new Intl.DateTimeFormat('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            }).format(expectedDate)}
                          </span>
                          <span className="text-ink-500 text-[9px] uppercase sm:text-[10px]">
                            Expected
                          </span>
                        </Col>
                        <span className="text-ink-400 shrink-0">→</span>
                        <span className="text-ink-600 min-w-0 shrink text-[10px] sm:text-xs">
                          <span className="hidden sm:inline">📅 </span>
                          {new Intl.DateTimeFormat('en-US', {
                            month: 'short',
                            year: 'numeric',
                          }).format(maxDate)}
                        </span>
                      </Row>
                    </div>
                  ) : null
                })()}
                {(!answers.length ||
                  !data.midpoints ||
                  !data.midpoints.length ||
                  !data.midpoints.every((m) => m > 0)) && (
                  <div className="bg-ink-100 border-ink-200 rounded-lg border p-2 sm:p-3">
                    <Row className="text-ink-600 justify-center gap-1 text-[10px] sm:justify-between sm:gap-2 sm:text-xs">
                      <span className="min-w-0 shrink">
                        <span className="hidden sm:inline">📅 </span>
                        {data.minString}
                      </span>
                      <span className="shrink-0">→</span>
                      <span className="min-w-0 shrink">
                        <span className="hidden sm:inline">📅 </span>
                        {data.maxString}
                      </span>
                    </Row>
                  </div>
                )}

                {/* Buckets/Thresholds Toggle */}
                {answers.length > 0 &&
                  isEditable &&
                  onToggleShouldAnswersSumToOne && (
                    <Row className="items-center justify-between gap-2">
                      <span className="text-ink-700 text-sm font-medium">
                        Answer type
                      </span>
                      <Row className="bg-ink-100 rounded-lg p-1">
                        <button
                          onClick={() => {
                            if (!data.shouldAnswersSumToOne) {
                              onToggleShouldAnswersSumToOne()
                            }
                          }}
                          className={clsx(
                            'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                            data.shouldAnswersSumToOne
                              ? 'bg-canvas-0 text-ink-900 shadow-sm'
                              : 'text-ink-600 hover:text-ink-900'
                          )}
                        >
                          Buckets
                        </button>
                        <button
                          onClick={() => {
                            if (data.shouldAnswersSumToOne) {
                              onToggleShouldAnswersSumToOne()
                            }
                          }}
                          className={clsx(
                            'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                            !data.shouldAnswersSumToOne
                              ? 'bg-canvas-0 text-ink-900 shadow-sm'
                              : 'text-ink-600 hover:text-ink-900'
                          )}
                        >
                          Thresholds
                        </button>
                      </Row>
                    </Row>
                  )}

                {/* Date Range Answers - Editable */}
                {isGeneratingDateRanges ? (
                  <div className="text-ink-500 border-ink-200 flex items-center justify-center gap-2 rounded border-2 border-dashed p-8 text-sm">
                    <div className="border-primary-500 h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"></div>
                    <span>Generating date ranges...</span>
                  </div>
                ) : answers.length > 0 ? (
                  <Col
                    className={clsx(
                      'gap-2 rounded-lg transition-all',
                      fieldErrors.answers ? 'p-3 ring-2 ring-red-200' : ''
                    )}
                  >
                    {answers.map((answer, i) => (
                      <div
                        key={i}
                        className="bg-canvas-0 border-ink-200 rounded-lg border p-3"
                      >
                        {/* Desktop layout: horizontal */}
                        <Row className="hidden items-center gap-3 sm:flex">
                          {/* Probability - Prominent on left like real markets */}
                          <span className="text-ink-700 min-w-[3rem] text-lg font-semibold">
                            {Math.round((mcProbs[i] || 0.5) * 100)}%
                          </span>

                          {/* Answer text/input - grows to fill space */}
                          {isEditable ? (
                            <>
                              <span className="text-ink-600 text-sm">
                                {i + 1}.
                              </span>
                              <Input
                                className="min-w-0 flex-1"
                                value={answer.text || ''}
                                onChange={(e) => {
                                  if (onEditAnswers) {
                                    const newAnswers = [...answers]
                                    newAnswers[i] = { text: e.target.value }
                                    onEditAnswers(
                                      newAnswers.map((a) => a.text || '')
                                    )
                                  }
                                }}
                                placeholder={`Range ${i + 1}`}
                                error={!!fieldErrors.answers}
                              />
                            </>
                          ) : (
                            <span className="text-ink-900 flex-1 text-sm font-semibold">
                              {answer.text || `Range ${i + 1}`}
                            </span>
                          )}

                          {/* YES/NO buttons - inline on right */}
                          <Row className="gap-2">
                            <button
                              tabIndex={-1}
                              className="opacity-85 cursor-not-allowed rounded bg-teal-500 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-600"
                            >
                              YES
                            </button>
                            <button
                              tabIndex={-1}
                              className="bg-scarlet-500 hover:bg-scarlet-600 opacity-85 cursor-not-allowed rounded px-3 py-1 text-xs font-semibold text-white"
                            >
                              NO
                            </button>
                          </Row>

                          {/* X button to remove - far right */}
                          {isEditable && answers.length > 2 && (
                            <button
                              onClick={() => {
                                if (onEditAnswers) {
                                  const newAnswers = answers.filter(
                                    (_, idx) => idx !== i
                                  )
                                  onEditAnswers(
                                    newAnswers.map((a) => a.text || '')
                                  )
                                }
                              }}
                              className="hover:bg-canvas-50 border-ink-300 text-ink-700 bg-canvas-0 focus:ring-primary-500 rounded-full border p-1 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
                            >
                              <XIcon className="h-5 w-5" aria-hidden="true" />
                            </button>
                          )}
                        </Row>

                        {/* Mobile layout: compact */}
                        <Row className="items-center gap-2 sm:hidden">
                          {/* Probability - on the left, smaller */}
                          <span className="text-ink-700 shrink-0 text-sm font-semibold">
                            {Math.round((mcProbs[i] || 0.5) * 100)}%
                          </span>

                          {/* Answer text/input - with relative positioning for X button */}
                          <div className="relative flex-1">
                            {isEditable ? (
                              <Input
                                className="w-full"
                                value={answer.text || ''}
                                onChange={(e) => {
                                  if (onEditAnswers) {
                                    const newAnswers = [...answers]
                                    newAnswers[i] = { text: e.target.value }
                                    onEditAnswers(
                                      newAnswers.map((a) => a.text || '')
                                    )
                                  }
                                }}
                                placeholder={`Range ${i + 1}`}
                              />
                            ) : (
                              <span className="text-ink-900 text-sm font-semibold">
                                {answer.text || `Range ${i + 1}`}
                              </span>
                            )}

                            {/* X button - positioned in top-right corner */}
                            {isEditable && answers.length > 2 && (
                              <button
                                onClick={() => {
                                  if (onEditAnswers) {
                                    const newAnswers = answers.filter(
                                      (_, idx) => idx !== i
                                    )
                                    onEditAnswers(
                                      newAnswers.map((a) => a.text || '')
                                    )
                                  }
                                }}
                                className="hover:bg-canvas-50 border-ink-300 text-ink-700 bg-canvas-0 focus:ring-primary-500 absolute -right-1 -top-1 rounded-full border p-0.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
                              >
                                <XIcon className="h-3 w-3" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        </Row>
                      </div>
                    ))}
                    {isEditable && (
                      <button
                        onClick={() => {
                          if (onEditAnswers) {
                            onEditAnswers([
                              ...answers.map((a) => a.text || ''),
                              '',
                            ])
                          }
                        }}
                        disabled={answers.length >= 12}
                        className="text-primary-600 hover:text-primary-700 disabled:text-ink-400 flex items-center gap-1 text-sm font-medium disabled:cursor-not-allowed"
                      >
                        <PlusIcon className="h-4 w-4" />
                        Add{' '}
                        {data.shouldAnswersSumToOne ? 'bucket' : 'threshold'}
                        {(() => {
                          // Calculate marginal cost for adding one more answer
                          const currentCost =
                            data.liquidityTier && answers.length > 0
                              ? (() => {
                                  const tierIndex = [
                                    100, 1000, 10000, 100000,
                                  ].indexOf(data.liquidityTier)
                                  const answerCostTiers = [25, 100, 250, 1000]
                                  return Math.max(
                                    answers.length * answerCostTiers[tierIndex],
                                    data.liquidityTier
                                  )
                                })()
                              : 0
                          const newCost =
                            data.liquidityTier && answers.length > 0
                              ? (() => {
                                  const tierIndex = [
                                    100, 1000, 10000, 100000,
                                  ].indexOf(data.liquidityTier)
                                  const answerCostTiers = [25, 100, 250, 1000]
                                  return Math.max(
                                    (answers.length + 1) *
                                      answerCostTiers[tierIndex],
                                    data.liquidityTier
                                  )
                                })()
                              : 0
                          const marginalCost = newCost - currentCost

                          return marginalCost > 0 ? (
                            <span className="text-ink-500 text-xs">
                              +{formatMoney(marginalCost)}
                            </span>
                          ) : null
                        })()}
                      </button>
                    )}
                  </Col>
                ) : (
                  <div className="text-ink-400 border-ink-200 rounded border-2 border-dashed p-4 text-center text-sm">
                    Generate date ranges below to see betting options
                  </div>
                )}
              </>
            ) : (
              <div className="text-ink-400 border-ink-200 rounded border-2 border-dashed p-6 text-center text-sm">
                Set date range to see preview
              </div>
            )}
          </Col>
        )}

        {/* Binary Probability Display */}
        {isBinary && (
          <BinaryProbabilitySection
            probability={probability}
            isEditable={isEditable}
            onProbabilityChange={onProbabilityChange}
          />
        )}

        {/* Description Editor */}
        {isEditable && descriptionEditor ? (
          <div className="relative">
            <div
              className={clsx(
                'text-ink-600 rounded-md text-sm transition-all',
                fieldErrors.description
                  ? 'ring-2 ring-red-500 focus-within:ring-2 focus-within:ring-red-500 dark:ring-red-600 dark:focus-within:ring-red-600'
                  : ''
              )}
            >
              <TextEditor editor={descriptionEditor} simple />
            </div>
            {onGenerateDescription && (
              <Button
                color="indigo-outline"
                size="xs"
                loading={isGeneratingDescription}
                onClick={onGenerateDescription}
                disabled={!question || isGeneratingDescription}
                className="absolute bottom-2 right-2"
              >
                Generate with AI
              </Button>
            )}
          </div>
        ) : !isEditable && description ? (
          <Col className="gap-2">
            <div className="text-ink-600 line-clamp-3 text-sm">
              <Content content={description} size="sm" />
            </div>
          </Col>
        ) : null}
      </Col>

      {/* Topics */}
      {isEditable && (
        <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1">
          {selectedGroups.map((topic) => (
            <TopicTag key={topic.id} topic={topic} location="create page" />
          ))}
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleSetTopicsModal(true)
            }}
            className="hover:bg-ink-400/20 text-ink-500 flex items-center rounded-md px-2 text-xs"
          >
            <PlusIcon className="mr-1 h-3" />
            Topics
          </button>
          <InfoTooltip text="Question will be displayed alongside the other questions in the topic." />
        </div>
      )}

      {/* Topics Modal */}
      {isEditable && onUpdateGroups && (
        <Modal
          open={isTopicsModalOpen}
          setOpen={handleSetTopicsModal}
          size="md"
        >
          <Col className="bg-canvas-0 max-h-[70vh] min-h-[20rem] overflow-auto rounded p-6">
            <ContractTopicsList
              canEdit={true}
              canEditTopic={() => true}
              topics={selectedGroups}
              addTopic={async (topic) => {
                onUpdateGroups([...selectedGroups, topic as Group])
              }}
              removeTopic={async (topic) => {
                onUpdateGroups(selectedGroups.filter((g) => g.id !== topic.id))
              }}
            />
          </Col>
        </Modal>
      )}

    </Col>
  )
}

// Binary Probability Section Component
function BinaryProbabilitySection(props: {
  probability: number
  isEditable: boolean
  onProbabilityChange?: (newProb: number) => void
}) {
  const { probability, isEditable, onProbabilityChange } = props
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [localProb, setLocalProb] = useState(probability)

  useEffect(() => {
    setLocalProb(probability)
  }, [probability])

  const handleProbChange = (newProb: number) => {
    const clamped = Math.max(5, Math.min(95, newProb))
    setLocalProb(clamped)
    onProbabilityChange?.(clamped)
  }

  return (
    <>
      <Row className="items-center gap-2">
        <span className="text-ink-700 text-2xl">
          {probability}% <span className="text-base">chance</span>
        </span>
        {isEditable && onProbabilityChange && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="text-ink-500 hover:text-ink-700"
          >
            <PencilIcon className="h-4 w-4" />
          </button>
        )}
      </Row>

      {/* Probability Adjustment Modal */}
      <Modal open={isModalOpen} setOpen={setIsModalOpen}>
        <Col className="bg-canvas-0 gap-4 rounded-lg p-6">
          <Col className="gap-1">
            <h2 className="text-primary-700 text-xl font-semibold">
              Set Starting Probability
            </h2>
            <p className="text-ink-600 text-sm">
              Your best guess at the probability that this market resolves YES.
              Determines how liquidity is dispersed. If you don't know, leave it
              at 50%.
            </p>
          </Col>

          <Col className="gap-2">
            <div className="text-ink-600">Probability (%)</div>
            <Row>
              <label className="font-sm md:font-lg relative w-full">
                <Input
                  type="number"
                  min={5}
                  max={95}
                  step={1}
                  className="h-[60px] w-full !text-xl"
                  value={localProb}
                  onChange={(e) => {
                    const val =
                      e.target.value === '' ? 50 : Number(e.target.value)
                    handleProbChange(val)
                  }}
                />
                <Row className="absolute right-2 top-3.5 gap-1.5 sm:gap-2">
                  <button
                    className="hover:bg-ink-200 bg-canvas-100 rounded-md px-2 py-1.5 text-sm sm:px-3"
                    onClick={() => handleProbChange(localProb - 5)}
                    tabIndex={-1}
                  >
                    -5
                  </button>
                  <button
                    className="hover:bg-ink-200 bg-canvas-100 rounded-md px-2 py-1.5 text-sm sm:px-3"
                    onClick={() => handleProbChange(localProb - 1)}
                    tabIndex={-1}
                  >
                    -1
                  </button>
                  <button
                    className="hover:bg-ink-200 bg-canvas-100 rounded-md px-2 py-1.5 text-sm sm:px-3"
                    onClick={() => handleProbChange(localProb + 1)}
                    tabIndex={-1}
                  >
                    +1
                  </button>
                  <button
                    className="hover:bg-ink-200 bg-canvas-100 rounded-md px-2 py-1.5 text-sm sm:px-3"
                    onClick={() => handleProbChange(localProb + 5)}
                    tabIndex={-1}
                  >
                    +5
                  </button>
                </Row>
              </label>
            </Row>

            <ProbabilitySlider
              prob={localProb}
              onProbChange={(newProb) => {
                if (newProb !== undefined) {
                  handleProbChange(newProb)
                }
              }}
              disabled={false}
            />
          </Col>

          <Button
            color="indigo"
            onClick={() => setIsModalOpen(false)}
            className="mt-4"
          >
            Done
          </Button>
        </Col>
      </Modal>
    </>
  )
}
