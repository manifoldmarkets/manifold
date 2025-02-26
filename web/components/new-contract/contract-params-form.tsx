import dayjs from 'dayjs'
import router from 'next/router'
import { useEffect, useState } from 'react'
import { generateJSON, JSONContent } from '@tiptap/core'

import {
  add_answers_mode,
  Contract,
  CreateableOutcomeType,
  MAX_DESCRIPTION_LENGTH,
  MAX_QUESTION_LENGTH,
  MULTI_NUMERIC_BUCKETS_MAX,
  NON_BETTING_OUTCOMES,
  twombaContractPath,
  Visibility,
} from 'common/contract'
import {
  getAnte,
  MINIMUM_BOUNTY,
  UNIQUE_ANSWER_BETTOR_BONUS_AMOUNT,
  UNIQUE_BETTOR_BONUS_AMOUNT,
} from 'common/economy'
import { MultipleChoiceAnswers } from 'web/components/answers/multiple-choice-answers'
import { Button } from 'web/components/buttons/button'
import { Row } from 'web/components/layout/row'
import {
  getEditorLocalStorageKey,
  TextEditor,
  useTextEditor,
} from 'web/components/widgets/editor'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import ShortToggle from 'web/components/widgets/short-toggle'
import { Group, MAX_GROUPS_PER_MARKET } from 'common/group'
import { STONK_NO, STONK_YES } from 'common/stonk'
import { User } from 'common/user'
import { removeUndefinedProps } from 'common/util/object'
import { extensions } from 'common/util/parse'
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
import { BuyAmountInput } from '../widgets/amount-input'
import { getContractTypeFromValue } from './create-contract-types'
import { NewQuestionParams } from './new-contract-panel'
import { filterDefined } from 'common/util/array'
import {
  removePersistentInMemoryState,
  usePersistentInMemoryState,
} from 'client-common/hooks/use-persistent-in-memory-state'
import { compareTwoStrings } from 'string-similarity'
import { CostSection } from 'web/components/new-contract/cost-section'
import { CloseTimeSection } from 'web/components/new-contract/close-time-section'
import { TopicSelectorSection } from 'web/components/new-contract/topic-selector-section'
import { PseudoNumericRangeSection } from 'web/components/new-contract/pseudo-numeric-range-section'
import { SimilarContractsSection } from 'web/components/new-contract/similar-contracts-section'
import { MultiNumericRangeSection } from './multi-numeric-range-section'
import { NumberRangeSection } from './number-range-section'
import { getMultiNumericAnswerBucketRangeNames } from 'common/src/number'
import { randomString } from 'common/util/random'
import { formatWithToken } from 'common/util/format'
import { BiUndo } from 'react-icons/bi'
import { liquidityTiers } from 'common/tier'

