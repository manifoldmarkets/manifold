import { useState, useEffect } from 'react'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import { BinaryResolutionOrChance } from 'web/components/contract/contract-price'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'
import { VisibilityIcon } from 'web/components/contract/contracts-table'
import { formatMoney } from 'common/util/format'
import { removeEmojis } from 'common/util/string'
import { JSONContent } from '@tiptap/core'
import { getUniqueBettorBonusAmount } from 'common/economy'
import { Tooltip } from 'web/components/widgets/tooltip'
import { Content, TextEditor } from 'web/components/widgets/editor'
import { Editor } from '@tiptap/react'
import { Input } from 'web/components/widgets/input'
import dayjs from 'dayjs'
import { Group } from 'common/group'
import { TopicTag } from '../topics/topic-tag'
import { PlusIcon, EyeIcon, EyeOffIcon, XIcon } from '@heroicons/react/solid'
import { Modal } from '../layout/modal'
import { ContractTopicsList } from '../topics/contract-topics-list'
import { InfoTooltip } from '../widgets/info-tooltip'
import { ExpandingInput } from '../widgets/expanding-input'
import { MAX_ANSWERS, MAX_ANSWER_LENGTH } from 'common/answer'
import { Button } from '../buttons/button'

export type PreviewContractData = {
  question: string
  outcomeType:
    | 'BINARY'
    | 'MULTIPLE_CHOICE'
    | 'PSEUDO_NUMERIC'
    | 'STONK'
    | 'NUMBER'
    | 'POLL'
    | 'BOUNTIED_QUESTION'
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
  totalBounty?: number

  // Multiple choice specific
  shouldAnswersSumToOne?: boolean
  addAnswersMode?: 'DISABLED' | 'ONLY_CREATOR' | 'ANYONE'
}

