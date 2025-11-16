import { useState, useEffect, useCallback } from 'react'
import clsx from 'clsx'
import { User } from 'common/user'
import { CreateableOutcomeType } from 'common/contract'
import { JSONContent } from '@tiptap/core'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Button } from '../buttons/button'
import { MarketPreview, PreviewContractData } from './market-preview'
import { ContextualEditorPanel, FormState } from './contextual-editor-panel'
import {
  validateContractForm,
  ContractFormState,
} from 'web/lib/validation/contract-validation'
import { formatMoney } from 'common/util/format'
import { api, getSimilarGroupsToContract } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'
import { NewQuestionParams } from './new-contract-panel'
import Router from 'next/router'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { getAnte } from 'common/economy'
import { useTextEditor } from 'web/components/widgets/editor'
import { TypeSwitcherModal } from './type-switcher-modal'
import { ProminentTypeSelector } from './prominent-type-selector'
import dayjs from 'dayjs'
import { useEvent } from 'client-common/hooks/use-event'
import ShortToggle from '../widgets/short-toggle'
import { ChoicesToggleGroup } from '../widgets/choices-toggle-group'
import { InfoTooltip } from '../widgets/info-tooltip'
import { CheckCircleIcon } from '@heroicons/react/solid'
import { Tooltip } from '../widgets/tooltip'
import { Modal } from '../layout/modal'
import { CloseTimeSection } from './close-time-section'
import { BOTTOM_NAV_BAR_HEIGHT } from '../nav/bottom-nav-bar'
import { MarketDraft } from 'common/drafts'
import { toast } from 'react-hot-toast'
import { richTextToString } from 'common/util/parse'
import { RelativeTimestamp } from '../relative-timestamp'
import { debounce } from 'lodash'

const MAX_DESCRIPTION_LENGTH = 16000

