import { useEvent } from 'client-common/hooks/use-event'
import clsx from 'clsx'
import { Contract, CreateableOutcomeType } from 'common/contract'
import { MarketDraft } from 'common/drafts'
import { getAnte } from 'common/economy'
import { User } from 'common/user'
import { formatMoney } from 'common/util/format'
import { richTextToString } from 'common/util/parse'
import { WEEK_MS } from 'common/util/time'
import dayjs from 'dayjs'
import { debounce } from 'lodash'
import Router from 'next/router'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { FaQuestion, FaUsers } from 'react-icons/fa'
import { compareTwoStrings } from 'string-similarity'
import { useTextEditor } from 'web/components/widgets/editor'
import { useListGroupsBySlug } from 'web/hooks/use-group-supabase'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import {
  api,
  getSimilarGroupsToContract,
  searchContracts,
} from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'
import {
  ContractFormState,
  validateContractForm,
  ValidationErrors,
} from 'web/lib/validation/contract-validation'
import { POLL_SEE_RESULTS_ANSWER } from '../answers/answer-constants'
import { Button } from '../buttons/button'
import { ExpandSection } from '../explainer-panel'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { BOTTOM_NAV_BAR_HEIGHT } from '../nav/bottom-nav-bar'
import { RelativeTimestamp } from '../relative-timestamp'
import { ChoicesToggleGroup } from '../widgets/choices-toggle-group'
import { InfoTooltip } from '../widgets/info-tooltip'
import ShortToggle from '../widgets/short-toggle'
import { ActionBar } from './action-bar'
import { CloseTimeSection } from './close-time-section'
import { ContextualEditorPanel, FormState } from './contextual-editor-panel'
import { MarketPreview, PreviewContractData } from './market-preview'
import { ProminentTypeSelector } from './prominent-type-selector'
import { TypeSwitcherModal } from './type-switcher-modal'
import { scrollToFirstError } from './utils/scroll-to-error'

const MAX_DESCRIPTION_LENGTH = 16000

// Import and re-export type from shared types file to maintain backward compatibility
import { NewQuestionParams } from './contract-types'
export type { NewQuestionParams } from './contract-types'

export type CreateContractStateType =
  | 'choosing contract'
  | 'filling contract params'
  | 'ai chat'

