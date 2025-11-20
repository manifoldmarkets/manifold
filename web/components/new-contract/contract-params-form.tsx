import { generateJSON, JSONContent } from '@tiptap/core'
import dayjs from 'dayjs'
import { debounce } from 'lodash'
import router from 'next/router'
import { useCallback, useEffect, useState } from 'react'

import { useEvent } from 'client-common/hooks/use-event'
import {
  removePersistentInMemoryState,
  usePersistentInMemoryState,
} from 'client-common/hooks/use-persistent-in-memory-state'
import {
  add_answers_mode,
  Contract,
  contractPath,
  CreateableOutcomeType,
  MAX_DESCRIPTION_LENGTH,
  MAX_QUESTION_LENGTH,
  NON_BETTING_OUTCOMES,
  NUMBER_BUCKETS_MAX,
  PollVoterVisibility,
  Visibility,
} from 'common/contract'
import { MarketDraft } from 'common/drafts'
import {
  FREE_MARKET_USER_ID,
  getAnte,
  getUniqueBettorBonusAmount,
  MINIMUM_BOUNTY,
} from 'common/economy'
import { Group, MAX_GROUPS_PER_MARKET } from 'common/group'
import { getMultiNumericAnswerBucketRangeNames } from 'common/src/number'
import { STONK_NO, STONK_YES } from 'common/stonk'
import { getAnswerCostFromLiquidity, liquidityTiers } from 'common/tier'
import { User } from 'common/user'
import { filterDefined } from 'common/util/array'
import { formatWithToken } from 'common/util/format'
import { removeUndefinedProps } from 'common/util/object'
import { extensions, richTextToString } from 'common/util/parse'
import { randomString } from 'common/util/random'
import { toast } from 'react-hot-toast'
import { BiUndo } from 'react-icons/bi'
import { compareTwoStrings } from 'string-similarity'
import { MultipleChoiceAnswers } from 'web/components/answers/multiple-choice-answers'
import { Button } from 'web/components/buttons/button'
import { Row } from 'web/components/layout/row'
import { CloseTimeSection } from 'web/components/new-contract/close-time-section'
import { CostSection } from 'web/components/new-contract/cost-section'
import { PseudoNumericRangeSection } from 'web/components/new-contract/pseudo-numeric-range-section'
import { SimilarContractsSection } from 'web/components/new-contract/similar-contracts-section'
import { TopicSelectorSection } from 'web/components/new-contract/topic-selector-section'
import {
  getEditorLocalStorageKey,
  TextEditor,
  useTextEditor,
} from 'web/components/widgets/editor'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import ShortToggle from 'web/components/widgets/short-toggle'
import {
  setPersistentLocalState,
  usePersistentLocalState,
} from 'web/hooks/use-persistent-local-state'
import {
  api,
  getSimilarGroupsToContract,
  searchContracts,
} from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'
import { getGroup, getGroupFromSlug } from 'web/lib/supabase/group'
import { safeLocalStorage } from 'web/lib/util/local'
import { Col } from '../layout/col'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { RelativeTimestamp } from '../relative-timestamp'
import { BuyAmountInput } from '../widgets/amount-input'
import { ChoicesToggleGroup } from '../widgets/choices-toggle-group'
import { getContractTypeFromValue } from './create-contract-types'
import { MultiNumericDateSection } from './multi-numeric-date-section'
import { MultiNumericRangeSection } from './multi-numeric-range-section'
import { NewQuestionParams } from './contract-types'
import { NumberRangeSection } from './number-range-section'

