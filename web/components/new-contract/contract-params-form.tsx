import dayjs from 'dayjs'
import router from 'next/router'
import { useEffect, useState } from 'react'
import { XIcon } from '@heroicons/react/outline'
import { uniqBy } from 'lodash'
import { toast } from 'react-hot-toast'
import { generateJSON } from '@tiptap/core'
import clsx from 'clsx'

import {
  Contract,
  MAX_QUESTION_LENGTH,
  OutcomeType,
  Visibility,
  add_answers_mode,
  contractPath,
  contractUrl,
} from 'common/contract'
import {
  MINIMUM_BOUNTY,
  UNIQUE_ANSWER_BETTOR_BONUS_AMOUNT,
  UNIQUE_BETTOR_BONUS_AMOUNT,
} from 'common/economy'
import { ENV_CONFIG } from 'common/envs/constants'
import { formatMoney } from 'common/util/format'
import { AddFundsModal } from 'web/components/add-funds-modal'
import { MultipleChoiceAnswers } from 'web/components/answers/multiple-choice-answers'
import { Button } from 'web/components/buttons/button'
import { TopicSelector } from 'web/components/topics/topic-selector'
import { Row } from 'web/components/layout/row'
import { Checkbox } from 'web/components/widgets/checkbox'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import {
  TextEditor,
  getEditorLocalStorageKey,
} from 'web/components/widgets/editor'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { Input } from 'web/components/widgets/input'
import ShortToggle from 'web/components/widgets/short-toggle'
import { MAX_DESCRIPTION_LENGTH, NON_BETTING_OUTCOMES } from 'common/contract'
import { getAnte } from 'common/economy'
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
import { useTextEditor } from 'web/components/widgets/editor'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { createMarket, getSimilarGroupsToContract } from 'web/lib/firebase/api'
import { track } from 'web/lib/service/analytics'
import { getGroup, getGroupFromSlug } from 'web/lib/supabase/group'
import { safeLocalStorage } from 'web/lib/util/local'
import { Col } from '../layout/col'
import { BuyAmountInput } from '../widgets/amount-input'
import { getContractTypeThingFromValue } from './create-contract-types'
import { ContractVisibilityType, NewQuestionParams } from './new-contract-panel'
import { VisibilityTheme } from 'web/pages/create'
import { getContractWithFields } from 'web/lib/supabase/contracts'
import { filterDefined } from 'common/util/array'
import { TopicTag } from 'web/components/topics/topic-tag'