export function NewContractPanel(props: {
  creator: User
  params?: NewQuestionParams
}) {
  const { creator, params } = props

  // Get completely empty form state
  const getEmptyFormState = (): FormState => ({
    question: '',
    outcomeType: 'BINARY',
    description: undefined,
    answers: [],
    closeDate: undefined,
    closeHoursMinutes: '23:59',
    neverCloses: false,
    selectedGroups: [],
    visibility: 'public',
    liquidityTier: 100,
    shouldAnswersSumToOne: true,
    addAnswersMode: 'DISABLED',
    probability: 50,
    min: undefined,
    max: undefined,
    minString: '',
    maxString: '',
    unit: '',
    midpoints: [],
    includeSeeResults: true,
  })

  // Initialize form state with defaults (from params if provided)
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
    min: params?.min,
    max: params?.max,
    minString: params?.min?.toString() || '',
    maxString: params?.max?.toString() || '',
    unit: params?.unit || '',
    midpoints: params?.midpoints || [],
    includeSeeResults: true,
  })

  const [formState, setFormState] = usePersistentLocalState<FormState>(
    getDefaultFormState(),
    'new-contract-form'
  )

  // Fetch groups from slugs when duplicating a market
  const groupsFromSlugs = useListGroupsBySlug(params?.groupSlugs ?? [])

  // When groups are loaded from slugs (duplication), set them in form state
  useEffect(() => {
    if (params?.rand && groupsFromSlugs && groupsFromSlugs.length > 0) {
      // Only update if this is a duplication (has rand param) and groups were resolved
      setFormState((prev) => ({
        ...prev,
        selectedGroups: groupsFromSlugs,
      }))
    }
  }, [params?.rand, groupsFromSlugs])

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isTypeSwitcherOpen, setIsTypeSwitcherOpen] = useState(false)
  const [hasManuallyEditedCloseDate, setHasManuallyEditedCloseDate] =
    useState(false)
  const [showResetConfirmation, setShowResetConfirmation] = useState(false)
  const [isCloseDateModalOpen, setIsCloseDateModalOpen] = useState(false)
  const [hasLowConfidenceCloseDate, setHasLowConfidenceCloseDate] =
    useState(false)
  const [triggerTopicsModalOpen, setTriggerTopicsModalOpen] = useState(false)
  const [drafts, setDrafts] = useState<MarketDraft[]>([])
  const [showDraftsModal, setShowDraftsModal] = useState(false)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [deletingDraftId, setDeletingDraftId] = useState<number | null>(null)

  // Similar/duplicate contracts detection
  const [similarContracts, setSimilarContracts] = useState<Contract[]>([])
  const [dismissedSimilarContractTitles, setDismissedSimilarContractTitles] =
    useState<string[]>([])

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

  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false)

  // Error tracking for field-level validation
  const [submitAttemptCount, setSubmitAttemptCount] = useState(0)
  const [fieldErrors, setFieldErrors] = useState<ValidationErrors>({})

  // Create description editor with dynamic placeholder based on market type
  const getDescriptionPlaceholder = () => {
    if (formState.outcomeType === 'POLL') {
      return 'Describe what this poll is about...'
    }
    return 'Optional: Provide context or details about your market...'
  }

  const descriptionEditor = useTextEditor({
    key: 'new-contract-description',
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

  // Override persistent state when params are provided (e.g., from duplicate market)
  useEffect(() => {
    if (params?.rand) {
      // rand param indicates this is a duplicate/template, override localStorage
      const newState = getDefaultFormState()
      setFormState(newState)
      // Also set the description in the editor
      if (descriptionEditor && newState.description) {
        descriptionEditor.commands.setContent(newState.description)
      }
    }
  }, [params?.rand, descriptionEditor]) // Include descriptionEditor so it re-runs when editor is ready

  // Update placeholder when outcome type changes
  useEffect(() => {
    if (descriptionEditor) {
      const newPlaceholder = getDescriptionPlaceholder()
      descriptionEditor.extensionManager.extensions.forEach(
        (extension: any) => {
          if (extension.name === 'placeholder') {
            extension.options.placeholder = newPlaceholder
          }
        }
      )
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

  // Update field and clear its error when user starts fixing it
  const updateFieldWithErrorClear = useCallback(
    (field: string, value: any) => {
      updateField(field, value)

      // Clear error for this field if it exists
      if (fieldErrors[field]) {
        setFieldErrors((prev) => {
          const next = { ...prev }
          delete next[field]
          return next
        })
      }
    },
    [fieldErrors]
  )

  // Helper to clear specific error
  const clearError = (errorKey: string) => {
    if (fieldErrors[errorKey]) {
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next[errorKey]
        return next
      })
    }
  }

  // Reset all form fields
  const handleReset = () => {
    setFormState(getEmptyFormState())
    setHasManuallyEditedCloseDate(false)
    setShowResetConfirmation(false)
    setFieldErrors({})
    setSubmitAttemptCount(0)
    if (descriptionEditor) {
      descriptionEditor.commands.clearContent()
    }
    track('reset form v2')
  }

  // Load drafts on mount
  useEffect(() => {
    loadDrafts()
  }, [])

  const loadDrafts = async () => {
    try {
      const drafts = await api('get-market-drafts', {})
      setDrafts(drafts)
      return drafts
    } catch (error) {
      console.error('Error loading drafts:', error)
      return []
    }
  }

  // Search for similar contracts to warn about duplicates
  const searchSimilarContracts = useCallback(
    async (question: string) => {
      const trimmed = question.toLowerCase().trim()
      if (trimmed === '') {
        setSimilarContracts([])
        return
      }

      // Don't search if user already dismissed this question
      if (dismissedSimilarContractTitles.includes(trimmed)) {
        return
      }

      try {
        const contracts = await searchContracts({
          term: question,
          contractType: formState.outcomeType || undefined,
          filter: 'open',
          limit: 10,
          sort: 'most-popular',
        })

        // Filter to contracts with >25% similarity
        const similar =
          contracts?.filter(
            (c) => compareTwoStrings(c.question, question) > 0.25
          ) || []

        setSimilarContracts(similar)
      } catch (error) {
        console.error('Error searching for similar contracts:', error)
      }
    },
    [dismissedSimilarContractTitles, formState.outcomeType]
  )

  // Debounced search
  const debouncedSearchSimilar = useCallback(
    debounce((question: string) => searchSimilarContracts(question), 500),
    [searchSimilarContracts]
  )

  // Search when question changes
  useEffect(() => {
    if (formState.question) {
      debouncedSearchSimilar(formState.question)
    } else {
      setSimilarContracts([])
    }
  }, [formState.question, debouncedSearchSimilar])

  const saveDraftToDb = async () => {
    // Don't save if no outcome type is selected
    if (!formState.outcomeType) {
      toast.error('Please select a question type before saving')
      return
    }

    // Don't save empty drafts - require at least a question or description
    const hasQuestion = formState.question.trim().length > 0
    const hasDescription =
      formState.description && descriptionEditor && !descriptionEditor.isEmpty
    const hasAnswers = formState.answers.some((a) => a.trim().length > 0)

    if (!hasQuestion && !hasDescription && !hasAnswers) {
      toast.error('Add a question, description, or answers before saving')
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
    // Prevent double-click by checking if we're already deleting this draft
    if (deletingDraftId === id) return

    setDeletingDraftId(id)
    try {
      await api('delete-market-draft', { id })
      const updatedDrafts = await loadDrafts()
      toast.success('Draft deleted')

      // Auto-close modal if no drafts remain
      if (updatedDrafts.length === 0) {
        setShowDraftsModal(false)
      }
    } catch (error: any) {
      // Silently handle "not found" errors (draft was already deleted)
      if (
        error?.message?.includes('not found') ||
        error?.message?.includes('unauthorized')
      ) {
        // Just reload drafts to sync state
        const updatedDrafts = await loadDrafts()
        if (updatedDrafts.length === 0) {
          setShowDraftsModal(false)
        }
      } else {
        console.error('Error deleting draft:', error)
        toast.error('Failed to delete draft')
      }
    } finally {
      setDeletingDraftId(null)
    }
  }

  // Validate form
  const validation = validateContractForm(formState as ContractFormState)

  // Helper: Get submit button text based on outcome type
  // Avoids duplication between mobile and desktop action bars
  const getSubmitButtonText = () => {
    return `Create for ${formatMoney(cost)}`
  }

  // Auto-extract close date from question
  const getAISuggestedCloseDate = useEvent(async (question: string) => {
    const shouldHaveCloseDate = formState.outcomeType !== 'POLL'

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
        // Flag low confidence dates to prompt user confirmation on submit
        setHasLowConfidenceCloseDate(result.confidence < 75)
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
          // Limit to 5 to respect MAX_GROUPS_PER_MARKET
          updateField('selectedGroups', result.groups.slice(0, 5))
        }
      }
    } catch (e) {
      console.error('Error getting suggested topics:', e)
    }
  })

  // Auto-infer numeric unit from question
  // skipTypeCheck is used when calling from handleTypeChange where outcomeType hasn't updated yet
  const inferNumericUnit = useEvent(
    async (question: string, skipTypeCheck = false) => {
      if (
        !question ||
        question.length < 10 ||
        (!skipTypeCheck && formState.outcomeType !== 'MULTI_NUMERIC') ||
        formState.unit // Don't overwrite if unit already set
      ) {
        return
      }

      try {
        const result = await api('infer-numeric-unit', {
          question,
          description: descriptionEditor
            ? richTextToString(descriptionEditor.getJSON())
            : '',
        })
        if (result?.unit) {
          updateField('unit', result.unit)
        }
      } catch (e) {
        console.error('Error inferring numeric unit:', e)
      }
    }
  )

  // Trigger auto-suggestions when question changes
  useEffect(() => {
    if (formState.question && formState.question.length >= 20) {
      const timer = setTimeout(() => {
        getAISuggestedCloseDate(formState.question)
        findTopicsAndSimilarQuestions(formState.question)
        inferNumericUnit(formState.question)
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
        // Clear answers error when generating answers
        clearError('answers')
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

  const generateAIDescription = async () => {
    if (!formState.question) return
    setIsGeneratingDescription(true)
    try {
      const description = descriptionEditor
        ? richTextToString(descriptionEditor.getJSON())
        : ''
      const result = await api('generate-ai-description', {
        question: formState.question,
        description,
        answers: formState.answers,
        outcomeType: formState.outcomeType ?? undefined,
        shouldAnswersSumToOne: formState.shouldAnswersSumToOne ?? false,
        addAnswersMode: formState.addAnswersMode,
      })
      if (result.description && descriptionEditor) {
        const endPos = descriptionEditor.state.doc.content.size
        descriptionEditor.commands.setTextSelection(endPos)
        descriptionEditor.commands.insertContent(result.description)
        // Add AI-generated label in italics
        descriptionEditor.commands.insertContent([
          { type: 'paragraph' },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                marks: [{ type: 'italic' }],
                text: 'This description was generated by AI.',
              },
            ],
          },
        ])
      }
    } catch (e) {
      console.error('Error generating description:', e)
    }
    setIsGeneratingDescription(false)
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
    } catch (e: any) {
      console.error('Error regenerating date midpoints:', e)
      toast.error(e.message || 'Failed to regenerate date ranges')
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
    } catch (e: any) {
      console.error('Error regenerating numeric midpoints:', e)
      toast.error(e.message || 'Failed to regenerate numeric ranges')
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

  // Add balance validation
  const hasInsufficientBalance = cost > creator.balance
  if (hasInsufficientBalance && !validation.errors.balance) {
    validation.errors.balance = `Insufficient balance. You need ${formatMoney(
      cost
    )} but only have ${formatMoney(creator.balance)}`
  }

  // Handle type change
  const handleTypeChange = (
    newType: CreateableOutcomeType,
    shouldSumToOne: boolean
  ) => {
    setFormState((prev) => ({
      ...prev,
      outcomeType: newType,
      shouldAnswersSumToOne: shouldSumToOne,
      // Clear all market-specific data for discussion posts
      answers:
        newType === 'MULTIPLE_CHOICE' || newType === 'POLL'
          ? prev.answers.length > 0
            ? prev.answers
            : ['', '', '']
          : newType === 'MULTI_NUMERIC' || newType === 'DATE'
          ? [] // Start with empty answers for numeric/date, will be generated
          : [],
      // Default to including "See results" for polls
      includeSeeResults: newType === 'POLL' ? true : prev.includeSeeResults,
      // Default poll type to 'single' for polls
      pollType: newType === 'POLL' ? 'single' : prev.pollType,
      maxSelections: newType === 'POLL' ? undefined : prev.maxSelections,
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

    // Clear all field errors when switching market types
    setFieldErrors({})

    // Auto-infer unit when switching to MULTI_NUMERIC
    if (newType === 'MULTI_NUMERIC' && formState.question) {
      inferNumericUnit(formState.question, true)
    }

    // Focus the question input after type change
    setTimeout(() => {
      const input = document.getElementById('market-preview-title-input')
      if (input) {
        input.focus()
      }
    }, 100)
  }

  // Handle addAnswersMode change - ensure at least 2 answer slots when switching to DISABLED
  const handleAddAnswersModeChange = (
    newMode: 'DISABLED' | 'ONLY_CREATOR' | 'ANYONE'
  ) => {
    setFormState((prev) => {
      // When switching to DISABLED, ensure at least 2 answer slots exist
      if (newMode === 'DISABLED' && prev.answers.length < 2) {
        const slotsNeeded = 2 - prev.answers.length
        const newAnswers = [...prev.answers, ...Array(slotsNeeded).fill('')]
        return { ...prev, addAnswersMode: newMode, answers: newAnswers }
      }
      return { ...prev, addAnswersMode: newMode }
    })
  }

  // Handle submission
  const handleSubmit = async () => {
    // Prevent double-submission
    if (isSubmitting) return

    // Check validation and show field-level errors if invalid
    if (!validation.isValid) {
      setFieldErrors(validation.errors)

      const errorKeys = Object.keys(validation.errors)
      const isOnlyCloseDateError =
        errorKeys.length === 1 && errorKeys[0] === 'closeDate'

      // Auto-open close date modal only if it's the ONLY error (don't shake button)
      if (isOnlyCloseDateError) {
        setIsCloseDateModalOpen(true)
      } else {
        // Increment submit attempt count (triggers shake animation) for other errors
        setSubmitAttemptCount((prev) => prev + 1)
      }

      scrollToFirstError(validation.errors)
      return
    }

    // If close date was auto-suggested with low confidence, prompt user to confirm
    if (hasLowConfidenceCloseDate && !hasManuallyEditedCloseDate) {
      setIsCloseDateModalOpen(true)
      return
    }

    // Clear any previous field errors
    setFieldErrors({})

    setIsSubmitting(true)

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
        closeTime,
        visibility: formState.visibility,
        groupIds: formState.selectedGroups.map((g) => g.id),
        liquidityTier: formState.liquidityTier,
        utcOffset: new Date().getTimezoneOffset(),
      }

      // Add type-specific fields
      if (formState.outcomeType === 'BINARY') {
        payload.initialProb = formState.probability || 50
      } else if (formState.outcomeType === 'MULTIPLE_CHOICE') {
        payload.answers = formState.answers.filter((a) => a.trim().length > 0)
        payload.shouldAnswersSumToOne = formState.shouldAnswersSumToOne
        payload.addAnswersMode = formState.addAnswersMode
      } else if (formState.outcomeType === 'POLL') {
        const pollAnswers = formState.answers.filter((a) => a.trim().length > 0)
        // Add "See results" option if enabled
        if (formState.includeSeeResults) {
          pollAnswers.push(POLL_SEE_RESULTS_ANSWER)
        }
        payload.answers = pollAnswers
        // Add poll type options
        if (formState.pollType && formState.pollType !== 'single') {
          payload.pollType = formState.pollType
        }
        if (formState.pollType === 'multi-select' && formState.maxSelections) {
          payload.maxSelections = formState.maxSelections
        }
      } else if (formState.outcomeType === 'PSEUDO_NUMERIC') {
        payload.min = formState.min
        payload.max = formState.max
      } else if (formState.outcomeType === 'MULTI_NUMERIC') {
        const filteredAnswers = formState.answers.filter(
          (a) => a.trim().length > 0
        )
        payload.answers = filteredAnswers
        // Slice midpoints to match filtered answers length (in case user deleted some buckets)
        payload.midpoints = formState.midpoints?.slice(
          0,
          filteredAnswers.length
        )
        payload.min = formState.min
        payload.max = formState.max
        payload.unit = formState.unit?.trim()
        payload.shouldAnswersSumToOne = formState.shouldAnswersSumToOne
        payload.addAnswersMode = 'DISABLED' // Numeric markets don't allow adding answers
      } else if (formState.outcomeType === 'DATE') {
        const filteredAnswers = formState.answers.filter(
          (a) => a.trim().length > 0
        )
        payload.answers = filteredAnswers
        // Slice midpoints to match filtered answers length (in case user deleted some buckets)
        payload.midpoints = formState.midpoints?.slice(
          0,
          filteredAnswers.length
        )
        payload.shouldAnswersSumToOne = formState.shouldAnswersSumToOne
        payload.addAnswersMode = 'DISABLED' // Date markets don't allow adding answers
        payload.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      }

      track('create market v2', {
        outcomeType: formState.outcomeType,
        hasDescription: !!formState.description,
        numAnswers: formState.answers.length,
        liquidityTier: formState.liquidityTier,
      })

      // Call API to create market
      const result = await api('market', payload)

      // Clear form state and editor autosave
      localStorage.removeItem('new-contract-form')
      localStorage.removeItem('text new-contract-description')

      // Redirect to new market
      if (result && result.slug) {
        // Don't reset isSubmitting - we're navigating away from this page
        await Router.push(`/${creator.username}/${result.slug}`)
      } else {
        throw new Error('Market created but no slug returned')
      }
    } catch (error: any) {
      console.error('Error creating market:', error)
      toast.error(error.message || 'Failed to create market')
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
      ? (() => {
          const time = new Date(formState.closeDate + 'T23:59').getTime()
          return isNaN(time) ? undefined : time
        })()
      : undefined,
    visibility: formState.visibility,
    liquidityTier: formState.liquidityTier,
    min: formState.min,
    max: formState.max,
    minString: formState.minString,
    maxString: formState.maxString,
    midpoints: formState.midpoints,
    unit: formState.unit,
    shouldAnswersSumToOne: formState.shouldAnswersSumToOne,
    addAnswersMode: formState.addAnswersMode,
    includeSeeResults: formState.includeSeeResults,
    pollType: formState.pollType,
  }

  return (
    <Col className="min-h-screen">
      {/* Header */}
      <Row className="bg-canvas-0 border-ink-200 items-center justify-between border-b px-4 py-3 shadow-sm">
        <Row className="items-center gap-3">
          <button
            onClick={() => Router.back()}
            className="text-ink-600 hover:text-ink-800 transition-colors lg:hidden"
          >
            ←
          </button>
          <h1 className="text-ink-900 text-xl font-semibold">
            Create a market
          </h1>
        </Row>
      </Row>

      {/* Market Creation UI */}
      <Col className="mx-auto w-full max-w-3xl gap-6 p-2 pb-6 lg:pb-2">
        {/* Prominent Type Selector */}
        <ProminentTypeSelector
          currentType={formState.outcomeType}
          currentShouldAnswersSumToOne={formState.shouldAnswersSumToOne}
          onSelectType={handleTypeChange}
        />
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
                        ? 'After one answer resolves YES, all others resolve NO, and not sooner'
                        : 'each answer can resolve YES or NO at any time, independently of other answers'}
                    </span>
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
                  setChoice={(c) =>
                    handleAddAnswersModeChange(
                      c as 'DISABLED' | 'ONLY_CREATOR' | 'ANYONE'
                    )
                  }
                  className="w-fit"
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
            onEditQuestion={(q) => updateFieldWithErrorClear('question', q)}
            onEditDescription={(desc) =>
              updateFieldWithErrorClear('description', desc)
            }
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
            onOpenCloseDateModal={() => setIsCloseDateModalOpen(true)}
            onToggleVisibility={() => {
              updateField(
                'visibility',
                formState.visibility === 'public' ? 'unlisted' : 'public'
              )
            }}
            onEditAnswers={(answers) => {
              updateFieldWithErrorClear('answers', answers)
              // For DATE markets, regenerate midpoints after editing
              if (formState.outcomeType === 'DATE') {
                debouncedRegenerateDateMidpoints(answers)
              }
              // For MULTI_NUMERIC markets, regenerate midpoints after editing
              if (formState.outcomeType === 'MULTI_NUMERIC') {
                debouncedRegenerateNumericMidpoints(answers)
              }
              // For POLLs, auto-disable "See results" toggle if user manually adds it
              if (
                formState.outcomeType === 'POLL' &&
                formState.includeSeeResults
              ) {
                const hasManualSeeResults = answers.some(
                  (a) =>
                    a.toLowerCase().trim() ===
                    POLL_SEE_RESULTS_ANSWER.toLowerCase()
                )
                if (hasManualSeeResults) {
                  updateField('includeSeeResults', false)
                }
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
            onDateRangeChange={(field, value) => {
              updateField(field, value)
              // Clear range error when date range fields are updated
              clearError('range')
            }}
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

                // Clear both range and answers errors when generating ranges
                clearError('range')
                clearError('answers')

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
            onNumericRangeChange={(field, value) => {
              updateField(field, value)
              // Clear range error when numeric range fields are updated
              clearError('range')
            }}
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

                // Clear both range and answers errors when generating ranges
                clearError('range')
                clearError('answers')

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
            onGenerateDescription={generateAIDescription}
            isGeneratingDescription={isGeneratingDescription}
            onGenerateAnswers={generateAnswers}
            isGeneratingAnswers={isGeneratingAnswers}
            onSwitchMarketType={(
              type,
              shouldSumToOne,
              addAnswersMode,
              removeOtherAnswer
            ) => {
              handleTypeChange(type, shouldSumToOne ?? true)
              if (addAnswersMode !== undefined) {
                updateField('addAnswersMode', addAnswersMode)
              }
              if (removeOtherAnswer && formState.answers) {
                // Remove the "other" answer from the list
                const filteredAnswers = formState.answers.filter(
                  (answer) => answer.toLowerCase().trim() !== 'other'
                )
                updateField('answers', filteredAnswers)
              }
            }}
            similarContracts={similarContracts}
            setSimilarContracts={setSimilarContracts}
            setDismissedSimilarContractTitles={
              setDismissedSimilarContractTitles
            }
            fieldErrors={submitAttemptCount > 0 ? fieldErrors : {}}
            isEditable
            onToggleIncludeSeeResults={() =>
              updateField('includeSeeResults', !formState.includeSeeResults)
            }
            onReplaceQuestionText={(original, replacement) => {
              const newQuestion = formState.question.replace(original, replacement)
              updateFieldWithErrorClear('question', newQuestion)
            }}
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

        {/* Visibility Toggle */}
        <Row className="items-center gap-2 px-4">
          <span className="text-ink-700 text-sm font-semibold">
            Publicly listed
          </span>
          <ShortToggle
            on={formState.visibility === 'public'}
            setOn={(on) =>
              updateField('visibility', on ? 'public' : 'unlisted')
            }
          />
          <InfoTooltip text="Unlisted markets are only discoverable via a direct link" />
        </Row>

        {/* Desktop Action Bar - Floating below liquidity section */}
        <div className="hidden rounded-lg p-4 ring-1 ring-transparent lg:block">
          <ActionBar
            onSubmit={handleSubmit}
            onReset={handleReset}
            onSaveDraft={saveDraftToDb}
            onViewDrafts={() => setShowDraftsModal(true)}
            isSubmitting={isSubmitting}
            submitButtonText={getSubmitButtonText()}
            isSavingDraft={isSavingDraft}
            draftsCount={drafts.length}
            showResetConfirmation={showResetConfirmation}
            setShowResetConfirmation={setShowResetConfirmation}
            submitAttemptCount={submitAttemptCount}
            variant="desktop"
          />
        </div>

        {/* Explainer Panel for new users */}
        {creator.createdTime > Date.now() - WEEK_MS && (
          <ExplainerPanel className="mt-8" />
        )}

        {/* Footer */}
        <div className="text-ink-500 mt-6 flex items-center justify-center gap-3 pb-0 text-sm">
          <span>© Manifold Markets, Inc.</span>
          <span>•</span>
          <a
            href="https://manifold.markets/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-ink-700 underline"
          >
            Terms
          </a>
          <span>•</span>
          <a
            href="https://manifold.markets/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-ink-700 underline"
          >
            Privacy
          </a>
        </div>
      </Col>

      {/* Bottom Action Bar - Mobile */}
      <div
        className={clsx(
          'bg-canvas-0 border-ink-200 fixed left-0 right-0 z-20 border-t px-3 py-2',
          'lg:hidden' // Hide on desktop, show only on mobile
        )}
        style={{ bottom: `${BOTTOM_NAV_BAR_HEIGHT}px` }}
      >
        <div className="mx-auto w-full max-w-7xl">
          <ActionBar
            onSubmit={handleSubmit}
            onReset={handleReset}
            onSaveDraft={saveDraftToDb}
            onViewDrafts={() => setShowDraftsModal(true)}
            isSubmitting={isSubmitting}
            submitButtonText={getSubmitButtonText()}
            isSavingDraft={isSavingDraft}
            draftsCount={drafts.length}
            showResetConfirmation={showResetConfirmation}
            setShowResetConfirmation={setShowResetConfirmation}
            submitAttemptCount={submitAttemptCount}
            variant="mobile"
          />
        </div>
      </div>

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
            onClick={() => {
              setHasManuallyEditedCloseDate(true)
              setIsCloseDateModalOpen(false)
            }}
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
        deletingDraftId={deletingDraftId}
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
  deletingDraftId: number | null
}

function DraftsModal(props: DraftsModalProps) {
  const {
    showDraftsModal,
    setShowDraftsModal,
    drafts,
    loadDraftFromDb,
    deleteDraft,
    deletingDraftId,
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
                      disabled={deletingDraftId === draft.id}
                    >
                      Load
                    </Button>
                    <Button
                      size="xs"
                      color="red-outline"
                      onClick={() => deleteDraft(draft.id)}
                      disabled={deletingDraftId === draft.id}
                      loading={deletingDraftId === draft.id}
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

// Explainer Panel Components for new users
const ExplainerPanel = (props: { className?: string }) => {
  const { className } = props
  const handleSectionClick = (sectionTitle: string) => {
    track('create explainer section click', { sectionTitle })
  }
  return (
    <Col className={clsx('mt-6', className)}>
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