export const seeResultsAnswer = 'See results'
export function ContractParamsForm(props: {
  creator: User
  outcomeType: CreateableOutcomeType | 'DISCUSSION_POST'
  params?: Partial<NewQuestionParams>
}) {
  const { creator, params } = props
  // Type narrow outcomeType - DISCUSSION_POST shouldn't use this old form, but TypeScript needs the type
  const outcomeType = props.outcomeType as CreateableOutcomeType

  const [liquidityTier, setLiquidityTier] = usePersistentLocalState<number>(
    liquidityTiers[0],
    'liquidity-tier'
  )

  const paramsKey =
    params?.overrideKey ??
    (params?.q ?? '') +
      (params?.groupSlugs?.join('') ?? '') +
      (params?.groupIds?.join('') ?? '') +
      (params?.rand ?? '')
  const minStringKey = 'min' + paramsKey
  const [minString, setMinString] = usePersistentLocalState(
    params?.min?.toString() ?? '',
    minStringKey
  )

  const maxStringKey = 'max' + paramsKey
  const [maxString, setMaxString] = usePersistentLocalState(
    params?.max?.toString() ?? '',
    maxStringKey
  )

  const precisionKey = 'numeric-precision' + paramsKey
  const [precision, setPrecision] = usePersistentLocalState<number | undefined>(
    params?.precision ?? 1,
    precisionKey
  )

  const isLogScaleKey = 'new-is-log-scale' + paramsKey
  const [isLogScale, setIsLogScale] = usePersistentLocalState<boolean>(
    !!params?.isLogScale,
    isLogScaleKey
  )

  const visibilityKey = 'new-visibility' + paramsKey
  const [visibility, setVisibility] = usePersistentLocalState<Visibility>(
    (params?.visibility ?? 'public') as Visibility,
    visibilityKey
  )

  const initValueKey = 'new-init-value' + paramsKey
  const [initialValueString, setInitialValueString] = usePersistentLocalState(
    params?.initValue?.toString(),
    initValueKey
  )

  // Don't use the usePersistentLocalState hook for this, because there's too high a risk that it will survive in local storage
  // longer than it should under a trivial paramsKey like '', and improperly prevent users from creating any new contracts.
  const [idempotencyKey] = useState(randomString())

  // For multiple choice, init to 2 empty answers
  const defaultAnswers =
    outcomeType === 'MULTIPLE_CHOICE' ||
    outcomeType == 'MULTI_NUMERIC' ||
    outcomeType == 'DATE'
      ? ['', '']
      : outcomeType == 'POLL'
      ? ['', '', seeResultsAnswer]
      : []

  const answersKey = 'new-answers-with-other' + paramsKey
  const [answers, setAnswers] = usePersistentLocalState(
    params?.answers ?? defaultAnswers,
    answersKey
  )
  const [midpoints, setMidpoints] = usePersistentLocalState<number[]>(
    params?.midpoints ?? [],
    'new-numeric-midpoints' + paramsKey
  )
  const [multiNumericSumsToOne, setMultiNumericSumsToOne] =
    usePersistentLocalState<boolean>(
      params?.shouldAnswersSumToOne ?? true,
      'multi-numeric-sums-to-one' + paramsKey
    )
  const unitKey = 'multi-numeric-unit' + paramsKey
  const [unit, setUnit] = usePersistentLocalState<string>(
    params?.unit ?? '',
    unitKey
  )
  const addAnswersModeKey = 'new-add-answers-mode' + paramsKey
  const [addAnswersMode, setAddAnswersMode] =
    usePersistentLocalState<add_answers_mode>(
      params?.addAnswersMode ?? 'DISABLED',
      addAnswersModeKey
    )
  const shouldAnswersSumToOne =
    outcomeType === 'MULTI_NUMERIC' || outcomeType === 'DATE'
      ? multiNumericSumsToOne
      : params?.shouldAnswersSumToOne ?? false

  // NOTE: if you add another user-controlled state variable, you should also add it to the duplication parameters and resetProperties()

  const hasOtherAnswer =
    addAnswersMode !== 'DISABLED' &&
    shouldAnswersSumToOne &&
    outcomeType != 'POLL'
  const numAnswers = hasOtherAnswer ? answers.length + 1 : answers.length

  useEffect(() => {
    if (!params?.q) return

    setQuestion(params.q)
    if (!params.groupIds?.length && !params.groupSlugs?.length) {
      findTopicsAndSimilarQuestions(params.q)
    }
  }, [params?.q])

  useEffect(() => {
    if (params?.answers) {
      setAnswers(params.answers)
    } else if (answers.length && answers.every((a) => a.trim().length === 0)) {
      setAnswers(defaultAnswers)
    } else if (outcomeType === 'MULTIPLE_CHOICE' && answers.length < 2) {
      if (answers.length === 0) setAnswers(defaultAnswers)
      else setAnswers(answers.concat(['']))
    }
  }, [JSON.stringify(params?.answers)])

  useEffect(() => {
    if (params?.groupIds) {
      const getAndSetGroups = async (groupIds: string[]) => {
        const groups = await Promise.all(groupIds.map((id) => getGroup(id)))
        setSelectedGroups(filterDefined(groups))
      }
      getAndSetGroups(params.groupIds)
    }
    if (params?.groupSlugs) {
      const getAndSetGroupsViaSlugs = async (groupSlugs: string[]) => {
        const groups = await Promise.all(
          groupSlugs.map((s) => getGroupFromSlug(s))
        )
        setSelectedGroups(filterDefined(groups))
      }
      getAndSetGroupsViaSlugs(params.groupSlugs)
    }
  }, [JSON.stringify(params?.groupIds)])

  useEffect(() => {
    if (addAnswersMode === 'DISABLED' && answers.length < 2) {
      if (answers.length === 0) setAnswers(defaultAnswers)
      else setAnswers((a) => [...a, ''])
    }
  }, [addAnswersMode, answers.length])
  const [isSavingDraft, setIsSavingDraft] = useState(false)

  const questionKey = 'new-question' + paramsKey
  const [question, setQuestion] = usePersistentLocalState(
    params?.q ?? '',
    questionKey
  )

  const [suggestedTitle, setSuggestedTitle] = useState<string | undefined>()
  const [applyingTitle, setApplyingTitle] = useState<boolean>(false)
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false)

  const generateConciseTitle = useCallback(async (currentQuestion: string) => {
    if (
      !currentQuestion ||
      currentQuestion.length < 20 ||
      outcomeType === 'MULTIPLE_CHOICE' ||
      outcomeType === 'BOUNTIED_QUESTION' ||
      outcomeType === 'POLL' ||
      outcomeType === 'STONK' ||
      currentQuestion.toLowerCase().startsWith('how many')
    ) {
      if (suggestedTitle) setSuggestedTitle(undefined)
      return
    }
    setIsGeneratingTitle(true)
    try {
      const result = await api('generate-concise-title', {
        question: currentQuestion,
      })
      if (result.title) {
        setSuggestedTitle(
          result.title !== currentQuestion ? result.title : undefined
        )
      } else {
        setSuggestedTitle(undefined)
      }
    } catch (e) {
      console.error('Error generating title:', e)
    }
    setIsGeneratingTitle(false)
  }, [])

  const debouncedGenerateTitle = useCallback(
    debounce((question: string) => {
      generateConciseTitle(question)
    }, 1000),
    []
  )

  useEffect(() => {
    if (applyingTitle) return
    debouncedGenerateTitle(question)
    return () => debouncedGenerateTitle.cancel()
  }, [question])

  const categorizedQuestionKey = 'last-categorized-question' + paramsKey
  const [categorizedQuestion, setCategorizedQuestion] = usePersistentLocalState(
    '',
    categorizedQuestionKey
  )
  const hasDuplicateCategories =
    (params?.groupIds?.length ?? 0) > 0 || (params?.groupSlugs?.length ?? 0) > 0
  const hasChosenCategoryKey = 'has-chosen-category' + paramsKey
  const [hasChosenCategory, setHasChosenCategory] = usePersistentLocalState(
    hasDuplicateCategories,
    hasChosenCategoryKey
  )

  const similarContractsKey = 'similar-contracts' + paramsKey
  const [similarContracts, setSimilarContracts] = usePersistentInMemoryState<
    Contract[]
  >([], similarContractsKey)

  const dismissedSimilarContractsKey = 'dismissed-similar-contracts'
  const [dismissedSimilarContractTitles, setDismissedSimilarContractTitles] =
    usePersistentInMemoryState<string[]>([], dismissedSimilarContractsKey)

  const timeInMs = params?.closeTime ? Number(params.closeTime) : undefined
  const initDate = (timeInMs ? dayjs(timeInMs) : dayjs().add(7, 'day')).format(
    'YYYY-MM-DD'
  )
  const initTime = timeInMs ? dayjs(timeInMs).format('HH:mm') : '23:59'

  const closeDateKey = 'now-close-date' + paramsKey
  const [closeDate, setCloseDate] = usePersistentLocalState<undefined | string>(
    initDate,
    closeDateKey
  )

  const closeHoursMinutesKey = 'now-close-time' + paramsKey
  const [closeHoursMinutes, setCloseHoursMinutes] = usePersistentLocalState<
    string | undefined
  >(initTime, closeHoursMinutesKey)

  const selectedGroupsKey = 'new-selected-groups' + paramsKey
  const [selectedGroups, setSelectedGroups] = usePersistentLocalState<Group[]>(
    [],
    selectedGroupsKey
  )

  const defaultBountyAmount = 1000
  const bountyKey = 'new-bounty' + paramsKey
  const [bountyAmount, setBountyAmount] = usePersistentLocalState<
    number | undefined
  >(defaultBountyAmount, bountyKey)

  const isAutoBountyKey = 'is-auto-bounty' + paramsKey
  const [isAutoBounty, setIsAutoBounty] = usePersistentLocalState(
    false,
    isAutoBountyKey
  )

  const { balance } = creator

  const closeTime = closeDate
    ? dayjs(`${closeDate}T${closeHoursMinutes}`).valueOf()
    : undefined
  const hasManuallyEditedCloseDateKey =
    'has-manually-edited-close-date' + paramsKey
  const [_, setHasManuallyEditedCloseDate] = usePersistentLocalState<boolean>(
    false,
    hasManuallyEditedCloseDateKey
  )
  // Only way to get the real state is to read directly from localStorage after await to bypass stale closures
  const readHasManuallyEditedCloseDate = useCallback(
    () => safeLocalStorage?.getItem(hasManuallyEditedCloseDateKey) === 'true',
    [hasManuallyEditedCloseDateKey]
  )

  const min = minString ? parseFloat(minString) : undefined
  const max = maxString ? parseFloat(maxString) : undefined
  const initialValue = initialValueString
    ? parseFloat(initialValueString)
    : undefined

  const [neverCloses, setNeverCloses] = useState(false)

  const shouldHaveCloseDate =
    outcomeType !== 'STONK' && !NON_BETTING_OUTCOMES.includes(outcomeType)

  useEffect(() => {
    if (!shouldHaveCloseDate) {
      setCloseDate(undefined)
      setCloseHoursMinutes(undefined)
      setNeverCloses(true)
      if (outcomeType == 'STONK') {
        if (editor?.isEmpty) {
          editor?.commands.setContent(
            generateJSON(
              `<div>
            ${STONK_YES}: good<br/>${STONK_NO}: bad<br/>Question trades based on sentiment & never
            resolves.
          </div>`,
              extensions
            )
          )
        }
      }
    } else if (!closeDate) {
      setCloseDate(initDate)
      setCloseHoursMinutes(initTime)
    }
  }, [outcomeType])
  const pollVoterVisibilityKey = 'poll-voter-visibility' + paramsKey
  const [voterVisibility, setVoterVisibility] =
    usePersistentLocalState<PollVoterVisibility>(
      'everyone',
      pollVoterVisibilityKey
    )

  const isValidQuestion =
    question.length > 0 && question.length <= MAX_QUESTION_LENGTH
  const hasAnswers =
    outcomeType === 'MULTIPLE_CHOICE' ||
    outcomeType === 'POLL' ||
    outcomeType === 'MULTI_NUMERIC' ||
    outcomeType === 'DATE'
  const minAnswers = outcomeType === 'POLL' ? 2 : 1
  const isValidMultipleChoice =
    !hasAnswers ||
    (numAnswers >= minAnswers &&
      answers.every((answer) => answer.trim().length > 0))

  const isValidDate =
    // closeTime must be in the future
    !shouldHaveCloseDate || (closeTime ?? Infinity) > Date.now()

  const isValidTopics = selectedGroups.length <= MAX_GROUPS_PER_MARKET
  const ante = getAnte(outcomeType, numAnswers, liquidityTier)
  const antePlusOneAnswer = getAnte(outcomeType, numAnswers + 1, liquidityTier)
  const answerCost = getAnswerCostFromLiquidity(ante, numAnswers)
  const marginalCost = antePlusOneAnswer > ante ? answerCost : 0
  const numberOfBuckets = getMultiNumericAnswerBucketRangeNames(
    min ?? 0,
    max ?? 0,
    precision && precision > 0 ? precision : 1
  ).length
  const minMaxValid =
    min !== undefined &&
    max !== undefined &&
    isFinite(min) &&
    isFinite(max) &&
    min < max

  const midpointsError =
    outcomeType === 'MULTI_NUMERIC' || outcomeType === 'DATE'
      ? midpoints.length !== answers.length
      : false

  const isFree = creator.id === FREE_MARKET_USER_ID && ante <= 100

  const isValid =
    isValidQuestion &&
    (isFree ? true : ante <= balance) &&
    isValidDate &&
    isValidTopics &&
    (outcomeType !== 'PSEUDO_NUMERIC' ||
      (initialValue !== undefined &&
        minMaxValid &&
        min < initialValue &&
        max - min > 0.01 &&
        initialValue < max)) &&
    isValidMultipleChoice &&
    !midpointsError &&
    (outcomeType !== 'BOUNTIED_QUESTION' || bountyAmount !== undefined) &&
    (outcomeType === 'NUMBER'
      ? numberOfBuckets <= NUMBER_BUCKETS_MAX && numberOfBuckets >= 2
      : true) &&
    (outcomeType !== 'MULTI_NUMERIC' || (minMaxValid && unit !== ''))

  const [errorText, setErrorText] = useState<string>('')
  useEffect(() => {
    setErrorText('')
    if (isValid) return

    if (!isValidQuestion) {
      setErrorText(
        `Question must be between 1 and ${MAX_QUESTION_LENGTH} characters`
      )
    } else if (!isValidDate) {
      setErrorText('Close date must be in the future')
    } else if (!isValidMultipleChoice) {
      if (hasAnswers && numAnswers < minAnswers) {
        const type = outcomeType === 'POLL' ? 'Poll' : 'Multiple choice'
        const label = outcomeType === 'POLL' ? 'option' : 'answer'
        setErrorText(
          `${type} questions must have at least ${minAnswers} ${label}${
            minAnswers > 1 ? 's' : ''
          }`
        )
      } else {
        setErrorText(
          `All ${outcomeType === 'POLL' ? 'options' : 'answers'} must have text`
        )
      }
    } else if (!isValidTopics) {
      // can happen in rare cases when duplicating old question
      setErrorText(
        `A question can can have at most up to ${MAX_GROUPS_PER_MARKET} topic tags.`
      )
    } else if (outcomeType === 'MULTI_NUMERIC') {
      if (!minMaxValid) {
        setErrorText('Please enter valid low and high values')
      } else if (unit === '') {
        setErrorText('Please enter a metric/unit')
      }
    }
  }, [
    isValid,
    isValidDate,
    isValidMultipleChoice,
    isValidQuestion,
    isValidTopics,
    hasAnswers,
    answers.length,
    outcomeType,
    minAnswers,
    minMaxValid,
    unit,
  ])

  const editorKey = 'create market' + paramsKey
  const editor = useTextEditor({
    key: editorKey,
    size: 'md',
    max: MAX_DESCRIPTION_LENGTH,
    placeholder: 'Optional. Provide background info and details.',
  })

  useEffect(() => {
    if (!params?.description || !editor) return
    editor?.commands.setContent(JSON.parse(params.description))
  }, [params?.description, editor])

  // Helper to safely get HTML from editor, handling edge cases
  const getEditorHTML = useCallback(() => {
    if (!editor) return ''
    try {
      return editor.getHTML()
    } catch (e) {
      console.error('Error getting editor HTML:', e)
      // If there's an error, return empty and clear corrupted localStorage
      safeLocalStorage?.removeItem(editorKey)
      return ''
    }
  }, [editor, paramsKey])

  const resetProperties = () => {
    // This has to work when you navigate away so we can't do:
    // editor?.commands.clearContent(true)
    // setQuestion('')
    // because react hooks have unmounted

    safeLocalStorage?.removeItem(getEditorLocalStorageKey(editorKey))
    safeLocalStorage?.removeItem(`text create market`) // TODO: why is this here?

    setPersistentLocalState(questionKey, '')
    safeLocalStorage?.removeItem(closeDateKey)
    safeLocalStorage?.removeItem(closeHoursMinutesKey)
    setPersistentLocalState(hasManuallyEditedCloseDateKey, false)
    setPersistentLocalState(visibilityKey, 'public')
    setPersistentLocalState(selectedGroupsKey, [])
    setPersistentLocalState('threshold-answers' + paramsKey, defaultAnswers)
    setPersistentLocalState('threshold-midpoints' + paramsKey, [])
    setPersistentLocalState('bucket-answers' + paramsKey, defaultAnswers)
    setPersistentLocalState('bucket-midpoints' + paramsKey, [])
    setPersistentLocalState(unitKey, '')
    setPersistentLocalState(answersKey, defaultAnswers)
    setPersistentLocalState(minStringKey, '')
    setPersistentLocalState(maxStringKey, '')
    setPersistentLocalState(initValueKey, '')
    setPersistentLocalState(isLogScaleKey, false)
    setPersistentLocalState(bountyKey, defaultBountyAmount)
    setPersistentLocalState(hasChosenCategoryKey, false)
    setPersistentLocalState(pollVoterVisibilityKey, 'everyone')
    removePersistentInMemoryState(similarContractsKey)
    removePersistentInMemoryState(dismissedSimilarContractsKey)

    setPersistentLocalState(precisionKey, 1)
    // market tier is ordinary react state and gets reset automatically
  }

  const [submitState, setSubmitState] = useState<
    'EDITING' | 'LOADING' | 'DONE'
  >('EDITING')

  const [drafts, setDrafts] = useState<MarketDraft[]>([])
  const [showDraftsModal, setShowDraftsModal] = useState(false)

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
    setIsSavingDraft(true)
    try {
      const draft = {
        question,
        description: editor?.getJSON(),
        outcomeType,
        answers,
        closeDate,
        closeHoursMinutes,
        visibility,
        selectedGroups,
        savedAt: Date.now(),
      }
      await api('save-market-draft', { data: draft })
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
      setQuestion(draft.data.question)
      if (draft.data.description && editor) {
        editor.commands.setContent(draft.data.description)
      }
      setAnswers(draft.data.answers ?? defaultAnswers)
      setCloseDate(draft.data.closeDate)
      setCloseHoursMinutes(draft.data.closeHoursMinutes)
      setVisibility(draft.data.visibility as Visibility)
      setSelectedGroups(draft.data.selectedGroups)
      setShowDraftsModal(false)
    } catch (error) {
      console.error('Error loading draft:', error)
    }
  }

  const deleteDraft = async (id: number) => {
    try {
      await api('delete-market-draft', { id })
      await loadDrafts()
    } catch (error) {
      console.error('Error deleting draft:', error)
    }
  }

  const submit = async () => {
    if (!isValid) return
    setSubmitState('LOADING')
    try {
      const createProps = removeUndefinedProps({
        question,
        outcomeType,
        description: editor?.getJSON(),
        initialProb: 50,
        closeTime,
        min,
        max,
        initialValue,
        isLogScale,
        groupIds: selectedGroups.map((g) => g.id),
        answers,
        midpoints,
        addAnswersMode:
          outcomeType === 'MULTI_NUMERIC' || outcomeType === 'DATE'
            ? 'DISABLED'
            : addAnswersMode,
        shouldAnswersSumToOne,
        visibility,
        utcOffset: new Date().getTimezoneOffset(),
        totalBounty: bountyAmount,
        isAutoBounty:
          outcomeType === 'BOUNTIED_QUESTION' ? isAutoBounty : undefined,
        precision,
        liquidityTier,
        idempotencyKey,
        sportsStartTimestamp: params?.sportsStartTimestamp,
        sportsEventId: params?.sportsEventId,
        sportsLeague: params?.sportsLeague,
        unit: unit.trim(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        voterVisibility: outcomeType === 'POLL' ? voterVisibility : undefined,
      })

      const newContract = await api('market', createProps as any)

      track('create market', {
        slug: newContract.slug,
        selectedGroups: selectedGroups.map((g) => g.id),
        outcomeType,
      })

      // Await to clear form data from localstorage after navigate, since market is created.
      // Don't clear before navigate, because looks like a bug.
      const path = contractPath(newContract)
      await router.push(path)
      resetProperties()
    } catch (e) {
      console.error('error creating contract', e)
      setErrorText((e as any).message || 'Error creating contract')
      setSubmitState('EDITING')
    }
  }
  const [bountyError, setBountyError] = useState<string | undefined>(undefined)

  const findTopicsAndSimilarQuestions = useCallback(
    async (question: string) => {
      const trimmed = question.toLowerCase().trim()
      if (trimmed === '') {
        setHasChosenCategory(false)
        setSimilarContracts([])
        return
      }
      const [similarGroupsRes, contracts] = await Promise.all([
        !params?.groupIds?.length &&
        trimmed !== categorizedQuestion &&
        !hasChosenCategory
          ? getSimilarGroupsToContract({ question })
          : { groups: undefined },
        !dismissedSimilarContractTitles.includes(trimmed)
          ? searchContracts({
              term: question,
              contractType: outcomeType,
              filter: 'open',
              limit: 10,
              sort: 'most-popular',
            })
          : [],
      ])

      if (similarGroupsRes.groups) {
        setSelectedGroups(similarGroupsRes.groups)
        setCategorizedQuestion(trimmed)
      }
      setSimilarContracts(
        contracts?.filter((c) => compareTwoStrings(c.question, question) > 0.25)
      )
    },
    [dismissedSimilarContractTitles, categorizedQuestion, hasChosenCategory]
  )

  const isMulti = outcomeType === 'MULTIPLE_CHOICE'
  const isPoll = outcomeType === 'POLL'
  const isNumber = outcomeType === 'NUMBER'
  const isMultiNumeric = outcomeType === 'MULTI_NUMERIC'
  const isDate = outcomeType === 'DATE'

  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false)
  const [preGenerateContent, setPreGenerateContent] = useState<
    JSONContent | undefined
  >()

  const generateAIDescription = async () => {
    if (!question) return
    setIsGeneratingDescription(true)
    try {
      // Store current content before generating
      setPreGenerateContent(editor?.getJSON())

      const result = await api('generate-ai-description', {
        question,
        description: getEditorHTML(),
        answers,
        outcomeType,
        shouldAnswersSumToOne,
        addAnswersMode,
      })
      if (result.description && editor) {
        const endPos = editor.state.doc.content.size
        editor.commands.setTextSelection(endPos)
        editor.commands.insertContent(result.description)
      }
    } catch (e) {
      console.error('Error generating description:', e)
      // Reset preGenerateContent on error
      setPreGenerateContent(undefined)
    }
    setIsGeneratingDescription(false)
  }
  const [isGeneratingAnswers, setIsGeneratingAnswers] = useState(false)

  const generateAnswers = async () => {
    if (!question || outcomeType !== 'MULTIPLE_CHOICE') return
    setIsGeneratingAnswers(true)
    try {
      const result = await api('generate-ai-answers', {
        question,
        description: getEditorHTML(),
        shouldAnswersSumToOne,
        answers,
      })
      setAnswers([...answers, ...result.answers])
      setAddAnswersMode(result.addAnswersMode)
    } catch (e) {
      console.error('Error generating answers:', e)
    }
    setIsGeneratingAnswers(false)
  }

  const undoGeneration = () => {
    if (preGenerateContent && editor) {
      editor.commands.setContent(preGenerateContent)
      setPreGenerateContent(undefined)
    }
  }

  const inferUnit = async () => {
    if (!question || unit !== '') return
    try {
      const result = await api('infer-numeric-unit', {
        question,
        description: getEditorHTML(),
      })
      if (result.unit) {
        setUnit(result.unit)
      }
    } catch (e) {
      console.error('Error inferring unit:', e)
    }
  }

  // Function to get AI-suggested close date
  const getAISuggestedCloseDate = useEvent(async (currentQuestion: string) => {
    if (
      !currentQuestion ||
      currentQuestion.length < 20 ||
      !shouldHaveCloseDate
    ) {
      return
    }
    try {
      const result = await api('get-close-date', {
        question: currentQuestion,
        utcOffset: new Date().getTimezoneOffset() * -1,
      })
      const latestManualEditState = readHasManuallyEditedCloseDate()
      if (result?.closeTime && !latestManualEditState) {
        const date = dayjs(result.closeTime).format('YYYY-MM-DD')
        const time = dayjs(result.closeTime).format('HH:mm')
        setCloseDate(date)
        setCloseHoursMinutes(time)
      }
    } catch (e) {
      console.error('Error getting suggested close date:', e)
    }
  })

  const handleSetCloseDate = (date: string | undefined) => {
    setCloseDate(date)
    setHasManuallyEditedCloseDate(true)
  }

  const handleSetCloseHoursMinutes = (time: string | undefined) => {
    setCloseHoursMinutes(time)
    setHasManuallyEditedCloseDate(true)
  }

  const handleSetNeverCloses = (never: boolean) => {
    setNeverCloses(never)
    setHasManuallyEditedCloseDate(true)
  }

  return (
    <Col className="gap-6">
      <Col>
        <label className="px-1 pb-3 pt-2">
          Question<span className={'text-scarlet-500'}>*</span>
        </label>

        <ExpandingInput
          placeholder={getContractTypeFromValue(outcomeType, 'example')}
          autoFocus
          maxLength={MAX_QUESTION_LENGTH}
          value={question}
          onChange={(e) => setQuestion(e.target.value || '')}
          onBlur={(e) => {
            if (outcomeType === 'MULTI_NUMERIC') inferUnit()
            findTopicsAndSimilarQuestions(e.target.value || '')
            getAISuggestedCloseDate(e.target.value || '')
          }}
        />

        <Row className="text-ink-600 -mb-3 mt-2 h-6 items-center gap-2 text-sm">
          {suggestedTitle && suggestedTitle !== '' ? (
            <>
              <span className="">{suggestedTitle}</span>
              <Button
                color="gray-outline"
                size="2xs"
                loading={isGeneratingTitle}
                disabled={isGeneratingTitle}
                onClick={() => {
                  setApplyingTitle(true)
                  setQuestion(suggestedTitle)
                  setSuggestedTitle(undefined)
                  track('apply concise title', {
                    title: suggestedTitle,
                  })
                  setTimeout(() => {
                    setApplyingTitle(false)
                  }, 1000)
                }}
              >
                Accept
              </Button>
            </>
          ) : isGeneratingTitle && !suggestedTitle ? (
            <span>Generating concise title...</span>
          ) : null}
        </Row>
      </Col>
      {similarContracts.length ? (
        <SimilarContractsSection
          similarContracts={similarContracts}
          setSimilarContracts={setSimilarContracts}
          setDismissedSimilarContractTitles={setDismissedSimilarContractTitles}
          outcomeType={outcomeType}
          question={question}
        />
      ) : null}
      {(isMulti || isPoll) && !isNumber && (
        <MultipleChoiceAnswers
          answers={answers}
          setAnswers={setAnswers}
          addAnswersMode={addAnswersMode}
          setAddAnswersMode={setAddAnswersMode}
          shouldAnswersSumToOne={shouldAnswersSumToOne}
          outcomeType={outcomeType}
          placeholder={isMulti ? 'Type your answer..' : undefined}
          question={question}
          generateAnswers={generateAnswers}
          isGeneratingAnswers={isGeneratingAnswers}
          marginalCost={marginalCost}
        />
      )}
      {outcomeType == 'BOUNTIED_QUESTION' && (
        <Col className="gap-2">
          <label className="gap-2 px-1 py-2">
            <span className="mb-1 mr-1">Bounty</span>
            <InfoTooltip text="The award you give good answers. You can divide this amongst answers however you'd like." />
          </label>
          <BuyAmountInput
            minimumAmount={MINIMUM_BOUNTY}
            amount={bountyAmount}
            onChange={(newAmount) => setBountyAmount(newAmount)}
            error={bountyError}
            setError={setBountyError}
            quickButtonAmountSize="large"
          />
          <Row className="mt-2 items-center gap-2">
            <span>
              Auto-award bounty{' '}
              <InfoTooltip
                text={
                  'Automatically pay out the bounty to commenters in proportion to likes over 48 hours.'
                }
              />
            </span>
            <ShortToggle on={isAutoBounty} setOn={setIsAutoBounty} />
          </Row>
        </Col>
      )}
      {outcomeType === 'STONK' && (
        <div className="text-primary-500 ml-1 mt-1 text-sm">
          Tradeable shares of a stock based on sentiment. Never resolves.
        </div>
      )}
      {outcomeType === 'PSEUDO_NUMERIC' && (
        <div className="text-primary-500 ml-1 mt-1 text-sm">
          Predict the value of a number.
        </div>
      )}
      {isMultiNumeric && (
        <MultiNumericRangeSection
          paramsKey={paramsKey}
          submitState={submitState}
          question={question}
          getDescription={getEditorHTML}
          answers={answers}
          setAnswers={setAnswers}
          midpoints={midpoints}
          setMidpoints={setMidpoints}
          minString={minString}
          setMinString={setMinString}
          maxString={maxString}
          setMaxString={setMaxString}
          min={min}
          max={max}
          shouldAnswersSumToOne={shouldAnswersSumToOne}
          setShouldAnswersSumToOne={setMultiNumericSumsToOne}
          unit={unit}
          setUnit={setUnit}
          marginalCost={marginalCost}
        />
      )}{' '}
      {isDate && (
        <MultiNumericDateSection
          paramsKey={paramsKey}
          submitState={submitState}
          question={question}
          getDescription={getEditorHTML}
          answers={answers}
          setAnswers={setAnswers}
          midpoints={midpoints}
          setMidpoints={setMidpoints}
          minString={minString}
          setMinString={setMinString}
          maxString={maxString}
          setMaxString={setMaxString}
          shouldAnswersSumToOne={shouldAnswersSumToOne}
          setShouldAnswersSumToOne={setMultiNumericSumsToOne}
          marginalCost={marginalCost}
        />
      )}
      {outcomeType === 'PSEUDO_NUMERIC' && (
        <PseudoNumericRangeSection
          minString={minString}
          setMinString={setMinString}
          maxString={maxString}
          setMaxString={setMaxString}
          initialValueString={initialValueString}
          setInitialValueString={setInitialValueString}
          isLogScale={isLogScale}
          setIsLogScale={setIsLogScale}
          submitState={submitState}
          initialValue={initialValue}
          min={min}
          max={max}
        />
      )}{' '}
      {isNumber && (
        <NumberRangeSection
          minString={minString}
          setMinString={setMinString}
          maxString={maxString}
          setMaxString={setMaxString}
          submitState={submitState}
          precision={precision}
          setPrecision={setPrecision}
          min={min}
          max={max}
          paramsKey={paramsKey}
        />
      )}
      <TopicSelectorSection
        selectedGroups={selectedGroups}
        setSelectedGroups={setSelectedGroups}
        setHasChosenCategory={setHasChosenCategory}
        question={question}
      />
      <Col className="items-start gap-3">
        <Row className="w-full items-center justify-between">
          <label className="px-1">
            <span>Description</span>
          </label>
          <Row className="gap-2">
            {preGenerateContent && (
              <Button
                color="gray-outline"
                size="xs"
                disabled={isGeneratingDescription}
                onClick={undoGeneration}
                className="gap-1"
              >
                <BiUndo className="h-4 w-4" />
              </Button>
            )}
            <Button
              color="indigo-outline"
              size="xs"
              loading={isGeneratingDescription}
              onClick={generateAIDescription}
              disabled={!question || isGeneratingDescription}
            >
              Generate with AI
            </Button>
          </Row>
        </Row>
        <TextEditor editor={editor} />
      </Col>
      <CloseTimeSection
        closeDate={closeDate}
        setCloseDate={handleSetCloseDate}
        closeHoursMinutes={closeHoursMinutes}
        setCloseHoursMinutes={handleSetCloseHoursMinutes}
        neverCloses={neverCloses}
        setNeverCloses={handleSetNeverCloses}
        submitState={submitState}
        outcomeType={outcomeType}
        initTime={initTime}
      />
      {outcomeType === 'POLL' && (
        <>
          <Col className="gap-2">
            <label className="gap-1">
              <span className="mb-1">Who can see who voted?</span>
            </label>
            <ChoicesToggleGroup
              className="w-fit"
              currentChoice={voterVisibility}
              choicesMap={{
                Everyone: 'everyone',
                'Only me': 'creator',
              }}
              setChoice={(val) =>
                setVoterVisibility(val as PollVoterVisibility)
              }
            />
          </Col>
        </>
      )}
      <Row className="mt-2 items-center gap-2">
        <span>
          Publicly listed{' '}
          <InfoTooltip
            text={
              visibility === 'public'
                ? 'Visible on home page and search results'
                : "Only visible via link. Won't notify followers"
            }
          />
        </span>
        <ShortToggle
          on={visibility === 'public'}
          setOn={(on) => {
            setVisibility(on ? 'public' : 'unlisted')
          }}
        />
      </Row>
      <CostSection
        balance={isFree ? 100 : balance}
        numAnswers={numAnswers}
        outcomeType={outcomeType}
        liquidityTier={liquidityTier}
        setLiquidityTier={setLiquidityTier}
      />
      {outcomeType !== 'POLL' && outcomeType !== 'BOUNTIED_QUESTION' && (
        <div className="text-ink-600 -mt-3 text-sm">
          Earn back your creation cost! Get a{' '}
          <b>
            {formatWithToken({
              amount: getUniqueBettorBonusAmount(ante, numAnswers),
              short: true,
              token: 'M$',
            })}{' '}
            bonus
          </b>{' '}
          for each unique trader on your question.
        </div>
      )}
      {errorText && <span className={'text-error'}>{errorText}</span>}
      <Button
        className="w-full"
        type="submit"
        color={submitState === 'DONE' ? 'green' : 'indigo'}
        size="xl"
        loading={submitState === 'LOADING'}
        disabled={
          !isValid ||
          editor?.storage.upload.mutation.isLoading ||
          (outcomeType == 'BOUNTIED_QUESTION' && bountyError)
        }
        onClick={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        {submitState === 'EDITING'
          ? `Create question for ${formatWithToken({
              amount: ante,
              short: true,
              token: 'M$',
            })}`
          : submitState === 'LOADING'
          ? 'Creating...'
          : 'Created!'}
      </Button>
      <Row className="-mt-2 w-full gap-2">
        <Button
          size="sm"
          className="w-full"
          color="gray-outline"
          onClick={saveDraftToDb}
          disabled={isSavingDraft}
          loading={isSavingDraft}
        >
          Save draft
        </Button>
        <Button
          size="sm"
          className="w-full"
          disabled={drafts.length === 0}
          color={'gray-outline'}
          onClick={() => setShowDraftsModal(true)}
        >
          View drafts ({drafts.length})
        </Button>
      </Row>
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
    <Modal
      className={MODAL_CLASS}
      open={showDraftsModal}
      setOpen={setShowDraftsModal}
    >
      <div className="max-h-[80vh] overflow-y-auto p-6">
        <h3 className="mb-4 text-xl font-semibold">Saved Drafts</h3>
        {drafts.length === 0 ? (
          <p>No saved drafts</p>
        ) : (
          <div className="flex flex-col gap-4">
            {drafts.map((draft) => (
              <div
                key={draft.id}
                className="flex flex-col gap-2 rounded border p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium">
                      {draft.data.question || 'Untitled'}
                    </p>
                    <p className="text-ink-600 text-sm">
                      <RelativeTimestamp
                        time={new Date(draft.createdAt).getTime()}
                      />
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      color="gray-outline"
                      onClick={() => loadDraftFromDb(draft)}
                    >
                      Load
                    </Button>
                    <Button
                      color="red-outline"
                      onClick={() => deleteDraft(draft.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>

                <div className="text-ink-600 text-sm">
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