export function NewContractPanel(props: {
  creator: User
  params?: NewQuestionParams
}) {
  const { creator, params } = props

  // Initialize form state with defaults
  const getDefaultFormState = (): FormState => ({
    question: params?.q || '',
    outcomeType: (params?.outcomeType as any) || 'BINARY', // Default to binary market
    description: params?.description
      ? JSON.parse(params.description)
      : undefined,
    answers: params?.answers || [],
    closeDate: params?.closeTime
      ? new Date(params.closeTime).toISOString().split('T')[0]
      : undefined,
    closeHoursMinutes: '23:59',
    neverCloses: false,
    selectedGroups: [],
    visibility: (params?.visibility as 'public' | 'unlisted') || 'public',
    liquidityTier: 100, // Default to tier 0 (100 mana)
    shouldAnswersSumToOne: params?.shouldAnswersSumToOne ?? true,
    addAnswersMode: params?.addAnswersMode || 'DISABLED',
    probability: 50,
    totalBounty: 100,
    min: params?.min,
    max: params?.max,
    minString: params?.min?.toString() || '',
    maxString: params?.max?.toString() || '',
    unit: params?.unit || '',
    midpoints: [],
  })

  const [formState, setFormState] = usePersistentLocalState<FormState>(
    getDefaultFormState(),
    'new-contract-form-v2'
  )

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string>()
  const [isTypeSwitcherOpen, setIsTypeSwitcherOpen] = useState(false)
  const [hasManuallyEditedCloseDate, setHasManuallyEditedCloseDate] =
    useState(false)
  const [showResetConfirmation, setShowResetConfirmation] = useState(false)
  const [isCloseDateModalOpen, setIsCloseDateModalOpen] = useState(false)
  const [triggerTopicsModalOpen, setTriggerTopicsModalOpen] = useState(false)
  const [drafts, setDrafts] = useState<MarketDraft[]>([])
  const [showDraftsModal, setShowDraftsModal] = useState(false)
  const [isSavingDraft, setIsSavingDraft] = useState(false)

  // Cache for DATE market ranges (to avoid regenerating on toggle)
  const [dateBuckets, setDateBuckets] = useState<{
    answers: string[]
    midpoints: number[]
  }>({ answers: [], midpoints: [] })
  const [dateThresholds, setDateThresholds] = useState<{
    answers: string[]
    midpoints: number[]
  }>({ answers: [], midpoints: [] })
  const [isGeneratingDateRanges, setIsGeneratingDateRanges] = useState(false)

  // Cache for MULTI_NUMERIC market ranges (to avoid regenerating on toggle)
  const [numericBuckets, setNumericBuckets] = useState<{
    answers: string[]
    midpoints: number[]
  }>({ answers: [], midpoints: [] })
  const [numericThresholds, setNumericThresholds] = useState<{
    answers: string[]
    midpoints: number[]
  }>({ answers: [], midpoints: [] })
  const [isGeneratingNumericRanges, setIsGeneratingNumericRanges] =
    useState(false)

  // Create description editor with dynamic placeholder based on market type
  const getDescriptionPlaceholder = () => {
    if (formState.outcomeType === 'POLL') {
      return 'Describe what this poll is about...'
    }
    return 'Write something like... This market resolves YES when X condition(s) are met, otherwise it resolves NO. It may resolve NO early if Y condition(s) are met'
  }

  const descriptionEditor = useTextEditor({
    key: 'new-contract-v2-description',
    size: 'md',
    max: MAX_DESCRIPTION_LENGTH,
    placeholder: getDescriptionPlaceholder(),
  })

  // Sync editor content with form state
  useEffect(() => {
    if (descriptionEditor && formState.description) {
      descriptionEditor.commands.setContent(formState.description)
    }
  }, []) // Only on mount

  // Update placeholder when outcome type changes
  useEffect(() => {
    if (descriptionEditor) {
      const newPlaceholder = getDescriptionPlaceholder()
      descriptionEditor.extensionManager.extensions.forEach((extension: any) => {
        if (extension.name === 'placeholder') {
          extension.options.placeholder = newPlaceholder
        }
      })
      descriptionEditor.view.dispatch(descriptionEditor.state.tr)
    }
  }, [formState.outcomeType])

  useEffect(() => {
    if (descriptionEditor) {
      const content = descriptionEditor.getJSON()
      updateField('description', content)
    }
  }, [descriptionEditor?.state.doc])

  // Update form state
  const updateField = (field: string, value: any) => {
    setFormState((prev) => ({ ...prev, [field]: value }))
  }

  // Reset all form fields
  const handleReset = () => {
    setFormState(getDefaultFormState())
    setHasManuallyEditedCloseDate(false)
    setShowResetConfirmation(false)
    if (descriptionEditor) {
      descriptionEditor.commands.clearContent()
    }
    track('reset form v2')
  }

  // Helper to check if description has actual content
  const hasDescription = (description: JSONContent | undefined): boolean => {
    if (!description || !description.content) return false

    // Check if content array is empty
    if (description.content.length === 0) return false

    // Check if content only contains empty paragraphs
    const hasActualContent = description.content.some((node: any) => {
      // If node has text content, it's not empty
      if (node.text && node.text.trim().length > 0) return true

      // If node has nested content, check recursively
      if (node.content && node.content.length > 0) {
        return node.content.some(
          (child: any) => child.text && child.text.trim().length > 0
        )
      }

      // If it's not a paragraph (e.g., image, video), count it as content
      if (node.type && node.type !== 'paragraph') return true

      return false
    })

    return hasActualContent
  }

  // Load drafts on mount
  useEffect(() => {
    loadDrafts()
  }, [])

  const loadDrafts = async () => {
    try {
      const drafts = await api('get-market-drafts', {})
      setDrafts(drafts)
    } catch (error) {
      console.error('Error loading drafts:', error)
    }
  }

  const saveDraftToDb = async () => {
    // Don't save if no outcome type is selected
    if (!formState.outcomeType) {
      toast.error('Please select a question type before saving')
      return
    }

    setIsSavingDraft(true)
    try {
      const draft = {
        question: formState.question,
        description: formState.description,
        outcomeType: formState.outcomeType,
        answers: formState.answers,
        closeDate: formState.closeDate,
        closeHoursMinutes: formState.closeHoursMinutes,
        visibility: formState.visibility,
        selectedGroups: formState.selectedGroups,
        savedAt: Date.now(),
      }
      await api('save-market-draft', { data: draft as any })
      toast.success('Draft saved')
      await loadDrafts()
    } catch (error) {
      console.error('Error saving draft:', error)
      toast.error('Error saving draft')
    } finally {
      setIsSavingDraft(false)
    }
  }

  const loadDraftFromDb = async (draft: MarketDraft) => {
    try {
      setFormState({
        ...formState,
        question: draft.data.question,
        description: draft.data.description,
        outcomeType: draft.data.outcomeType as any,
        answers: draft.data.answers,
        closeDate: draft.data.closeDate,
        closeHoursMinutes: draft.data.closeHoursMinutes,
        visibility: draft.data.visibility,
        selectedGroups: draft.data.selectedGroups,
      })
      if (draft.data.description && descriptionEditor) {
        descriptionEditor.commands.setContent(draft.data.description)
      }
      setShowDraftsModal(false)
      toast.success('Draft loaded')
    } catch (error) {
      console.error('Error loading draft:', error)
    }
  }

  const deleteDraft = async (id: number) => {
    try {
      await api('delete-market-draft', { id })
      await loadDrafts()
      toast.success('Draft deleted')
    } catch (error) {
      console.error('Error deleting draft:', error)
    }
  }

  // Validate form
  const validation = validateContractForm(formState as ContractFormState)

  // Auto-extract close date from question
  const getAISuggestedCloseDate = useEvent(async (question: string) => {
    const shouldHaveCloseDate =
      formState.outcomeType !== 'POLL' &&
      formState.outcomeType !== 'BOUNTIED_QUESTION'

    if (
      !question ||
      question.length < 20 ||
      !shouldHaveCloseDate ||
      hasManuallyEditedCloseDate
    ) {
      return
    }

    try {
      const result = await api('get-close-date', {
        question,
        utcOffset: new Date().getTimezoneOffset() * -1,
      })

      if (result?.closeTime && !hasManuallyEditedCloseDate) {
        const dateStr = dayjs(result.closeTime).format('YYYY-MM-DD')
        const time = dayjs(result.closeTime).format('HH:mm')
        updateField('closeDate', dateStr)
        updateField('closeHoursMinutes', time)
      }
    } catch (e) {
      console.error('Error getting suggested close date:', e)
    }
  })

  // Auto-suggest topics from question
  const findTopicsAndSimilarQuestions = useEvent(async (question: string) => {
    if (!question || question.length < 10) {
      return
    }

    try {
      const result = await getSimilarGroupsToContract({ question })
      if (result?.groups && result.groups.length > 0) {
        // Only auto-add if user hasn't manually selected topics
        if (formState.selectedGroups.length === 0) {
          updateField('selectedGroups', result.groups.slice(0, 3))
        }
      }
    } catch (e) {
      console.error('Error getting suggested topics:', e)
    }
  })

  // Trigger auto-suggestions when question changes
  useEffect(() => {
    if (formState.question && formState.question.length >= 20) {
      const timer = setTimeout(() => {
        getAISuggestedCloseDate(formState.question)
        findTopicsAndSimilarQuestions(formState.question)
      }, 1000) // Debounce for 1 second

      return () => clearTimeout(timer)
    }
  }, [formState.question])

  // AI-powered answer generation for Multiple Choice
  const [isGeneratingAnswers, setIsGeneratingAnswers] = useState(false)

  const generateAnswers = async () => {
    if (!formState.question || formState.outcomeType !== 'MULTIPLE_CHOICE')
      return

    setIsGeneratingAnswers(true)
    try {
      const description = descriptionEditor
        ? richTextToString(descriptionEditor.getJSON())
        : ''
      const result = await api('generate-ai-answers', {
        question: formState.question,
        description,
        shouldAnswersSumToOne: formState.shouldAnswersSumToOne ?? false,
        answers: formState.answers,
      })

      if (result?.answers && result.answers.length > 0) {
        // Append new answers to existing ones
        updateField('answers', [...formState.answers, ...result.answers])
      }
      if (result?.addAnswersMode) {
        updateField('addAnswersMode', result.addAnswersMode)
      }
    } catch (e) {
      console.error('Error generating answers:', e)
      toast.error('Failed to generate answers')
    } finally {
      setIsGeneratingAnswers(false)
    }
  }

  // Debounced handler for regenerating DATE midpoints when answers are edited
  const regenerateDateMidpoints = async (answers: string[]) => {
    if (
      formState.outcomeType !== 'DATE' ||
      !formState.question ||
      !formState.minString ||
      !formState.maxString
    )
      return
    if (answers.every((a) => a.trim() === '')) return

    try {
      const result = await api('regenerate-date-midpoints', {
        question: formState.question,
        answers,
        min: formState.minString,
        max: formState.maxString,
        description: descriptionEditor
          ? richTextToString(descriptionEditor.getJSON())
          : '',
        tab: formState.shouldAnswersSumToOne ? 'buckets' : 'thresholds',
      })

      updateField('midpoints', result.midpoints)

      // Update cache for current mode
      if (formState.shouldAnswersSumToOne) {
        setDateBuckets({ answers, midpoints: result.midpoints })
      } else {
        setDateThresholds({ answers, midpoints: result.midpoints })
      }
    } catch (e) {
      console.error('Error regenerating date midpoints:', e)
    }
  }

  const debouncedRegenerateDateMidpoints = useCallback(
    debounce((answers: string[]) => regenerateDateMidpoints(answers), 1500),
    [
      formState.question,
      formState.minString,
      formState.maxString,
      formState.shouldAnswersSumToOne,
    ]
  )

  // Debounced handler for regenerating MULTI_NUMERIC midpoints when answers are edited
  const regenerateNumericMidpoints = async (answers: string[]) => {
    if (
      formState.outcomeType !== 'MULTI_NUMERIC' ||
      !formState.question ||
      formState.min === undefined ||
      formState.max === undefined
    )
      return
    if (answers.every((a) => a.trim() === '')) return

    try {
      const result = await api('regenerate-numeric-midpoints', {
        question: formState.question,
        answers,
        min: formState.min,
        max: formState.max,
        unit: formState.unit || '',
        description: descriptionEditor
          ? richTextToString(descriptionEditor.getJSON())
          : '',
        tab: formState.shouldAnswersSumToOne ? 'buckets' : 'thresholds',
      })

      updateField('midpoints', result.midpoints)

      // Update cache for current mode
      if (formState.shouldAnswersSumToOne) {
        setNumericBuckets({ answers, midpoints: result.midpoints })
      } else {
        setNumericThresholds({ answers, midpoints: result.midpoints })
      }
    } catch (e) {
      console.error('Error regenerating numeric midpoints:', e)
    }
  }

  const debouncedRegenerateNumericMidpoints = useCallback(
    debounce((answers: string[]) => regenerateNumericMidpoints(answers), 1500),
    [
      formState.question,
      formState.min,
      formState.max,
      formState.unit,
      formState.shouldAnswersSumToOne,
    ]
  )

  // Calculate cost
  const numAnswers = formState.answers.length
  const cost = getAnte(
    formState.outcomeType as any,
    numAnswers > 0 ? numAnswers : undefined,
    formState.liquidityTier
  )

  const canSubmit =
    validation.isValid && !isSubmitting && creator.balance >= cost

  // Handle type change
  const handleTypeChange = (
    newType: CreateableOutcomeType,
    shouldSumToOne: boolean
  ) => {
    setFormState((prev) => ({
      ...prev,
      outcomeType: newType,
      shouldAnswersSumToOne: shouldSumToOne,
      // Add default answers for Multiple Choice and Poll if they don't exist
      answers:
        newType === 'MULTIPLE_CHOICE' || newType === 'POLL'
          ? prev.answers.length > 0
            ? prev.answers
            : ['', '', '']
          : newType === 'MULTI_NUMERIC' || newType === 'DATE'
          ? [] // Start with empty answers for numeric/date, will be generated
          : [],
      // Set addAnswersMode to DISABLED by default for MC/Poll
      addAnswersMode:
        newType === 'MULTIPLE_CHOICE' ? 'DISABLED' : prev.addAnswersMode,
      // Preserve numeric-specific fields for numeric types, clear for others
      min:
        newType === 'MULTI_NUMERIC' ||
        newType === 'DATE' ||
        newType === 'PSEUDO_NUMERIC'
          ? prev.min
          : undefined,
      max:
        newType === 'MULTI_NUMERIC' ||
        newType === 'DATE' ||
        newType === 'PSEUDO_NUMERIC'
          ? prev.max
          : undefined,
      minString:
        newType === 'MULTI_NUMERIC' ||
        newType === 'DATE' ||
        newType === 'PSEUDO_NUMERIC'
          ? prev.minString
          : '',
      maxString:
        newType === 'MULTI_NUMERIC' ||
        newType === 'DATE' ||
        newType === 'PSEUDO_NUMERIC'
          ? prev.maxString
          : '',
      unit: newType === 'MULTI_NUMERIC' ? prev.unit : undefined,
      midpoints:
        newType === 'MULTI_NUMERIC' || newType === 'DATE' ? prev.midpoints : [],
    }))
  }

  // Handle submission
  const handleSubmit = async () => {
    if (!canSubmit) return

    setIsSubmitting(true)
    setSubmitError(undefined)

    try {
      // Build API payload - include ALL fields like original form
      const closeTime = formState.neverCloses
        ? undefined
        : formState.closeDate
        ? new Date(
            formState.closeDate + 'T' + (formState.closeHoursMinutes || '23:59')
          ).getTime()
        : undefined

      const payload: any = {
        question: formState.question.trim(),
        outcomeType: formState.outcomeType,
        description: formState.description || '',
        initialProb: formState.probability || 50, // Use form state probability for binary markets
        closeTime,
        visibility: formState.visibility,
        groupIds: formState.selectedGroups.map((g) => g.id),
        liquidityTier: formState.liquidityTier,
        utcOffset: new Date().getTimezoneOffset(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }

      // Add type-specific fields
      if (formState.outcomeType === 'MULTIPLE_CHOICE') {
        payload.answers = formState.answers.filter((a) => a.trim().length > 0)
        payload.shouldAnswersSumToOne = formState.shouldAnswersSumToOne
        payload.addAnswersMode = formState.addAnswersMode
      } else if (formState.outcomeType === 'POLL') {
        payload.answers = formState.answers.filter((a) => a.trim().length > 0)
      } else if (formState.outcomeType === 'BOUNTIED_QUESTION') {
        payload.totalBounty = formState.totalBounty
      } else if (formState.outcomeType === 'PSEUDO_NUMERIC') {
        payload.min = formState.min
        payload.max = formState.max
      } else if (formState.outcomeType === 'MULTI_NUMERIC') {
        payload.answers = formState.answers.filter((a) => a.trim().length > 0)
        payload.midpoints = formState.midpoints
        payload.min = formState.min
        payload.max = formState.max
        payload.unit = formState.unit?.trim()
        payload.shouldAnswersSumToOne = formState.shouldAnswersSumToOne
        payload.addAnswersMode = 'DISABLED' // Numeric markets don't allow adding answers
      } else if (formState.outcomeType === 'DATE') {
        payload.answers = formState.answers.filter((a) => a.trim().length > 0)
        payload.midpoints = formState.midpoints
        payload.min = formState.minString // Date markets use string dates
        payload.max = formState.maxString // Date markets use string dates
        payload.shouldAnswersSumToOne = formState.shouldAnswersSumToOne
        payload.addAnswersMode = 'DISABLED' // Date markets don't allow adding answers
      }

      track('create market v2', {
        outcomeType: formState.outcomeType,
        hasDescription: !!formState.description,
        numAnswers: formState.answers.length,
        liquidityTier: formState.liquidityTier,
      })

      // Call API
      const result = await api('market', payload)

      // Clear form state
      localStorage.removeItem('new-contract-form-v2')

      // Redirect to new market
      Router.push(`/${creator.username}/${result.slug}`)
    } catch (error: any) {
      console.error('Error creating market:', error)
      setSubmitError(error.message || 'Failed to create market')
      setIsSubmitting(false)
    }
  }

  // Convert form state to preview data
  const previewData: PreviewContractData = {
    question: formState.question,
    outcomeType: formState.outcomeType as any,
    description: formState.description,
    probability: formState.probability,
    answers: formState.answers.map((text) => ({ text })),
    closeTime: formState.closeDate
      ? new Date(formState.closeDate + 'T23:59').getTime()
      : undefined,
    visibility: formState.visibility,
    liquidityTier: formState.liquidityTier,
    min: formState.min,
    max: formState.max,
    minString: formState.minString,
    maxString: formState.maxString,
    midpoints: formState.midpoints,
    unit: formState.unit,
    totalBounty: formState.totalBounty,
    shouldAnswersSumToOne: formState.shouldAnswersSumToOne,
    addAnswersMode: formState.addAnswersMode,
  }

  return (
    <Col className="bg-canvas-50 min-h-screen">
      {/* Header */}
      <Row className="bg-canvas-0 border-ink-200 items-center justify-between border-b px-4 py-3 shadow-sm">
        <Row className="items-center gap-3">
          <button
            onClick={() => Router.back()}
            className="text-ink-600 hover:text-ink-800 transition-colors"
          >
            ← Back
          </button>
          <h1 className="text-ink-900 text-xl font-semibold">
            Create a Question
          </h1>
        </Row>
        <Button
          color="gray-outline"
          size="sm"
          disabled={drafts.length === 0}
          onClick={() => setShowDraftsModal(true)}
        >
          Drafts ({drafts.length})
        </Button>
      </Row>

      {/* Prominent Type Selector */}
      <ProminentTypeSelector
        currentType={formState.outcomeType}
        currentShouldAnswersSumToOne={formState.shouldAnswersSumToOne}
        onSelectType={handleTypeChange}
      />

      {/* Main Content */}
      <Col className="mx-auto w-full max-w-3xl gap-6 p-6">
        {/* Multiple Choice Settings - Above Preview */}
        {formState.outcomeType === 'MULTIPLE_CHOICE' && (
          <Col className="bg-canvas-0 ring-ink-100 gap-4 rounded-lg p-4 shadow-md ring-1">
            {/* Side-by-side layout on larger screens */}
            <Row className="flex-col gap-4 sm:flex-row">
              {/* Answer Behavior Toggle */}
              <Col className="flex-1 gap-2">
                <Row className="items-center gap-2">
                  <span className="text-ink-900 text-sm font-semibold">
                    Only one answer can resolve YES
                  </span>
                  <InfoTooltip text="Should answers sum to 100%? If yes, only one answer can resolve YES. If no, multiple answers can resolve YES independently." />
                </Row>
                <Row className="items-start gap-3">
                  <ShortToggle
                    on={formState.shouldAnswersSumToOne ?? true}
                    setOn={(value) =>
                      updateField('shouldAnswersSumToOne', value)
                    }
                  />
                  <Col className="gap-0.5">
                    <span className="text-ink-600 text-xs">
                      {formState.shouldAnswersSumToOne
                        ? 'only one answer will resolve YES'
                        : 'each answer can resolve YES or NO at any time, independently of other answers'}
                    </span>
                    {formState.shouldAnswersSumToOne && (
                      <span className="text-ink-500 text-xs">
                        all other answers resolve NO after one resolves YES, and not sooner
                      </span>
                    )}
                  </Col>
                </Row>
              </Col>

              {/* Who Can Add Answers */}
              <Col className="flex-1 gap-2">
                <Row className="items-center gap-2">
                  <span className="text-ink-900 text-sm font-semibold">
                    Who can add new answers later?
                  </span>
                  <InfoTooltip
                    text={
                      'Determines who will be able to add new answers after question creation.' +
                      (formState.shouldAnswersSumToOne
                        ? ' If enabled, then an "Other" answer will be included.'
                        : '')
                    }
                  />
                </Row>
                <ChoicesToggleGroup
                  currentChoice={formState.addAnswersMode || 'DISABLED'}
                  choicesMap={{
                    'No one': 'DISABLED',
                    You: 'ONLY_CREATOR',
                    Anyone: 'ANYONE',
                  }}
                  setChoice={(c) => updateField('addAnswersMode', c as any)}
                />
              </Col>
            </Row>
          </Col>
        )}

        {/* Preview */}
        <div className="relative">
          <MarketPreview
            data={previewData}
            user={creator}
            onEditQuestion={(q) => updateField('question', q)}
            onEditDescription={(desc) => updateField('description', desc)}
            descriptionEditor={descriptionEditor}
            closeDate={
              formState.closeDate ? new Date(formState.closeDate) : undefined
            }
            setCloseDate={(date) => {
              updateField('closeDate', date.toISOString().split('T')[0])
              setHasManuallyEditedCloseDate(true)
            }}
            closeHoursMinutes={formState.closeHoursMinutes}
            setCloseHoursMinutes={(time) => {
              updateField('closeHoursMinutes', time)
              setHasManuallyEditedCloseDate(true)
            }}
            neverCloses={formState.neverCloses}
            setNeverCloses={(never) => {
              updateField('neverCloses', never)
              setHasManuallyEditedCloseDate(true)
            }}
            selectedGroups={formState.selectedGroups}
            onUpdateGroups={(groups) => updateField('selectedGroups', groups)}
            onToggleVisibility={() => {
              updateField(
                'visibility',
                formState.visibility === 'public' ? 'unlisted' : 'public'
              )
            }}
            onEditAnswers={(answers) => {
              updateField('answers', answers)
              // For DATE markets, regenerate midpoints after editing
              if (formState.outcomeType === 'DATE') {
                debouncedRegenerateDateMidpoints(answers)
              }
              // For MULTI_NUMERIC markets, regenerate midpoints after editing
              if (formState.outcomeType === 'MULTI_NUMERIC') {
                debouncedRegenerateNumericMidpoints(answers)
              }
            }}
            onToggleShouldAnswersSumToOne={() => {
              const newValue = !formState.shouldAnswersSumToOne
              updateField('shouldAnswersSumToOne', newValue)

              // For DATE markets, use cached ranges for instant toggle
              if (formState.outcomeType === 'DATE') {
                if (newValue) {
                  // Switching to buckets - use cached data
                  if (dateBuckets.answers.length > 0) {
                    updateField('answers', dateBuckets.answers)
                    updateField('midpoints', dateBuckets.midpoints)
                  }
                } else {
                  // Switching to thresholds - use cached data
                  if (dateThresholds.answers.length > 0) {
                    updateField('answers', dateThresholds.answers)
                    updateField('midpoints', dateThresholds.midpoints)
                  }
                }
              }

              // For MULTI_NUMERIC markets, use cached ranges for instant toggle
              if (formState.outcomeType === 'MULTI_NUMERIC') {
                if (newValue) {
                  // Switching to buckets - use cached data
                  if (numericBuckets.answers.length > 0) {
                    updateField('answers', numericBuckets.answers)
                    updateField('midpoints', numericBuckets.midpoints)
                  }
                } else {
                  // Switching to thresholds - use cached data
                  if (numericThresholds.answers.length > 0) {
                    updateField('answers', numericThresholds.answers)
                    updateField('midpoints', numericThresholds.midpoints)
                  }
                }
              }
            }}
            onOpenTopicsModal={(open) => {
              if (!open) {
                // Reset trigger when modal closes
                setTriggerTopicsModalOpen(false)
              }
            }}
            triggerTopicsModalOpen={triggerTopicsModalOpen}
            isGeneratingDateRanges={isGeneratingDateRanges}
            onDateRangeChange={(field, value) => updateField(field, value)}
            onGenerateDateRanges={async () => {
              if (
                !formState.question ||
                !formState.minString ||
                !formState.maxString
              )
                return
              setIsGeneratingDateRanges(true)
              try {
                const result = await api('generate-ai-date-ranges', {
                  question: formState.question,
                  description: '',
                  min: formState.minString,
                  max: formState.maxString,
                })

                // Cache both buckets and thresholds
                setDateBuckets({
                  answers: result.buckets.answers,
                  midpoints: result.buckets.midpoints,
                })
                setDateThresholds({
                  answers: result.thresholds.answers,
                  midpoints: result.thresholds.midpoints,
                })

                // Use buckets or thresholds based on shouldAnswersSumToOne
                if (formState.shouldAnswersSumToOne) {
                  updateField('answers', result.buckets.answers)
                  updateField('midpoints', result.buckets.midpoints)
                } else {
                  updateField('answers', result.thresholds.answers)
                  updateField('midpoints', result.thresholds.midpoints)
                }

                // Set close date to the maximum date from the range (maxString)
                // The API will parse maxString to a date, so we can use that as the close date
                if (formState.maxString) {
                  try {
                    // Try to parse the maxString as a date
                    // If it's just a year like "2030", dayjs will parse it as Jan 1, 2030
                    // So we should add time to ensure it covers the full period
                    const parsedDate = dayjs(formState.maxString)

                    // If maxString is just a year, set close date to end of that year
                    // Otherwise use the parsed date plus some buffer
                    const isJustYear = /^\d{4}$/.test(
                      formState.maxString.trim()
                    )
                    const closeDate = isJustYear
                      ? parsedDate.endOf('year')
                      : parsedDate.add(1, 'month') // Add buffer for non-year formats

                    updateField('closeDate', closeDate.format('YYYY-MM-DD'))
                    updateField('closeHoursMinutes', '23:59')
                    setHasManuallyEditedCloseDate(true) // Prevent auto-override
                  } catch (e) {
                    console.error('Error parsing maxString for close date:', e)
                  }
                }
              } catch (e) {
                console.error('Error generating date ranges:', e)
              } finally {
                setIsGeneratingDateRanges(false)
              }
            }}
            isGeneratingNumericRanges={isGeneratingNumericRanges}
            onNumericRangeChange={(field, value) => updateField(field, value)}
            onGenerateNumericRanges={async () => {
              if (
                !formState.question ||
                formState.min === undefined ||
                formState.max === undefined
              )
                return
              setIsGeneratingNumericRanges(true)
              try {
                const result = await api('generate-ai-numeric-ranges', {
                  question: formState.question,
                  description: '',
                  min: formState.min,
                  max: formState.max,
                  unit: formState.unit || '',
                })

                // Cache both buckets and thresholds
                setNumericBuckets({
                  answers: result.buckets.answers,
                  midpoints: result.buckets.midpoints,
                })
                setNumericThresholds({
                  answers: result.thresholds.answers,
                  midpoints: result.thresholds.midpoints,
                })

                // Use buckets or thresholds based on shouldAnswersSumToOne
                if (formState.shouldAnswersSumToOne) {
                  updateField('answers', result.buckets.answers)
                  updateField('midpoints', result.buckets.midpoints)
                } else {
                  updateField('answers', result.thresholds.answers)
                  updateField('midpoints', result.thresholds.midpoints)
                }

                // Auto-set close date using binary-style logic (1 year from now)
                if (!hasManuallyEditedCloseDate) {
                  const oneYearFromNow = dayjs().add(1, 'year')
                  updateField('closeDate', oneYearFromNow.format('YYYY-MM-DD'))
                  updateField('closeHoursMinutes', '23:59')
                }
              } catch (e) {
                console.error('Error generating numeric ranges:', e)
              } finally {
                setIsGeneratingNumericRanges(false)
              }
            }}
            onProbabilityChange={(prob) => updateField('probability', prob)}
            isEditable
          />

          {/* Overlay when no market type selected */}
          {!formState.outcomeType && (
            <div className="bg-ink-900/60 absolute inset-0 flex items-center justify-center rounded-lg backdrop-blur-sm">
              <div className="text-canvas-0 text-center text-xl font-semibold">
                Select a question type to begin
              </div>
            </div>
          )}
        </div>

        {/* Completion Checklist */}
        {formState.outcomeType && (
          <Row className="flex-wrap gap-2">
            {/* Title - Red when blank, green when filled */}
            <Tooltip
              text={
                !formState.question || formState.question.trim().length === 0
                  ? 'You need a title'
                  : ''
              }
            >
              <button
                onClick={() => {
                  const titleInput = document.getElementById(
                    'market-preview-title-input'
                  )
                  titleInput?.focus()
                }}
                className={clsx(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-80',
                  formState.question && formState.question.trim().length > 0
                    ? 'border-teal-500 bg-teal-50 text-teal-700'
                    : 'border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950 dark:text-red-300'
                )}
              >
                {formState.question && formState.question.trim().length > 0 && (
                  <CheckCircleIcon className="h-4 w-4" />
                )}
                Title
              </button>
            </Tooltip>

            {/* Description - Red when blank, green when filled */}
            <Tooltip
              text={
                !hasDescription(formState.description)
                  ? 'Markets with clear resolution criteria get more traders'
                  : ''
              }
            >
              <button
                onClick={() => {
                  descriptionEditor?.commands.focus()
                }}
                className={clsx(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-80',
                  hasDescription(formState.description)
                    ? 'border-teal-500 bg-teal-50 text-teal-700'
                    : 'border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950 dark:text-red-300'
                )}
              >
                {hasDescription(formState.description) && (
                  <CheckCircleIcon className="h-4 w-4" />
                )}
                Description
              </button>
            </Tooltip>

            {/* Close Date (not required for POLL or BOUNTIED_QUESTION) */}
            {formState.outcomeType !== 'POLL' &&
              formState.outcomeType !== 'BOUNTIED_QUESTION' && (
                <Tooltip
                  text={
                    !formState.closeDate && !formState.neverCloses
                      ? 'You need a close date'
                      : formState.closeDate && !hasManuallyEditedCloseDate
                      ? `Close date is ${dayjs(formState.closeDate).format(
                          'MMM D, YYYY'
                        )} set automatically based on your title`
                      : ''
                  }
                >
                  <button
                    onClick={() => setIsCloseDateModalOpen(true)}
                    className={clsx(
                      'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-80',
                      formState.neverCloses
                        ? 'border-teal-500 bg-teal-50 text-teal-700'
                        : formState.closeDate && hasManuallyEditedCloseDate
                        ? 'border-teal-500 bg-teal-50 text-teal-700'
                        : formState.closeDate && !hasManuallyEditedCloseDate
                        ? 'border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-300'
                        : 'border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950 dark:text-red-300'
                    )}
                  >
                    {(formState.neverCloses ||
                      (formState.closeDate && hasManuallyEditedCloseDate)) && (
                      <CheckCircleIcon className="h-4 w-4" />
                    )}
                    Close date
                  </button>
                </Tooltip>
              )}

            {/* Topics - Yellow when only 1, green when 2+ */}
            <button
              onClick={() => {
                setTriggerTopicsModalOpen(true)
              }}
              className={clsx(
                'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-80',
                formState.selectedGroups.length >= 2
                  ? 'border-teal-500 bg-teal-50 text-teal-700'
                  : formState.selectedGroups.length === 1
                  ? 'border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-300'
                  : 'border-ink-300 bg-ink-100 text-ink-500'
              )}
            >
              {formState.selectedGroups.length >= 2 && (
                <CheckCircleIcon className="h-4 w-4" />
              )}
              Topics
            </button>

            {/* Answers (for MULTIPLE_CHOICE and POLL) */}
            {(formState.outcomeType === 'MULTIPLE_CHOICE' ||
              formState.outcomeType === 'POLL') && (
              <button
                className={clsx(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                  formState.answers.filter((a) => a.trim().length > 0).length >
                    2
                    ? 'border-teal-500 bg-teal-50 text-teal-700'
                    : formState.answers.filter((a) => a.trim().length > 0)
                        .length === 2
                    ? 'border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-300'
                    : 'border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950 dark:text-red-300'
                )}
              >
                {formState.answers.filter((a) => a.trim().length > 0).length >
                  2 && <CheckCircleIcon className="h-4 w-4" />}
                Answers
              </button>
            )}

            {/* Date ranges pill for DATE markets */}
            {formState.outcomeType === 'DATE' && (
              <button
                className={clsx(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                  formState.minString &&
                    formState.maxString &&
                    formState.answers.length > 0
                    ? 'border-teal-500 bg-teal-50 text-teal-700'
                    : formState.minString && formState.maxString
                    ? 'border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-300'
                    : 'border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950 dark:text-red-300'
                )}
              >
                {formState.minString &&
                  formState.maxString &&
                  formState.answers.length > 0 && (
                    <CheckCircleIcon className="h-4 w-4" />
                  )}
                Date ranges
              </button>
            )}

            {/* Visibility Status */}
            <Tooltip
              text={
                formState.visibility === 'public'
                  ? <>Click to make unlisted<br />(not discoverable without a link)</>
                  : 'Click to make public'
              }
            >
              <button
                onClick={() => {
                  updateField(
                    'visibility',
                    formState.visibility === 'public' ? 'unlisted' : 'public'
                  )
                }}
                className={clsx(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-80',
                  formState.visibility === 'public'
                    ? 'border-teal-500 bg-teal-50 text-teal-700'
                    : 'border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-300'
                )}
              >
                {formState.visibility === 'public' && (
                  <CheckCircleIcon className="h-4 w-4" />
                )}
                {formState.visibility === 'public'
                  ? 'Market will be visible'
                  : 'Market will be unlisted'}
              </button>
            </Tooltip>
          </Row>
        )}

        {/* Market Settings Below Preview */}
        <ContextualEditorPanel
          formState={formState}
          onUpdate={updateField}
          validationErrors={validation.errors}
          balance={creator.balance}
          submitState={isSubmitting ? 'LOADING' : 'EDITING'}
          onGenerateAnswers={generateAnswers}
          isGeneratingAnswers={isGeneratingAnswers}
        />
      </Col>

      {/* Bottom Action Bar - Mobile */}
      <Row
        className={clsx(
          'bg-canvas-0 border-ink-200 fixed left-0 right-0 z-20 border-t px-3 py-2 shadow-lg',
          'lg:hidden' // Hide on desktop, show only on mobile
        )}
        style={{ bottom: `${BOTTOM_NAV_BAR_HEIGHT}px` }}
      >
        <Col className="mx-auto w-full max-w-7xl gap-2">
          {submitError && (
            <div className="bg-scarlet-50 text-scarlet-700 rounded-lg px-3 py-1.5 text-xs">
              {submitError}
            </div>
          )}
          <Row className="gap-2">
            {!showResetConfirmation ? (
              <Button
                color="gray-outline"
                size="md"
                onClick={() => setShowResetConfirmation(true)}
              >
                Reset
              </Button>
            ) : (
              <Button color="red" size="md" onClick={handleReset}>
                Confirm
              </Button>
            )}
            <Button
              color="gray-outline"
              size="md"
              onClick={saveDraftToDb}
              disabled={isSavingDraft}
              loading={isSavingDraft}
            >
              Draft
            </Button>
            <Button
              color="green"
              size="md"
              className="flex-1"
              onClick={handleSubmit}
              disabled={!canSubmit}
              loading={isSubmitting}
            >
              Create for {formatMoney(cost)}
            </Button>
          </Row>
          {!validation.isValid && (
            <div className="text-ink-600 text-center text-xs">
              {Object.values(validation.errors)[0]}
            </div>
          )}
        </Col>
      </Row>

      {/* Desktop Action Bar */}
      <div className="hidden lg:block">
        <Row
          className={clsx(
            'bg-canvas-0 border-ink-200 fixed bottom-0 z-20 border-t p-4 shadow-lg',
            'left-0 right-0 lg:left-[16.67%]' // Offset by sidebar width (2/12 of grid)
          )}
        >
          <Col className="mx-auto w-full max-w-5xl gap-2">
            {submitError && (
              <div className="bg-scarlet-50 text-scarlet-700 rounded-lg px-4 py-2 text-sm">
                {submitError}
              </div>
            )}
            <Row className="items-center justify-end gap-3">
              {!validation.isValid && (
                <div className="text-ink-600 text-sm">
                  {Object.values(validation.errors)[0]}
                </div>
              )}
              {!showResetConfirmation ? (
                <Button
                  color="gray-outline"
                  size="lg"
                  onClick={() => setShowResetConfirmation(true)}
                >
                  Reset
                </Button>
              ) : (
                <Button color="red" size="lg" onClick={handleReset}>
                  Confirm Reset
                </Button>
              )}
              <Button
                color="gray-outline"
                size="lg"
                onClick={saveDraftToDb}
                disabled={isSavingDraft}
                loading={isSavingDraft}
              >
                Save Draft
              </Button>
              <Button
                color="green"
                size="lg"
                onClick={handleSubmit}
                disabled={!canSubmit}
                loading={isSubmitting}
              >
                Create Question for {formatMoney(cost)}
              </Button>
            </Row>
          </Col>
        </Row>
      </div>

      {/* Spacer for fixed bottom bar + mobile nav */}
      <div className="h-40 lg:h-24" />

      {/* Type Switcher Modal */}
      <TypeSwitcherModal
        isOpen={isTypeSwitcherOpen}
        setIsOpen={setIsTypeSwitcherOpen}
        currentType={formState.outcomeType as any}
        currentShouldAnswersSumToOne={formState.shouldAnswersSumToOne}
        onSelectType={handleTypeChange}
      />

      {/* Close Date Modal */}
      <Modal open={isCloseDateModalOpen} setOpen={setIsCloseDateModalOpen}>
        <Col className="bg-canvas-0 gap-4 rounded-lg p-6">
          <h2 className="text-primary-700 text-xl font-semibold">
            Set Close Date
          </h2>
          <CloseTimeSection
            closeDate={formState.closeDate}
            setCloseDate={(date) => {
              updateField('closeDate', date)
              setHasManuallyEditedCloseDate(true)
            }}
            closeHoursMinutes={formState.closeHoursMinutes}
            setCloseHoursMinutes={(time) =>
              updateField('closeHoursMinutes', time)
            }
            outcomeType={formState.outcomeType as any}
            submitState={isSubmitting ? 'LOADING' : 'EDITING'}
            setNeverCloses={(neverCloses) => {
              updateField('neverCloses', neverCloses)
              setHasManuallyEditedCloseDate(true)
            }}
            neverCloses={formState.neverCloses}
            initTime="23:59"
          />
          <Button
            color="indigo"
            onClick={() => setIsCloseDateModalOpen(false)}
            className="mt-4"
          >
            Done
          </Button>
        </Col>
      </Modal>

      {/* Drafts Modal */}
      <DraftsModal
        showDraftsModal={showDraftsModal}
        setShowDraftsModal={setShowDraftsModal}
        drafts={drafts}
        loadDraftFromDb={loadDraftFromDb}
        deleteDraft={deleteDraft}
      />
    </Col>
  )
}

// Drafts Modal Component
interface DraftsModalProps {
  showDraftsModal: boolean
  setShowDraftsModal: (show: boolean) => void
  drafts: MarketDraft[]
  loadDraftFromDb: (draft: MarketDraft) => void
  deleteDraft: (id: number) => void
}

function DraftsModal(props: DraftsModalProps) {
  const {
    showDraftsModal,
    setShowDraftsModal,
    drafts,
    loadDraftFromDb,
    deleteDraft,
  } = props

  return (
    <Modal open={showDraftsModal} setOpen={setShowDraftsModal} size="md">
      <Col className="bg-canvas-0 max-h-[70vh] overflow-auto rounded p-6">
        <h3 className="mb-4 text-xl font-semibold">Saved Drafts</h3>
        {drafts.length === 0 ? (
          <p className="text-ink-600">No saved drafts</p>
        ) : (
          <div className="space-y-3">
            {drafts.map((draft) => (
              <div
                key={draft.id}
                className="border-ink-200 hover:bg-canvas-50 rounded-lg border p-4 transition-colors"
              >
                <Row className="items-start justify-between gap-3">
                  <Col className="flex-1 gap-2">
                    <h4 className="text-ink-900 font-semibold">
                      {draft.data.question || 'Untitled'}
                    </h4>
                    <div className="text-ink-500 text-xs">
                      <RelativeTimestamp
                        time={new Date(draft.createdAt).getTime()}
                      />
                    </div>
                  </Col>
                  <Row className="gap-2">
                    <Button
                      size="xs"
                      color="indigo"
                      onClick={() => loadDraftFromDb(draft)}
                    >
                      Load
                    </Button>
                    <Button
                      size="xs"
                      color="red-outline"
                      onClick={() => deleteDraft(draft.id)}
                    >
                      Delete
                    </Button>
                  </Row>
                </Row>
                <Col className="text-ink-600 mt-2 gap-1 text-sm">
                  <p>Type: {draft.data.outcomeType}</p>
                  {draft.data.answers.length > 0 && (
                    <p>
                      Answers: {draft.data.answers.slice(0, 5).join(', ')}
                      {draft.data.answers.length > 5 && '...'}
                    </p>
                  )}
                  {draft.data.description && (
                    <p className="line-clamp-2">
                      Description: {richTextToString(draft.data.description)}
                    </p>
                  )}
                </Col>
              </div>
            ))}
          </div>
        )}
      </Col>
    </Modal>
  )
}
