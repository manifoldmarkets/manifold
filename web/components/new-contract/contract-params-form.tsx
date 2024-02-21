import dayjs from 'dayjs'
import router from 'next/router'
import { useEffect, useState } from 'react'
import { generateJSON } from '@tiptap/core'

import {
  add_answers_mode,
  Contract,
  contractPath,
  CreateableOutcomeType,
  MAX_DESCRIPTION_LENGTH,
  MAX_QUESTION_LENGTH,
  NON_BETTING_OUTCOMES,
  Visibility,
} from 'common/contract'
import { getAnte, MINIMUM_BOUNTY } from 'common/economy'
import { BTE_USER_ID } from 'common/envs/constants'
import { formatMoney } from 'common/util/format'
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
import { Group } from 'common/group'
import { STONK_NO, STONK_YES } from 'common/stonk'
import {
  freeQuestionRemaining,
  getAvailableBalancePerQuestion,
  marketCreationCosts,
  User,
} from 'common/user'
import { removeUndefinedProps } from 'common/util/object'
import { extensions } from 'common/util/parse'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import {
  api,
  getSimilarGroupsToContract,
  searchContracts,
} from 'web/lib/firebase/api'
import { track } from 'web/lib/service/analytics'
import { getGroup, getGroupFromSlug } from 'web/lib/supabase/group'
import { safeLocalStorage } from 'web/lib/util/local'
import { Col } from '../layout/col'
import { BuyAmountInput } from '../widgets/amount-input'
import { getContractTypeThingFromValue } from './create-contract-types'
import { NewQuestionParams } from './new-contract-panel'
import { getContractWithFields } from 'web/lib/supabase/contracts'
import { filterDefined } from 'common/util/array'
import { LiteMarket } from 'common/api/market-types'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { compareTwoStrings } from 'string-similarity'
import { CostSection } from 'web/components/new-contract/cost-section'
import { CloseTimeSection } from 'web/components/new-contract/close-time-section'
import { TopicSelectorSection } from 'web/components/new-contract/topic-selector-section'
import { PseudoNumericRangeSection } from 'web/components/new-contract/pseudo-numeric-range-section'
import { SimilarContractsSection } from 'web/components/new-contract/similar-contracts-section'