export function ContractParamsForm(props: {
  creator: User
  outcomeType: CreateableOutcomeType
  params?: Partial<NewQuestionParams>
}) {
  const { creator, params, outcomeType } = props

  const [liquidityTier, setLiquidityTier] = usePersistentLocalState<number>(
    liquidityTiers[0],
    'liquidity-tier'
  )

  const paramsKey =
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
    outcomeType === 'MULTIPLE_CHOICE' || outcomeType == 'POLL' ? ['', ''] : []

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
      params?.shouldAnswersSumToOne ?? false,
      'new-multi-numeric-sums-to-one' + paramsKey
    )

  const [unit, setUnit] = usePersistentLocalState<string>(
    params?.unit ?? '',
    'new-multi-numeric-unit' + paramsKey
  )
  const addAnswersModeKey = 'new-add-answers-mode' + paramsKey
  const [addAnswersMode, setAddAnswersMode] =
    usePersistentLocalState<add_answers_mode>(
      params?.addAnswersMode ?? 'DISABLED',
      addAnswersModeKey
    )
  const shouldAnswersSumToOne =
    outcomeType === 'MULTI_NUMERIC'
      ? multiNumericSumsToOne
      : params?.shouldAnswersSumToOne ?? outcomeType === 'NUMBER'

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

  const questionKey = 'new-question' + paramsKey
  const [question, setQuestion] = usePersistentLocalState(
    params?.q ?? '',
    questionKey
  )

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

  const isValidQuestion =
    question.length > 0 && question.length <= MAX_QUESTION_LENGTH
  const hasAnswers = outcomeType === 'MULTIPLE_CHOICE' || outcomeType === 'POLL'
  const isValidMultipleChoice =
    !hasAnswers || answers.every((answer) => answer.trim().length > 0)

  const isValidDate =
    // closeTime must be in the future
    !shouldHaveCloseDate || (closeTime ?? Infinity) > Date.now()

  const isValidTopics = selectedGroups.length <= MAX_GROUPS_PER_MARKET
  const ante = getAnte(outcomeType, numAnswers, liquidityTier)
  const numberOfBuckets = getMultiNumericAnswerBucketRangeNames(
    min ?? 0,
    max ?? 0,
    precision && precision > 0 ? precision : 1
  ).length
  const isValid =
    isValidQuestion &&
    ante <= balance &&
    isValidDate &&
    isValidTopics &&
    (outcomeType !== 'PSEUDO_NUMERIC' ||
      (min !== undefined &&
        max !== undefined &&
        initialValue !== undefined &&
        isFinite(min) &&
        isFinite(max) &&
        min < max &&
        max - min > 0.01 &&
        min < initialValue &&
        initialValue < max)) &&
    isValidMultipleChoice &&
    (outcomeType !== 'BOUNTIED_QUESTION' || bountyAmount !== undefined) &&
    (outcomeType === 'NUMBER'
      ? numberOfBuckets <= MULTI_NUMERIC_BUCKETS_MAX && numberOfBuckets >= 2
      : true)

  const [errorText, setErrorText] = useState<string>('')
  useEffect(() => {
    setErrorText('')
    if (isValid) return

    if (!isValidDate) {
      setErrorText('Close date must be in the future')
    } else if (!isValidMultipleChoice) {
      setErrorText(
        `All ${outcomeType === 'POLL' ? 'options' : 'answers'} must have text`
      )
    } else if (!isValidTopics) {
      // can happen in rare cases when duplicating old question
      setErrorText(
        `A question can can have at most up to ${MAX_GROUPS_PER_MARKET} topic tags.`
      )
    }
    if (!isValidQuestion) {
      setErrorText(
        `Question must be between 1 and ${MAX_QUESTION_LENGTH} characters`
      )
    }
  }, [
    isValid,
    isValidDate,
    isValidMultipleChoice,
    isValidQuestion,
    isValidTopics,
  ])

  const editorKey = 'create market' + paramsKey
  const editor = useTextEditor({
    key: editorKey,
    size: 'md',
    max: MAX_DESCRIPTION_LENGTH,
    placeholder: 'Optional. Provide background info and details.',
    defaultValue: params?.description
      ? JSON.parse(params.description)
      : undefined,
  })
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
    setPersistentLocalState(selectedGroupsKey, [])
    setPersistentLocalState(answersKey, defaultAnswers)
    setPersistentLocalState(minStringKey, '')
    setPersistentLocalState(maxStringKey, '')
    setPersistentLocalState(initValueKey, '')
    setPersistentLocalState(isLogScaleKey, false)
    setPersistentLocalState(bountyKey, defaultBountyAmount)
    setPersistentLocalState(hasChosenCategoryKey, false)

    removePersistentInMemoryState(similarContractsKey)
    removePersistentInMemoryState(dismissedSimilarContractsKey)

    setPersistentLocalState(precisionKey, 1)
    // market tier is ordinary react state and gets reset automatically
  }

  const [submitState, setSubmitState] = useState<
    'EDITING' | 'LOADING' | 'DONE'
  >('EDITING')

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
        addAnswersMode,
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
      })

      const newContract = await api('market', createProps as any)

      track('create market', {
        slug: newContract.slug,
        selectedGroups: selectedGroups.map((g) => g.id),
        outcomeType,
      })

      // Await to clear form data from localstorage after navigate, since market is created.
      // Don't clear before navigate, because looks like a bug.
      const path = twombaContractPath(newContract)
      await router.push(path)
      resetProperties()
    } catch (e) {
      console.error('error creating contract', e)
      setErrorText((e as any).message || 'Error creating contract')
      setSubmitState('EDITING')
    }
  }
  const [bountyError, setBountyError] = useState<string | undefined>(undefined)

  const findTopicsAndSimilarQuestions = async (question: string) => {
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
  }

  const isMulti = outcomeType === 'MULTIPLE_CHOICE'
  const isNumber = outcomeType === 'NUMBER'
  const isMultiNumeric = outcomeType === 'MULTI_NUMERIC'

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
        description: editor?.getHTML(),
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
        description: editor?.getHTML(),
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
          onBlur={(e) => findTopicsAndSimilarQuestions(e.target.value || '')}
        />
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
      {(isMulti || outcomeType == 'POLL') && !isNumber && (
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
          description={editor?.getHTML()}
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
        setCloseDate={setCloseDate}
        closeHoursMinutes={closeHoursMinutes}
        setCloseHoursMinutes={setCloseHoursMinutes}
        neverCloses={neverCloses}
        setNeverCloses={setNeverCloses}
        submitState={submitState}
        outcomeType={outcomeType}
        initTime={initTime}
      />
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
        balance={balance}
        numAnswers={numAnswers}
        outcomeType={outcomeType}
        liquidityTier={liquidityTier}
        setLiquidityTier={setLiquidityTier}
      />
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
      <div className="text-ink-600 -mt-3 text-sm">
        Earn back your creation cost! Get a{' '}
        <b>
          {formatWithToken({
            amount:
              outcomeType == 'MULTIPLE_CHOICE'
                ? UNIQUE_ANSWER_BETTOR_BONUS_AMOUNT
                : UNIQUE_BETTOR_BONUS_AMOUNT,
            short: true,
            token: 'M$',
          })}{' '}
          bonus
        </b>{' '}
        for each unique trader on your question.
      </div>
      <div />
    </Col>
  )
}
