import { ExternalLinkIcon } from '@heroicons/react/outline'
import dayjs from 'dayjs'
import router from 'next/router'
import { useEffect, useState } from 'react'

import {
  Contract,
  MAX_QUESTION_LENGTH,
  OutcomeType,
  Visibility,
} from 'common/contract'
import { UNIQUE_BETTOR_BONUS_AMOUNT } from 'common/economy'
import { ENV_CONFIG } from 'common/envs/constants'
import { groupPath } from 'common/group'
import { formatMoney } from 'common/util/format'
import { MINUTE_MS } from 'common/util/time'
import { AddFundsModal } from 'web/components/add-funds-modal'
import { MultipleChoiceAnswers } from 'web/components/answers/multiple-choice-answers'
import { Button } from 'web/components/buttons/button'
import { GroupSelector } from 'web/components/groups/group-selector'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { Checkbox } from 'web/components/widgets/checkbox'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { TextEditor } from 'web/components/widgets/editor'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { Input } from 'web/components/widgets/input'
import ShortToggle from 'web/components/widgets/short-toggle'
import { QfExplainer } from '../contract/qf-overview'

import { generateJSON } from '@tiptap/core'
import clsx from 'clsx'
import { MAX_DESCRIPTION_LENGTH, NON_BETTING_OUTCOMES } from 'common/contract'
import { getAnte } from 'common/economy'
import { Group } from 'common/group'
import { STONK_NO, STONK_YES } from 'common/stonk'
import { User } from 'common/user'
import { removeUndefinedProps } from 'common/util/object'
import { extensions } from 'common/util/parse'
import { useTextEditor } from 'web/components/widgets/editor'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { createMarket } from 'web/lib/firebase/api'
import { track } from 'web/lib/service/analytics'
import { getGroup } from 'web/lib/supabase/group'
import { safeLocalStorage } from 'web/lib/util/local'
import { VisibilityTheme } from 'web/pages/create'
import WaitingForSupabaseButton from '../contract/waiting-for-supabase-button'
import { Col } from '../layout/col'
import { BuyAmountInput } from '../widgets/amount-input'
import { getContractTypeThingFromValue } from './create-contract-types'
import { ContractVisibilityType, NewQuestionParams } from './new-contract-panel'