export function ContractParamsForm(props: {
  creator: User
  outcomeType: CreateableOutcomeType
  params?: NewQuestionParams
}) {
  const { creator, params, outcomeType } = props
  const paramsKey =
    (params?.q ?? '') +
    (params?.groupSlugs?.join('') ?? '') +
    (params?.groupIds?.join('') ?? '')
  const [minString, setMinString] = usePersistentLocalState(
    params?.min?.toString() ?? '',
    'new-min' + paramsKey
  )
  const [maxString, setMaxString] = usePersistentLocalState(
    params?.max?.toString() ?? '',
    'new-max' + paramsKey
  )
  const [isLogScale, setIsLogScale] = usePersistentLocalState<boolean>(
    !!params?.isLogScale,
    'new-is-log-scale' + paramsKey
  )

  const [initialValueString, setInitialValueString] = usePersistentLocalState(
    params?.initValue?.toString(),
    'new-init-value' + paramsKey
  )
  const [visibility, setVisibility] = usePersistentLocalState<Visibility>(
    (params?.visibility ?? 'public') as Visibility,
    `new-visibility` + paramsKey
  )

  // For multiple choice, init to 2 empty answers
  const defaultAnswers =
    outcomeType === 'MULTIPLE_CHOICE' || outcomeType == 'POLL' ? ['', ''] : []

  const [answers, setAnswers] = usePersistentLocalState(
    params?.answers ? params.answers : defaultAnswers,
    'new-answers-with-other' + paramsKey
  )
  const [addAnswersMode, setAddAnswersMode] = useState<add_answers_mode>(
    params?.addAnswersMode ?? 'DISABLED'
  )
  const [shouldAnswersSumToOne, setShouldAnswersSumToOne] = useState(
    params?.shouldAnswersSumToOne ?? true
  )
  // NOTE: if you add another user-controlled state variable here, you should also add it to the duplication parameters

  const hasOtherAnswer = addAnswersMode !== 'DISABLED' && shouldAnswersSumToOne
  const numAnswers = hasOtherAnswer ? answers.length + 1 : answers.length

  useEffect(() => {
    if (params?.q) setQuestion(params?.q ?? '')
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
        setSelectedGroups(
          filterDefined(groups).filter((g) => g.privacyStatus !== 'private')
        )
      }
      getAndSetGroups(params.groupIds)
    }
    if (params?.groupSlugs) {
      const getAndSetGroupsViaSlugs = async (groupSlugs: string[]) => {
        const groups = await Promise.all(
          groupSlugs.map((s) => getGroupFromSlug(s))
        )
        setSelectedGroups(
          filterDefined(groups).filter((g) => g.privacyStatus !== 'private')
        )
      }
      getAndSetGroupsViaSlugs(params.groupSlugs)
    }
  }, [JSON.stringify(params?.groupIds)])

  useEffect(() => {
    if (addAnswersMode === 'DISABLED' && answers.length < 2) {
      if (answers.length === 0) setAnswers(defaultAnswers)
      else setAnswers(answers.concat(['']))
    }
  })

  const [question, setQuestion] = usePersistentLocalState(
    '',
    'new-question' + paramsKey
  )
  const [categorizedQuestion, setCategorizedQuestion] = usePersistentLocalState(
    '',
    'last-categorized-question' + paramsKey
  )
  const [hasChosenCategory, setHasChosenCategory] = usePersistentLocalState(
    (params?.groupIds?.length ?? 0) > 0,
    'has-chosen-category' + paramsKey
  )
  const [similarContracts, setSimilarContracts] = usePersistentInMemoryState<
    Contract[]
  >([], 'similar-contracts' + paramsKey)

  const [dismissedSimilarContractTitles, setDismissedSimilarContractTitles] =
    usePersistentInMemoryState<string[]>([], 'dismissed-similar-contracts')

  const ante = getAnte(outcomeType, numAnswers)

  const timeInMs = params?.closeTime ? Number(params.closeTime) : undefined
  const initDate = (timeInMs ? dayjs(timeInMs) : dayjs().add(7, 'day')).format(
    'YYYY-MM-DD'
  )
  const initTime = timeInMs ? dayjs(timeInMs).format('HH:mm') : '23:59'

  const [closeDate, setCloseDate] = usePersistentLocalState<undefined | string>(
    initDate,
    'now-close-date' + paramsKey
  )

  const [closeHoursMinutes, setCloseHoursMinutes] = usePersistentLocalState<
    string | undefined
  >(initTime, 'now-close-time' + paramsKey)

  const [selectedGroups, setSelectedGroups] = usePersistentLocalState<Group[]>(
    [],
    'new-selected-groups' + paramsKey
  )

  const defaultBountyAmount = 500
  const [bountyAmount, setBountyAmount] = usePersistentLocalState<
    number | undefined
  >(defaultBountyAmount, 'new-bounty' + paramsKey)

  const balance = getAvailableBalancePerQuestion(creator)
  const { amountSuppliedByUser, amountSuppliedByHouse } = marketCreationCosts(
    creator,
    outcomeType !== 'BOUNTIED_QUESTION'
      ? ante
      : freeQuestionRemaining(
          creator.freeQuestionsCreated,
          creator.createdTime
        ) > 0
      ? 250
      : bountyAmount ?? defaultBountyAmount
  )

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

  const isValidQuestion = question.length > 0

  const hasAnswers = outcomeType === 'MULTIPLE_CHOICE' || outcomeType === 'POLL'
  const isValidMultipleChoice =
    !hasAnswers || answers.every((answer) => answer.trim().length > 0)

  const isValidDate =
    // closeTime must be in the future
    !shouldHaveCloseDate || (closeTime ?? Infinity) > Date.now()

  const isValid =
    isValidQuestion &&
    ante !== undefined &&
    ante !== null &&
    (ante <= balance || creator.id === BTE_USER_ID) &&
    isValidDate &&
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
    (outcomeType !== 'BOUNTIED_QUESTION' || bountyAmount !== undefined)

  const [errorText, setErrorText] = useState<string>('')
  useEffect(() => {
    setErrorText('')

    if (!isValid) {
      if (!isValidDate) {
        setErrorText('Close date must be in the future')
      }
      if (!isValidMultipleChoice) {
        setErrorText(
          `All ${outcomeType === 'POLL' ? 'options' : 'answers'} must have text`
        )
      }
    }
  }, [isValid, isValidDate, isValidMultipleChoice, isValidQuestion])

  const editorKey = 'create market' + paramsKey
  const editor = useTextEditor({
    key: editorKey,
    max: MAX_DESCRIPTION_LENGTH,
    placeholder: 'Optional. Provide background info and details.',
    defaultValue: params?.description
      ? JSON.parse(params.description)
      : undefined,
  })

  const resetProperties = () => {
    // We would call this:
    // editor?.commands.clearContent(true)
    // except it doesn't work after you've navigated away. So we do this instead:
    safeLocalStorage?.removeItem(getEditorLocalStorageKey(editorKey))

    safeLocalStorage?.removeItem(`text create market`)
    setQuestion('')
    setCloseDate(undefined)
    setCloseHoursMinutes(undefined)
    setSelectedGroups([])
    setVisibility((params?.visibility as Visibility) ?? 'public')
    setAnswers(defaultAnswers)
    setMinString('')
    setMaxString('')
    setInitialValueString('')
    setIsLogScale(false)
    setBountyAmount(50)
    setHasChosenCategory(false)
    setSimilarContracts([])
    setDismissedSimilarContractTitles([])
  }

  const [submitState, setSubmitState] = useState<
    'EDITING' | 'LOADING' | 'DONE'
  >('EDITING')

  async function submit() {
    if (!isValid) return
    setSubmitState('LOADING')
    try {
      const createProps = removeUndefinedProps({
        question,
        outcomeType,
        description: editor?.getJSON(),
        initialProb: 50,
        ante,
        closeTime,
        min,
        max,
        initialValue,
        isLogScale,
        groupIds: selectedGroups.map((g) => g.id),
        answers,
        addAnswersMode,
        shouldAnswersSumToOne,
        visibility,
        utcOffset: new Date().getTimezoneOffset(),
        totalBounty:
          amountSuppliedByHouse > 0 ? amountSuppliedByHouse : bountyAmount,
      })
      const newContract = await api('market', createProps as any)

      // wait for supabase
      const supabaseContract = await waitForSupabaseContract(newContract)

      track('create market', {
        slug: newContract.slug,
        selectedGroups: selectedGroups.map((g) => g.id),
        outcomeType,
      })

      // Clear form data from localstorage on navigate, since market is created.
      // Don't clear before navigate, because looks like a bug.
      const clearFormOnNavigate = () => {
        resetProperties()
        router.events.off('routeChangeComplete', clearFormOnNavigate)
      }
      router.events.on('routeChangeComplete', clearFormOnNavigate)

      try {
        await router.push(contractPath(supabaseContract as Contract))
      } catch (error) {
        console.error(error)
      }
    } catch (e) {
      console.error('error creating contract', e)
      setErrorText((e as any).message || 'Error creating contract')
      setSubmitState('EDITING')
    }
  }
  const [bountyError, setBountyError] = useState<string | undefined>(undefined)

  const finishedTypingQuestion = async () => {
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

  return (
    <Col className="gap-6">
      <Col>
        <label className="px-1 pb-3 pt-2">
          Question<span className={'text-scarlet-500'}>*</span>
        </label>

        <ExpandingInput
          placeholder={getContractTypeThingFromValue('example', outcomeType)}
          autoFocus
          maxLength={MAX_QUESTION_LENGTH}
          value={question}
          onChange={(e) => setQuestion(e.target.value || '')}
          onBlur={finishedTypingQuestion}
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
      {(isMulti || outcomeType == 'POLL') && (
        <MultipleChoiceAnswers
          answers={answers}
          setAnswers={setAnswers}
          addAnswersMode={addAnswersMode}
          setAddAnswersMode={setAddAnswersMode}
          shouldAnswersSumToOne={shouldAnswersSumToOne}
          setShouldAnswersSumToOne={setShouldAnswersSumToOne}
          outcomeType={outcomeType}
          placeholder={isMulti ? 'Type your answer..' : undefined}
        />
      )}
      {outcomeType == 'BOUNTIED_QUESTION' && (
        <Col className="gap-2">
          <label className="gap-2 px-1 py-2">
            <span className="mb-1 mr-1">Bounty</span>
            <InfoTooltip text="The award you give good answers. You can divide this amongst answers however you'd like." />
          </label>
          {amountSuppliedByHouse === 0 ? (
            <BuyAmountInput
              minimumAmount={MINIMUM_BOUNTY}
              amount={bountyAmount}
              onChange={(newAmount) => setBountyAmount(newAmount)}
              error={bountyError}
              setError={setBountyError}
              quickButtonValues="large"
            />
          ) : (
            <div className="text-ink-700 pl-1 text-sm">
              {formatMoney(amountSuppliedByHouse)} (Supplied by the house)
            </div>
          )}
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
      )}

      <TopicSelectorSection
        selectedGroups={selectedGroups}
        setSelectedGroups={setSelectedGroups}
        setHasChosenCategory={setHasChosenCategory}
        creator={creator}
        question={question}
      />

      <Col className="items-start gap-3">
        <label className="px-1">
          <span>Description</span>
        </label>
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
        amountSuppliedByUser={amountSuppliedByUser}
        outcomeType={outcomeType}
        ante={ante}
        isMulti={isMulti}
        visibility={visibility}
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
          ? 'Create Question'
          : submitState === 'LOADING'
          ? 'Creating...'
          : 'Created!'}
      </Button>

      <div />
    </Col>
  )
}

async function fetchContract(contractId: string) {
  try {
    const contract = await getContractWithFields(contractId)
    if (contract && contract.visibility && contract.slug) {
      return contract
    }
    return null
  } catch (error) {
    console.error('Error fetching the contract:', error)
    return null
  }
}

async function waitForSupabaseContract(contract: LiteMarket) {
  let retries = 100

  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms))

  while (retries > 0) {
    const c = await fetchContract(contract.id)
    if (c) return c
    retries--
    await delay(100) // wait for 100 milliseconds after each try
  }

  throw new Error(
    `We created your market, but it's taking a while to appear. Check this link in a minute: ${contract.url}`
  )
}