export function ContractParamsForm(props: {
  creator: User
  outcomeType: OutcomeType
  setPrivacy: (theme: VisibilityTheme) => void
  params?: NewQuestionParams
}) {
  const { creator, params, setPrivacy, outcomeType } = props
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
    (params?.visibility as Visibility) ?? 'public',
    `new-visibility` + paramsKey
  )

  // For multiple choice, init to 2 empty answers
  const defaultAnswers =
    outcomeType === 'MULTIPLE_CHOICE' || outcomeType == 'POLL' ? ['', ''] : []

  const [answers, setAnswers] = usePersistentLocalState(
    params?.answers ? params.answers : defaultAnswers,
    'new-answers-with-other' + paramsKey
  )
  const [addAnswersMode, setAddAnswersMode] =
    useState<add_answers_mode>('DISABLED')
  const [shouldAnswersSumToOne, setShouldAnswersSumToOne] = useState(true)

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
  const [bountyAmount, setBountyAmount] = usePersistentLocalState<
    number | undefined
  >(50, 'new-bounty' + paramsKey)

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
      : bountyAmount ?? 50
  )

  const closeTime = closeDate
    ? dayjs(`${closeDate}T${closeHoursMinutes}`).valueOf()
    : undefined

  const min = minString ? parseFloat(minString) : undefined
  const max = maxString ? parseFloat(maxString) : undefined
  const initialValue = initialValueString
    ? parseFloat(initialValueString)
    : undefined

  const closeDateMap: { [key: string]: number | string } = {
    'A day': 1,
    'A week': 7,
    '30 days': 30,
    'This year': daysLeftInTheYear,
  }
  const NEVER = 'Never'
  if (outcomeType == 'POLL') {
    closeDateMap['Never'] = NEVER
  }
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
    ante <= balance &&
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
    isValidMultipleChoice

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
      if (!isValidQuestion) {
        setErrorText('Question must have text')
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

  function setCloseDateInDays(days: number) {
    const newCloseDate = dayjs().add(days, 'day').format('YYYY-MM-DD')
    setCloseDate(newCloseDate)
  }

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
      const newContract = (await createMarket(createProps)) as Contract

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
  const [toggleVisibility, setToggleVisibility] =
    useState<ContractVisibilityType>('public')
  useEffect(() => {
    if (selectedGroups.some((g) => g.privacyStatus == 'private')) {
      setVisibility('private')
      setPrivacy('private')
    } else {
      setVisibility(toggleVisibility)
      setPrivacy('non-private')
    }
  }, [selectedGroups?.length, toggleVisibility])

  const finishedTypingQuestion = async () => {
    const trimmed = question.trim()
    if (trimmed === '') {
      setHasChosenCategory(false)
      return
    }
    if (
      trimmed.length == 0 ||
      params?.groupIds?.length ||
      trimmed === categorizedQuestion ||
      hasChosenCategory
    )
      return
    setCategorizedQuestion(trimmed)
    try {
      const { groups } = await getSimilarGroupsToContract({ question })
      setSelectedGroups(groups)
    } catch (e) {
      console.error('error getting similar groups', e)
    }
  }

  const [fundsModalOpen, setFundsModalOpen] = useState(false)

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
              inputClassName="w-full max-w-none"
              minimumAmount={MINIMUM_BOUNTY}
              amount={bountyAmount}
              onChange={(newAmount) => setBountyAmount(newAmount)}
              error={bountyError}
              setError={setBountyError}
              sliderOptions={{ show: true, wrap: false }}
              customRange={{ rangeMax: 500 }}
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
        <Col>
          <Col className="mb-2 items-start">
            <label className="gap-2 px-1 py-2">
              <span className="mb-1">Range </span>
              <InfoTooltip text="The lower and higher bounds of the numeric range. Choose bounds the value could reasonably be expected to hit." />
            </label>

            <Row className="gap-2">
              <Input
                type="number"
                className="w-32"
                placeholder="LOW"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setMinString(e.target.value)}
                min={Number.MIN_SAFE_INTEGER}
                max={Number.MAX_SAFE_INTEGER}
                disabled={submitState === 'LOADING'}
                value={minString ?? ''}
              />
              <Input
                type="number"
                className="w-32"
                placeholder="HIGH"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setMaxString(e.target.value)}
                min={Number.MIN_SAFE_INTEGER}
                max={Number.MAX_SAFE_INTEGER}
                disabled={submitState === 'LOADING'}
                value={maxString}
              />
            </Row>

            <Checkbox
              className="my-2 text-sm"
              label="Log scale"
              checked={isLogScale}
              toggle={() => setIsLogScale(!isLogScale)}
              disabled={submitState === 'LOADING'}
            />

            {min !== undefined && max !== undefined && min >= max && (
              <div className="text-scarlet-500 mb-2 mt-2 text-sm">
                The maximum value must be greater than the minimum.
              </div>
            )}
          </Col>

          <div className="mb-2 flex flex-col items-start">
            <label className="gap-2 px-1 py-2">
              <span className="mb-1">Initial value </span>
              <InfoTooltip text="The starting value for this question. Should be in between min and max values." />
            </label>

            <Row className="gap-2">
              <Input
                type="number"
                placeholder="Initial value"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setInitialValueString(e.target.value)}
                max={Number.MAX_SAFE_INTEGER}
                disabled={submitState === 'LOADING'}
                value={initialValueString ?? ''}
              />
            </Row>

            {initialValue !== undefined &&
              min !== undefined &&
              max !== undefined &&
              min < max &&
              (initialValue <= min || initialValue >= max) && (
                <div className="text-scarlet-500 mb-2 mt-2 text-sm">
                  Initial value must be in between {min} and {max}.{' '}
                </div>
              )}
          </div>
        </Col>
      )}

      <Col className="gap-3">
        <span className="px-1">
          Add topics{' '}
          <InfoTooltip text="Question will be displayed alongside the other questions in the topic." />
        </span>
        {selectedGroups.length > 0 && (
          <Row className={'flex-wrap gap-2'}>
            {selectedGroups.map((group) => (
              <TopicTag
                location={'create page'}
                key={group.id}
                topic={group}
                isPrivate={group.privacyStatus === 'private'}
                className="bg-ink-100"
              >
                <button
                  onClick={() => {
                    const cleared = selectedGroups.filter(
                      (g) => g.id !== group.id
                    )
                    setSelectedGroups(cleared)
                    if (question !== '') setHasChosenCategory(true)
                  }}
                >
                  <XIcon className="hover:text-ink-700 text-ink-400 ml-1 h-4 w-4" />
                </button>
              </TopicTag>
            ))}
          </Row>
        )}
        <TopicSelector
          setSelectedGroup={(group) => {
            if (
              (selectedGroups.length > 0 &&
                group.privacyStatus === 'private') ||
              (selectedGroups.length > 0 &&
                selectedGroups.some((g) => g.privacyStatus === 'private'))
            ) {
              toast(
                `Questions are only allowed one category if the category is private.`,
                { icon: '🚫' }
              )
              return
            }
            setSelectedGroups((groups) =>
              uniqBy([...(groups ?? []), group], 'id')
            )
            setHasChosenCategory(true)
          }}
          ignoreGroupIds={selectedGroups.map((g) => g.id)}
          newContract={true}
        />
      </Col>

      <Col className="items-start gap-3">
        <label className="px-1">
          <span>Description</span>
        </label>
        <TextEditor editor={editor} />
      </Col>

      {outcomeType !== 'STONK' && outcomeType !== 'BOUNTIED_QUESTION' && (
        <Col className="items-start">
          <label className="mb-1 gap-2 px-1 py-2">
            <span>
              {outcomeType == 'POLL' ? 'Poll' : 'Question'} closes in{' '}
            </span>
            <InfoTooltip
              text={
                outcomeType == 'POLL'
                  ? 'Voting on this poll will be halted and resolve to the most voted option'
                  : 'Trading will be halted after this time (local timezone).'
              }
            />
          </label>
          <Row className={'w-full items-center gap-2'}>
            <ChoicesToggleGroup
              currentChoice={
                !closeDate
                  ? NEVER
                  : dayjs(`${closeDate}T23:59`).diff(dayjs(), 'day')
              }
              setChoice={(choice) => {
                if (choice == NEVER) {
                  setNeverCloses(true)
                  setCloseDate(undefined)
                } else {
                  setNeverCloses(false)
                  setCloseDateInDays(choice as number)
                }

                if (!closeHoursMinutes) {
                  setCloseHoursMinutes(initTime)
                }
              }}
              choicesMap={closeDateMap}
              disabled={submitState === 'LOADING'}
              className={clsx(
                'col-span-4 sm:col-span-2',
                outcomeType == 'POLL' ? 'text-xs sm:text-sm' : ''
              )}
            />
          </Row>
          {!neverCloses && (
            <Row className="mt-4 gap-2">
              <Input
                type={'date'}
                className="dark:date-range-input-white"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  setCloseDate(e.target.value)
                  if (!closeHoursMinutes) {
                    setCloseHoursMinutes(initTime)
                  }
                }}
                min={dayjs().format('YYYY-MM-DD')}
                max="9999-12-31"
                disabled={submitState === 'LOADING'}
                value={closeDate}
              />
              {/*<Input*/}
              {/*  type={'time'}*/}
              {/* className="dark:date-range-input-white"*/}
              {/*  onClick={(e) => e.stopPropagation()}*/}
              {/*  onChange={(e) => setCloseHoursMinutes(e.target.value)}*/}
              {/*  min={'00:00'}*/}
              {/*  disabled={isSubmitting}*/}
              {/*  value={closeHoursMinutes}*/}
              {/*/>*/}
            </Row>
          )}
        </Col>
      )}
      {visibility != 'private' && (
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
            on={toggleVisibility === 'public'}
            setOn={(on) => {
              setToggleVisibility(on ? 'public' : 'unlisted')
            }}
          />
        </Row>
      )}
      <Col className="items-start">
        <label className="mb-1 gap-2 px-1 py-2">
          <span>Cost </span>
          <InfoTooltip
            text={
              outcomeType == 'BOUNTIED_QUESTION'
                ? 'Your bounty. This amount is put upfront.'
                : outcomeType == 'POLL'
                ? 'Cost to create your poll.'
                : `Cost to create your question. This amount is used to subsidize predictions.`
            }
          />
        </label>

        <div className="text-ink-700 pl-1 text-sm">
          {amountSuppliedByUser === 0 ? (
            <span className="text-teal-500">FREE </span>
          ) : outcomeType !== 'BOUNTIED_QUESTION' && outcomeType !== 'POLL' ? (
            <>
              {formatMoney(amountSuppliedByUser)}
              {visibility === 'public' && (
                <span>
                  {' '}
                  or <span className=" text-teal-500">FREE </span>
                  if you get{' '}
                  {isMulti
                    ? Math.ceil(
                        amountSuppliedByUser / UNIQUE_ANSWER_BETTOR_BONUS_AMOUNT
                      )
                    : amountSuppliedByUser / UNIQUE_BETTOR_BONUS_AMOUNT}
                  + participants{' '}
                  <InfoTooltip
                    text={
                      isMulti
                        ? `You'll earn a bonus of ${formatMoney(
                            UNIQUE_ANSWER_BETTOR_BONUS_AMOUNT
                          )} for each unique trader you get on each answer.`
                        : `You'll earn a bonus of ${formatMoney(
                            UNIQUE_BETTOR_BONUS_AMOUNT
                          )} for each unique trader you get on your question.`
                    }
                  />
                </span>
              )}
            </>
          ) : (
            <span>
              {amountSuppliedByUser
                ? formatMoney(amountSuppliedByUser)
                : `${ENV_CONFIG.moneyMoniker} --`}
            </span>
          )}
        </div>
        <div className="text-ink-500 pl-1"></div>

        {ante > balance && (
          <div className="mb-2 mr-auto mt-2 self-center whitespace-nowrap text-xs font-medium tracking-wide">
            <span className="text-scarlet-500 mr-2">Insufficient balance</span>
            <Button
              size="xs"
              color="green"
              onClick={() => setFundsModalOpen(true)}
            >
              Get {ENV_CONFIG.moneyMoniker}
            </Button>
            <AddFundsModal open={fundsModalOpen} setOpen={setFundsModalOpen} />
          </div>
        )}
      </Col>

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

// get days from today until the end of this year:
const daysLeftInTheYear = dayjs().endOf('year').diff(dayjs(), 'day')

// waiting for supabase logic

export const LOADING_PING_INTERVAL = 200

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

async function waitForSupabaseContract(contract: Contract) {
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
    `We created your market, but it's taking a while to appear. Check this link in a minute: ${contractUrl(
      contract
    )}`
  )
}