export function ContractParamsForm(props: {
  outcomeType: OutcomeType
  creator: User
  setPrivacy: (theme: VisibilityTheme) => void
  fromGroup?: boolean
  params?: NewQuestionParams
}) {
  const { outcomeType, creator, setPrivacy, fromGroup, params } = props
  const paramsKey = params?.q ?? ''

  const [minString, setMinString] = usePersistentLocalState(
    params?.min ?? '',
    'new-min' + paramsKey
  )
  const [maxString, setMaxString] = usePersistentLocalState(
    params?.max ?? '',
    'new-max' + paramsKey
  )
  const [isLogScale, setIsLogScale] = usePersistentLocalState<boolean>(
    !!params?.isLogScale,
    'new-is-log-scale' + paramsKey
  )

  const [initialValueString, setInitialValueString] = usePersistentLocalState(
    params?.initValue,
    'new-init-value' + paramsKey
  )
  const [visibility, setVisibility] = usePersistentLocalState<Visibility>(
    (params?.visibility as Visibility) ?? 'public',
    `new-visibility${'-' + params?.groupId ?? ''}`
  )
  const [newContract, setNewContract] = useState<Contract | undefined>(
    undefined
  )

  const paramAnswers = []
  let i = 0
  while (params && (params as any)[`a${i}`]) {
    paramAnswers.push((params as any)[`a${i}`])
    i++
  }
  // for multiple choice, init to 2 empty answers
  const [answers, setAnswers] = usePersistentLocalState(
    paramAnswers.length ? paramAnswers : ['', ''],
    'new-answers' + paramsKey
  )

  const [question, setQuestion] = usePersistentLocalState(
    '',
    'new-question' + paramsKey
  )
  useEffect(() => {
    if (params?.q) setQuestion(params?.q ?? '')
  }, [params?.q])

  useEffect(() => {
    if (params?.groupId) {
      getGroup(params?.groupId).then((group) => {
        if (group) {
          setSelectedGroup(group)
        }
      })
    }
  }, [creator.id, params?.groupId])

  const ante = getAnte(outcomeType, answers.length, visibility === 'private')

  // If params.closeTime is set, extract out the specified date and time
  // By default, close the question a week from today
  const weekFromToday = dayjs().add(7, 'day').format('YYYY-MM-DD')
  const timeInMs = Number(params?.closeTime ?? 0)
  const initDate = timeInMs
    ? dayjs(timeInMs).format('YYYY-MM-DD')
    : weekFromToday
  const initTime = timeInMs ? dayjs(timeInMs).format('HH:mm') : '23:59'

  const [closeDate, setCloseDate] = usePersistentLocalState<undefined | string>(
    timeInMs ? initDate : undefined,
    'now-close-date' + paramsKey
  )
  const [closeHoursMinutes, setCloseHoursMinutes] = usePersistentLocalState<
    string | undefined
  >(timeInMs ? initTime : undefined, 'now-close-time' + paramsKey)

  const [selectedGroup, setSelectedGroup] = usePersistentLocalState<
    Group | undefined
  >(undefined, 'new-selected-group' + paramsKey)

  const [bountyAmount, setBountyAmount] = usePersistentLocalState<
    number | undefined
  >(50, 'new-bounty' + paramsKey)

  const closeTime = closeDate
    ? dayjs(`${closeDate}T${closeHoursMinutes}`).valueOf()
    : undefined

  const balance = creator.balance || 0

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

  const NEVER_IN_DAYS = 30 * 12 * 1000 // ~1000 years
  if (outcomeType == 'POLL') {
    closeDateMap['Never'] = NEVER_IN_DAYS
  }
  const [neverCloses, setNeverCloses] = useState(false)

  useEffect(() => {
    if (outcomeType === 'STONK' || NON_BETTING_OUTCOMES.includes(outcomeType)) {
      setCloseDate(dayjs().add(1000, 'year').format('YYYY-MM-DD'))
      setCloseHoursMinutes('23:59')

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
    }
    if (outcomeType === 'POLL') {
      setCloseDateInDays(NEVER_IN_DAYS)
      setNeverCloses(true)
    }
  }, [outcomeType])

  const isValidMultipleChoice = answers.every(
    (answer) => answer.trim().length > 0
  )

  const isValid =
    question.length > 0 &&
    ante !== undefined &&
    ante !== null &&
    ante <= balance &&
    // closeTime must be in the future
    (closeTime ?? Infinity) > Date.now() &&
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
    ((outcomeType !== 'MULTIPLE_CHOICE' && outcomeType !== 'POLL') ||
      isValidMultipleChoice)

  const [errorText, setErrorText] = useState<string>('')
  useEffect(() => {
    setErrorText('')
  }, [isValid])

  const editor = useTextEditor({
    key: 'create market' + paramsKey,
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
    editor?.commands.clearContent(true)
    safeLocalStorage?.removeItem(`text create market`)
    setQuestion('')
    setCloseDate(undefined)
    setCloseHoursMinutes(undefined)
    setSelectedGroup(undefined)
    setVisibility((params?.visibility as Visibility) ?? 'public')
    setAnswers(['', ''])
    setMinString('')
    setMaxString('')
    setInitialValueString('')
    setIsLogScale(false)
    setBountyAmount(50)
  }

  const [isSubmitting, setIsSubmitting] = useState(false)

  async function submit() {
    if (!isValid) return
    setIsSubmitting(true)
    try {
      const newContract = (await createMarket(
        removeUndefinedProps({
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
          answers,
          groupId: selectedGroup?.id,
          visibility,
          utcOffset: new Date().getTimezoneOffset(),
          totalBounty: bountyAmount,
        })
      )) as Contract

      setNewContract(newContract)
      resetProperties()

      track('create market', {
        slug: newContract.slug,
        selectedGroup: selectedGroup?.id,
        outcomeType,
      })
    } catch (e) {
      console.error('error creating contract', e)
      setErrorText((e as any).message || 'Error creating contract')
      setIsSubmitting(false)
    }
  }
  const [bountyError, setBountyError] = useState<string | undefined>(undefined)
  const [toggleVisibility, setToggleVisibility] =
    useState<ContractVisibilityType>('public')
  useEffect(() => {
    if (selectedGroup?.privacyStatus == 'private') {
      setVisibility('private')
      setPrivacy('private')
    } else {
      setVisibility(toggleVisibility)
      setPrivacy('non-private')
    }
  }, [selectedGroup?.privacyStatus, toggleVisibility])

  const [fundsModalOpen, setFundsModalOpen] = useState(false)

  const isMulti =
    outcomeType === 'MULTIPLE_CHOICE' || outcomeType === 'FREE_RESPONSE'
  return (
    <>
      <Col>
        <div className="flex w-full flex-col">
          <label className="px-1 pt-2 pb-3">
            Question<span className={'text-scarlet-500'}>*</span>
          </label>

          <ExpandingInput
            placeholder={getContractTypeThingFromValue('example', outcomeType)}
            autoFocus
            maxLength={MAX_QUESTION_LENGTH}
            value={question}
            onChange={(e) => setQuestion(e.target.value || '')}
          />
        </div>
        <Spacer h={6} />
        <div className="mb-1 flex flex-col items-start gap-1">
          <label className="gap-2 px-1 py-2">
            <span className="mb-1">Description</span>
          </label>
          <TextEditor editor={editor} />
        </div>
      </Col>
      {outcomeType === 'STONK' && (
        <div className="text-primary-500 mt-1 ml-1 text-sm">
          Tradeable shares of a stock based on sentiment. Never resolves.
        </div>
      )}
      {outcomeType === 'FREE_RESPONSE' && (
        <div className="text-primary-500 mt-1 ml-1 text-sm">
          Users can submit their own answers to this question.
        </div>
      )}
      {outcomeType === 'PSEUDO_NUMERIC' && (
        <div className="text-primary-500 mt-1 ml-1 text-sm">
          Predict the value of a number.
        </div>
      )}
      <Spacer h={2} />
      {outcomeType === 'QUADRATIC_FUNDING' && <QfExplainer />}
      <Spacer h={4} />
      {(outcomeType === 'MULTIPLE_CHOICE' || outcomeType == 'POLL') && (
        <MultipleChoiceAnswers
          answers={answers}
          setAnswers={setAnswers}
          placeholder={
            outcomeType == 'MULTIPLE_CHOICE' ? 'Type your answer..' : undefined
          }
        />
      )}
      {outcomeType === 'PSEUDO_NUMERIC' && (
        <>
          <div className="mb-2 flex flex-col items-start">
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
                disabled={isSubmitting}
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
                disabled={isSubmitting}
                value={maxString}
              />
            </Row>

            <Checkbox
              className="my-2 text-sm"
              label="Log scale"
              checked={isLogScale}
              toggle={() => setIsLogScale(!isLogScale)}
              disabled={isSubmitting}
            />

            {min !== undefined && max !== undefined && min >= max && (
              <div className="text-scarlet-500 mt-2 mb-2 text-sm">
                The maximum value must be greater than the minimum.
              </div>
            )}
          </div>
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
                disabled={isSubmitting}
                value={initialValueString ?? ''}
              />
            </Row>

            {initialValue !== undefined &&
              min !== undefined &&
              max !== undefined &&
              min < max &&
              (initialValue <= min || initialValue >= max) && (
                <div className="text-scarlet-500 mt-2 mb-2 text-sm">
                  Initial value must be in between {min} and {max}.{' '}
                </div>
              )}
          </div>
        </>
      )}
      {outcomeType == 'BOUNTIED_QUESTION' && (
        <>
          <label className="gap-2 px-1 py-2">
            <span className="mb-1 mr-1">Bounty</span>
            <InfoTooltip text="The award you give good answers. You can divide this amongst answers however you'd like." />
          </label>
          <BuyAmountInput
            inputClassName="w-full max-w-none"
            minimumAmount={5}
            amount={bountyAmount}
            onChange={(newAmount) => setBountyAmount(newAmount)}
            error={bountyError}
            setError={setBountyError}
            sliderOptions={{ show: true, wrap: false }}
            customRange={{ rangeMax: 500 }}
          />
          <Spacer h={6} />
        </>
      )}
      {!fromGroup && (
        <>
          <Row className={'items-end gap-x-2'}>
            <GroupSelector
              selectedGroup={selectedGroup}
              setSelectedGroup={setSelectedGroup}
              options={{ showSelector: true, showLabel: true }}
              isContractCreator={true}
              newContract={true}
            />
            {selectedGroup && (
              <a target="_blank" href={groupPath(selectedGroup.slug)}>
                <ExternalLinkIcon className=" text-ink-500 ml-1 mb-3 h-5 w-5" />
              </a>
            )}
          </Row>
          <Spacer h={6} />
        </>
      )}
      {outcomeType !== 'STONK' && outcomeType !== 'BOUNTIED_QUESTION' && (
        <div className="mb-1 flex flex-col items-start">
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
              currentChoice={dayjs(`${closeDate}T23:59`).diff(dayjs(), 'day')}
              setChoice={(choice) => {
                if (choice == NEVER_IN_DAYS) {
                  setNeverCloses(true)
                } else {
                  setNeverCloses(false)
                }
                setCloseDateInDays(choice as number)

                if (!closeHoursMinutes) {
                  setCloseHoursMinutes(initTime)
                }
              }}
              choicesMap={closeDateMap}
              disabled={isSubmitting}
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
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  setCloseDate(e.target.value)
                  if (!closeHoursMinutes) {
                    setCloseHoursMinutes(initTime)
                  }
                }}
                min={Math.round(Date.now() / MINUTE_MS) * MINUTE_MS}
                disabled={isSubmitting}
                value={closeDate}
              />
              <Input
                type={'time'}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setCloseHoursMinutes(e.target.value)}
                min={'00:00'}
                disabled={isSubmitting}
                value={closeHoursMinutes}
              />
            </Row>
          )}
        </div>
      )}
      {visibility != 'private' && (
        <>
          <Spacer h={6} />
          <Row className="items-center gap-2">
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
        </>
      )}
      <Spacer h={6} />
      <span className={'text-error'}>{errorText}</span>
      <Row className="items-end justify-between">
        <div className="mb-1 flex flex-col items-start">
          <label className="mb-1 gap-2 px-1 py-2">
            <span>Cost </span>
            <InfoTooltip
              text={
                outcomeType == 'BOUNTIED_QUESTION'
                  ? 'Your bounty. This amount is put upfront.'
                  : `Cost to create your question. This amount is used to subsidize predictions.`
              }
            />
          </label>

          <div className="text-ink-700 pl-1 text-sm">
            {outcomeType !== 'BOUNTIED_QUESTION' && <>{formatMoney(ante)}</>}
            {outcomeType !== 'BOUNTIED_QUESTION' && visibility === 'public' && (
              <span>
                {' '}
                or <span className=" text-teal-500">FREE </span>
                if you get{' '}
                {isMulti
                  ? ante / (UNIQUE_BETTOR_BONUS_AMOUNT / 2)
                  : ante / UNIQUE_BETTOR_BONUS_AMOUNT}
                + participants{' '}
                <InfoTooltip
                  text={
                    isMulti
                      ? `You'll earn a bonus of ${formatMoney(
                          Math.ceil(UNIQUE_BETTOR_BONUS_AMOUNT / 2)
                        )} for each unique trader you get on each answer.`
                      : `You'll earn a bonus of ${formatMoney(
                          UNIQUE_BETTOR_BONUS_AMOUNT
                        )} for each unique trader you get on your question.`
                  }
                />
              </span>
            )}
            {outcomeType == 'BOUNTIED_QUESTION' && (
              <span>
                {bountyAmount
                  ? formatMoney(bountyAmount)
                  : `${ENV_CONFIG.moneyMoniker} --`}
              </span>
            )}
          </div>
          <div className="text-ink-500 pl-1"></div>

          {ante > balance && (
            <div className="mb-2 mt-2 mr-auto self-center whitespace-nowrap text-xs font-medium tracking-wide">
              <span className="text-scarlet-500 mr-2">
                Insufficient balance
              </span>
              <Button
                size="xs"
                color="green"
                onClick={() => setFundsModalOpen(true)}
              >
                Get {ENV_CONFIG.moneyMoniker}
              </Button>
              <AddFundsModal
                open={fundsModalOpen}
                setOpen={setFundsModalOpen}
              />
            </div>
          )}
        </div>
      </Row>
      <Spacer h={6} />
      <Row className="w-full justify-center">
        {newContract && (
          <WaitingForSupabaseButton
            contractId={newContract.id}
            router={router}
          />
        )}
        {!newContract && (
          <Button
            className="w-full"
            type="submit"
            color="indigo"
            size="xl"
            loading={isSubmitting}
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
            {isSubmitting ? 'Creating...' : 'Create question'}
          </Button>
        )}
      </Row>
      <Spacer h={6} />
    </>
  )
}

// get days from today until the end of this year:
const daysLeftInTheYear = dayjs().endOf('year').diff(dayjs(), 'day')