// Helper function to format liquidity display text
function getLiquidityDisplayText(
  liquidityTier: number | undefined,
  numAnswers: number
): string {
  if (!liquidityTier) return 'Medium liquidity'

  const bonus = getUniqueBettorBonusAmount(liquidityTier, numAnswers)
  return `${formatMoney(liquidityTier)} liquidity, ${formatMoney(
    bonus
  )} unique trader bonus`
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
  } = props
  const [isTopicsModalOpen, setIsTopicsModalOpen] = useState(false)

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

  const {
    question,
    outcomeType,
    description,
    probability = 50,
    answers = [],
    closeTime,
    visibility,
    liquidityTier,
    min,
    max,
    unit,
    totalBounty,
  } = data

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
      outcomeType === 'POLL' || outcomeType === 'BOUNTIED_QUESTION'
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
      // For thresholds, probabilities should increase cumulatively
      mcProbs = answers.map((_, i) => (i + 1) / (answers.length + 1))
    }
  }

  const isBinary = outcomeType === 'BINARY'
  const isMultipleChoice = outcomeType === 'MULTIPLE_CHOICE'
  const isPoll = outcomeType === 'POLL'
  const isBountiedQuestion = outcomeType === 'BOUNTIED_QUESTION'
  const isNumeric = outcomeType === 'MULTI_NUMERIC' || outcomeType === 'NUMBER'
  const isDate = outcomeType === 'DATE'
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'

  return (
    <Col
      className={clsx(
        'bg-canvas-0 ring-ink-100 relative gap-3 rounded-lg p-4 shadow-md ring-1',
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
            className="text-ink-600 hidden text-sm sm:inline"
          />
          {isEditable && onToggleVisibility ? (
            <>
              <span className="text-ink-400 text-sm">·</span>
              <Tooltip
                text={
                  visibility === 'unlisted'
                    ? 'Click to make public'
                    : 'Click to make unlisted'
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
            <span className="text-ink-600 text-xs">Closes:</span>
            <Input
              type="date"
              className="dark:date-range-input-white text-xs"
              onChange={(e) => {
                if (e.target.value) {
                  setCloseDate(new Date(e.target.value))
                }
              }}
              min={dayjs().format('YYYY-MM-DD')}
              max="9999-12-31"
              value={closeDate ? dayjs(closeDate).format('YYYY-MM-DD') : ''}
            />
          </Row>
        )}
      </Row>

      {/* Question */}
      {isEditable && onEditQuestion ? (
        <textarea
          id="market-preview-title-input"
          value={question || ''}
          onChange={(e) => {
            // Remove any line breaks from the input
            const cleanedValue = e.target.value.replace(/[\r\n]/g, '')
            onEditQuestion(cleanedValue)
            // Auto-resize textarea to fit content
            e.target.style.height = 'auto'
            e.target.style.height = e.target.scrollHeight + 'px'
          }}
          onInput={(e) => {
            // Also handle on input for better responsiveness
            const target = e.target as HTMLTextAreaElement
            target.style.height = 'auto'
            target.style.height = target.scrollHeight + 'px'
          }}
          onKeyDown={(e) => {
            // Prevent Enter key from creating line breaks
            if (e.key === 'Enter') {
              e.preventDefault()
            }
          }}
          placeholder="What's your question?"
          className="text-ink-1000 placeholder:text-ink-400 border-ink-300 hover:ring-primary-500 focus:ring-primary-500 focus:border-primary-500 bg-canvas-0 w-full resize-none overflow-hidden rounded-md border px-4 py-3 text-lg font-semibold shadow-sm transition-colors hover:ring-1 focus:outline-none focus:ring-1 sm:text-xl"
          rows={1}
          maxLength={120}
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

      {/* Date Range Inputs - Below Question for DATE markets */}
      {isDate && isEditable && onDateRangeChange && (
        <Col className="bg-ink-50 border-ink-200 -mx-4 -mb-1 gap-2 rounded-lg border px-4 py-3">
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
        <Col className="bg-ink-50 border-ink-200 -mx-4 -mb-1 gap-2 rounded-lg border px-4 py-3">
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
            <Row className="justify-center">
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
        {isBinary && mockContract.mechanism === 'cpmm-1' && (
          <>
            <Col className="items-center gap-2">
              <BinaryResolutionOrChance
                contract={mockContract as any}
                className="text-4xl sm:text-5xl md:text-6xl lg:text-6xl"
              />
              {isEditable && onProbabilityChange && (
                <input
                  type="range"
                  min="1"
                  max="99"
                  value={probability}
                  onChange={(e) =>
                    onProbabilityChange(parseFloat(e.target.value))
                  }
                  className="h-1.5 w-32 cursor-pointer appearance-none rounded-lg sm:h-2 sm:w-40 md:h-2.5 md:w-48 lg:h-2.5 lg:w-48"
                  style={{
                    background: `linear-gradient(to right, rgb(34 197 94) 0%, rgb(34 197 94) ${probability}%, rgb(239 68 68) ${probability}%, rgb(239 68 68) 100%)`,
                  }}
                />
              )}
            </Col>
            <Row className="gap-2">
              {isEditable && onProbabilityChange ? (
                <>
                  <button
                    onClick={() => {
                      const newProb = Math.min(99, probability + 1)
                      onProbabilityChange(newProb)
                    }}
                    className="flex-1 rounded-lg bg-teal-500 px-4 py-3 text-center font-semibold text-white transition-colors hover:bg-teal-600"
                  >
                    Bet Yes
                  </button>
                  <button
                    onClick={() => {
                      const newProb = Math.max(1, probability - 1)
                      onProbabilityChange(newProb)
                    }}
                    className="bg-scarlet-500 hover:bg-scarlet-600 flex-1 rounded-lg px-4 py-3 text-center font-semibold text-white transition-colors"
                  >
                    Bet No
                  </button>
                </>
              ) : (
                <>
                  <div className="flex-1 cursor-not-allowed rounded-lg bg-teal-500 px-4 py-3 text-center font-semibold text-white opacity-60 hover:bg-teal-600">
                    Bet Yes
                  </div>
                  <div className="bg-scarlet-500 hover:bg-scarlet-600 flex-1 cursor-not-allowed rounded-lg px-4 py-3 text-center font-semibold text-white opacity-60">
                    Bet No
                  </div>
                </>
              )}
            </Row>
          </>
        )}

        {isMultipleChoice && (
          <Col className="gap-2">
            {answers.length > 0 ? (
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
                        <ExpandingInput
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
                          rows={1}
                          maxLength={MAX_ANSWER_LENGTH}
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
                          className="cursor-not-allowed rounded bg-teal-500 px-3 py-1 text-xs font-semibold text-white opacity-60 hover:bg-teal-600"
                        >
                          YES
                        </button>
                        <button
                          tabIndex={-1}
                          className="bg-scarlet-500 hover:bg-scarlet-600 cursor-not-allowed rounded px-3 py-1 text-xs font-semibold text-white opacity-60"
                        >
                          NO
                        </button>
                      </Row>

                      {/* X button to remove - far right */}
                      {isEditable && onEditAnswers && answers.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            const newAnswers = answers.filter(
                              (_, idx) => idx !== i
                            )
                            onEditAnswers(newAnswers.map((a) => a.text))
                          }}
                          className="hover:bg-canvas-50 border-ink-300 text-ink-700 bg-canvas-0 focus:ring-primary-500 rounded-full border p-1 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
                        >
                          <XIcon className="h-5 w-5" aria-hidden="true" />
                        </button>
                      )}
                    </Row>

                    {/* Mobile layout: stacked */}
                    <Col className="gap-2 sm:hidden">
                      {/* Answer text/input - full width */}
                      {isEditable && onEditAnswers ? (
                        <ExpandingInput
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
                          rows={1}
                          maxLength={MAX_ANSWER_LENGTH}
                        />
                      ) : (
                        <span className="text-ink-900 text-sm font-semibold">
                          {answer.text || `Answer ${i + 1}`}
                        </span>
                      )}

                      {/* Probability and remove button */}
                      <Row className="items-center justify-between">
                        <span className="text-ink-700 text-lg font-semibold">
                          {Math.round(mcProbs[i] * 100)}%
                        </span>
                        {isEditable && onEditAnswers && answers.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              const newAnswers = answers.filter(
                                (_, idx) => idx !== i
                              )
                              onEditAnswers(newAnswers.map((a) => a.text))
                            }}
                            className="hover:bg-canvas-50 border-ink-300 text-ink-700 bg-canvas-0 focus:ring-primary-500 rounded-full border p-1 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
                          >
                            <XIcon className="h-5 w-5" aria-hidden="true" />
                          </button>
                        )}
                      </Row>
                    </Col>
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
                          <Tooltip text="Bet on all answers that aren't listed yet. A bet on Other automatically includes any answer added in the future.">
                            <span className="text-ink-400 cursor-help text-xs">
                              ⓘ
                            </span>
                          </Tooltip>
                        </Row>

                        {/* YES/NO buttons - inline on right (hidden on mobile) */}
                        <Row className="hidden gap-2 sm:flex">
                          <button
                            tabIndex={-1}
                            className="cursor-not-allowed rounded bg-teal-500 px-3 py-1 text-xs font-semibold text-white opacity-60 hover:bg-teal-600"
                          >
                            YES
                          </button>
                          <button
                            tabIndex={-1}
                            className="bg-scarlet-500 hover:bg-scarlet-600 cursor-not-allowed rounded px-3 py-1 text-xs font-semibold text-white opacity-60"
                          >
                            NO
                          </button>
                        </Row>

                        {/* Spacer to align with X button above */}
                        <div className="w-7" />
                      </Row>
                    </div>
                  )}

                {/* Add answer button */}
                {isEditable &&
                  onEditAnswers &&
                  answers.length < MAX_ANSWERS && (
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
              </>
            ) : (
              <div className="text-ink-400 border-ink-200 rounded border-2 border-dashed p-6 text-center text-sm">
                Add at least 2 answer options to see your market preview
              </div>
            )}
          </Col>
        )}

        {isPoll && answers.length > 0 && (
          <Col className="gap-2">
            {answers.map((answer, i) => (
              <div
                key={i}
                className="bg-ink-100 hover:bg-ink-200 rounded px-4 py-2 text-sm transition-colors"
              >
                {answer.text || (
                  <span className="text-ink-400">Answer {i + 1}</span>
                )}
              </div>
            ))}
          </Col>
        )}

        {isPoll && answers.length === 0 && (
          <div className="text-ink-400 border-ink-200 rounded border-2 border-dashed p-6 text-center text-sm">
            Add at least 2 options for your poll
          </div>
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
                  <div className="bg-ink-100 border-ink-200 rounded-lg border p-3">
                    <Row className="items-center justify-between gap-2 text-xs">
                      <span className="text-ink-600 flex-shrink-0">
                        Min: {min}
                        {unit ? ` ${unit}` : ''}
                      </span>
                      <span className="text-ink-400">→</span>
                      <Col className="flex-shrink-0 items-center gap-0.5">
                        <span className="text-ink-900 font-semibold">
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
                        <span className="text-ink-500 text-[10px] uppercase">
                          Expected
                        </span>
                      </Col>
                      <span className="text-ink-400">→</span>
                      <span className="text-ink-600 flex-shrink-0">
                        Max: {max}
                        {unit ? ` ${unit}` : ''}
                      </span>
                    </Row>
                  </div>
                ) : (
                  <div className="bg-ink-100 border-ink-200 rounded-lg border p-3">
                    <Row className="text-ink-600 justify-between text-xs">
                      <span>
                        Min: {min}
                        {unit ? ` ${unit}` : ''}
                      </span>
                      <span>→</span>
                      <span>
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
                  <Col className="gap-2">
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
                              className="cursor-not-allowed rounded bg-teal-500 px-3 py-1 text-xs font-semibold text-white opacity-60 hover:bg-teal-600"
                            >
                              YES
                            </button>
                            <button
                              tabIndex={-1}
                              className="bg-scarlet-500 hover:bg-scarlet-600 cursor-not-allowed rounded px-3 py-1 text-xs font-semibold text-white opacity-60"
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

                        {/* Mobile layout: stacked */}
                        <Col className="gap-2 sm:hidden">
                          {/* Answer text/input - full width */}
                          {isEditable ? (
                            <Row className="items-center gap-2">
                              <span className="text-ink-600 text-sm">
                                {i + 1}.
                              </span>
                              <Input
                                className="flex-1"
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
                            </Row>
                          ) : (
                            <span className="text-ink-900 text-sm font-semibold">
                              {answer.text || `Range ${i + 1}`}
                            </span>
                          )}

                          {/* Probability and remove button */}
                          <Row className="items-center justify-between">
                            <span className="text-ink-700 text-lg font-semibold">
                              {Math.round((mcProbs[i] || 0.5) * 100)}%
                            </span>
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
                        </Col>
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
                {answers.length > 0 &&
                data.midpoints &&
                data.midpoints.length > 0 &&
                data.midpoints.every((m) => m > 0) ? (
                  <div className="bg-ink-100 border-ink-200 rounded-lg border p-3">
                    <Row className="items-center justify-between gap-2 text-xs">
                      <span className="text-ink-600 flex-shrink-0">
                        📅{' '}
                        {new Intl.DateTimeFormat('en-US', {
                          month: 'short',
                          year: 'numeric',
                        }).format(Math.min(...data.midpoints))}
                      </span>
                      <span className="text-ink-400">→</span>
                      <Col className="flex-shrink-0 items-center gap-0.5">
                        <span className="text-ink-900 font-semibold">
                          {new Intl.DateTimeFormat('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          }).format(
                            (() => {
                              // Calculate expected date from probabilities and midpoints
                              const probs = mcProbs.slice(0, answers.length)
                              const midpoints = data.midpoints || []

                              if (!probs.length || !midpoints.length)
                                return Date.now()

                              if (data.shouldAnswersSumToOne) {
                                // Buckets: simple weighted average
                                return probs.reduce(
                                  (sum, p, i) => sum + p * midpoints[i],
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
                                  expected += midpoints[i] * discreteProbs[i]
                                }

                                // Add tail probability
                                const afterLastProb =
                                  1 - probs[probs.length - 1]
                                if (afterLastProb > 0 && midpoints.length > 1) {
                                  const timePeriod =
                                    midpoints[midpoints.length - 1] -
                                    midpoints[midpoints.length - 2]
                                  const beyondLast =
                                    midpoints[midpoints.length - 1] + timePeriod
                                  expected += beyondLast * afterLastProb
                                }

                                return expected
                              }
                            })()
                          )}
                        </span>
                        <span className="text-ink-500 text-[10px] uppercase">
                          Expected
                        </span>
                      </Col>
                      <span className="text-ink-400">→</span>
                      <span className="text-ink-600 flex-shrink-0">
                        📅{' '}
                        {new Intl.DateTimeFormat('en-US', {
                          month: 'short',
                          year: 'numeric',
                        }).format(Math.max(...data.midpoints))}
                      </span>
                    </Row>
                  </div>
                ) : (
                  <div className="bg-ink-100 border-ink-200 rounded-lg border p-3">
                    <Row className="text-ink-600 justify-between text-xs">
                      <span>📅 {data.minString}</span>
                      <span>→</span>
                      <span>📅 {data.maxString}</span>
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
                  <Col className="gap-2">
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
                              className="cursor-not-allowed rounded bg-teal-500 px-3 py-1 text-xs font-semibold text-white opacity-60 hover:bg-teal-600"
                            >
                              YES
                            </button>
                            <button
                              tabIndex={-1}
                              className="bg-scarlet-500 hover:bg-scarlet-600 cursor-not-allowed rounded px-3 py-1 text-xs font-semibold text-white opacity-60"
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

                        {/* Mobile layout: stacked */}
                        <Col className="gap-2 sm:hidden">
                          {/* Answer text/input - full width */}
                          {isEditable ? (
                            <Row className="items-center gap-2">
                              <span className="text-ink-600 text-sm">
                                {i + 1}.
                              </span>
                              <Input
                                className="flex-1"
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
                            </Row>
                          ) : (
                            <span className="text-ink-900 text-sm font-semibold">
                              {answer.text || `Range ${i + 1}`}
                            </span>
                          )}

                          {/* Probability and remove button */}
                          <Row className="items-center justify-between">
                            <span className="text-ink-700 text-lg font-semibold">
                              {Math.round((mcProbs[i] || 0.5) * 100)}%
                            </span>
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
                        </Col>
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

        {isBountiedQuestion && (
          <Row className="items-center gap-2 rounded bg-teal-50 p-3">
            <span className="text-2xl text-teal-700">💰</span>
            <Col className="gap-0.5">
              <span className="text-ink-900 font-semibold">
                {formatMoney(totalBounty || 0)} bounty
              </span>
              <span className="text-ink-600 text-xs">
                Award to the best answer
              </span>
            </Col>
          </Row>
        )}

        {/* Description Editor */}
        {isEditable && descriptionEditor ? (
          <Col className="gap-2">
            <div className="text-ink-600 text-sm">
              <TextEditor editor={descriptionEditor} simple />
            </div>
          </Col>
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

      {/* Footer Info */}
      <Row className="text-ink-500 items-center gap-3 text-xs">
        <Row className="items-center gap-1">
          <span>{getLiquidityDisplayText(liquidityTier, answers.length)}</span>
          {answers.length > 0 && (isMultipleChoice || isNumeric || isDate) && (
            <InfoTooltip text="Adding more answers later may reduce the bonus." />
          )}
        </Row>
        {min !== undefined && max !== undefined && (
          <>
            <span>·</span>
            <span>
              Range: {min} - {max}
              {unit ? ` ${unit}` : ''}
            </span>
          </>
        )}
        {isNumeric &&
          answers.length > 0 &&
          data.midpoints &&
          data.midpoints.length > 0 && (
            <>
              <span>·</span>
              <span className="flex items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 font-medium text-teal-700">
                <svg
                  className="h-3 w-3"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                Numeric ranges
              </span>
            </>
          )}
      </Row>
    </Col>
  )
}
