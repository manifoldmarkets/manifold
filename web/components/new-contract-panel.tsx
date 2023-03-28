import { ExternalLinkIcon } from '@heroicons/react/outline'
import { ChevronDownIcon } from '@heroicons/react/solid'
import dayjs from 'dayjs'
import router from 'next/router'
import { useEffect, useState } from 'react'

import clsx from 'clsx'
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_QUESTION_LENGTH,
  outcomeType,
  visibility,
} from 'common/contract'
import { ANTES, UNIQUE_BETTOR_BONUS_AMOUNT } from 'common/economy'
import { ENV, ENV_CONFIG } from 'common/envs/constants'
import { Group, groupPath } from 'common/group'
import { User } from 'common/user'
import { formatMoney } from 'common/util/format'
import { removeUndefinedProps } from 'common/util/object'
import { MINUTE_MS } from 'common/util/time'
import { AddFundsModal } from 'web/components/add-funds-modal'
import { MultipleChoiceAnswers } from 'web/components/answers/multiple-choice-answers'
import { Button } from 'web/components/buttons/button'
import { GroupSelector } from 'web/components/groups/group-selector'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { Checkbox } from 'web/components/widgets/checkbox'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { TextEditor, useTextEditor } from 'web/components/widgets/editor'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { Input } from 'web/components/widgets/input'
import ShortToggle from 'web/components/widgets/short-toggle'
import { createMarket } from 'web/lib/firebase/api'
import { getGroup } from 'web/lib/firebase/groups'
import { track } from 'web/lib/service/analytics'
import { safeLocalStorage } from 'web/lib/util/local'
import { QfExplainer } from './contract/qf-overview'

export type NewQuestionParams = {
  groupId?: string
  q: string
  type: string
  description: string
  closeTime: string
  outcomeType: string
  visibility: string
  // Params for PSEUDO_NUMERIC outcomeType
  min?: string
  max?: string
  isLogScale?: string
  initValue?: string
}

// Allow user to create a new contract
export function NewContractPanel(props: {
  creator: User
  params?: NewQuestionParams
  fromGroup?: boolean
  className?: string
}) {
  const { creator, params, fromGroup, className } = props
  const { groupId, initValue } = params ?? {}
  const [outcomeType, setOutcomeType] = useState<outcomeType>(
    (params?.outcomeType as outcomeType) ?? 'BINARY'
  )
  const [initialProb] = useState(50)
  const [minString, setMinString] = useState(params?.min ?? '')
  const [maxString, setMaxString] = useState(params?.max ?? '')
  const [isLogScale, setIsLogScale] = useState<boolean>(!!params?.isLogScale)
  const [initialValueString, setInitialValueString] = useState(initValue)
  const [visibility, setVisibility] = useState<visibility>(
    (params?.visibility as visibility) ?? 'public'
  )
  // for multiple choice, init to 3 empty answers
  const [answers, setAnswers] = useState(['', '', ''])

  const [question, setQuestion] = useState('')
  useEffect(() => {
    setQuestion(params?.q ?? '')
  }, [params?.q])

  useEffect(() => {
    if (groupId)
      getGroup(groupId).then((group) => {
        if (group) {
          setSelectedGroup(group)
        }
      })
  }, [creator.id, groupId])

  const ante = ANTES[outcomeType]

  // If params.closeTime is set, extract out the specified date and time
  // By default, close the market a week from today
  const weekFromToday = dayjs().add(7, 'day').format('YYYY-MM-DD')
  const timeInMs = Number(params?.closeTime ?? 0)
  const initDate = timeInMs
    ? dayjs(timeInMs).format('YYYY-MM-DD')
    : weekFromToday
  const initTime = timeInMs ? dayjs(timeInMs).format('HH:mm') : '23:59'
  const [closeDate, setCloseDate] = useState<undefined | string>(
    timeInMs ? initDate : undefined
  )
  const [closeHoursMinutes, setCloseHoursMinutes] = useState<
    string | undefined
  >(timeInMs ? initTime : undefined)

  const [marketInfoText, setMarketInfoText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<Group | undefined>(
    undefined
  )

  const [fundsModalOpen, setFundsModalOpen] = useState(false)

  const closeTime = closeDate
    ? dayjs(`${closeDate}T${closeHoursMinutes}`).valueOf()
    : undefined

  const balance = creator.balance || 0

  const min = minString ? parseFloat(minString) : undefined
  const max = maxString ? parseFloat(maxString) : undefined
  const initialValue = initialValueString
    ? parseFloat(initialValueString)
    : undefined

  // get days from today until the end of this year:
  const daysLeftInTheYear = dayjs().endOf('year').diff(dayjs(), 'day')

  const isValidMultipleChoice = answers.every(
    (answer) => answer.trim().length > 0
  )

  const isValid =
    (outcomeType === 'BINARY' ? initialProb >= 5 && initialProb <= 95 : true) &&
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
    (outcomeType !== 'MULTIPLE_CHOICE' || isValidMultipleChoice)

  const [errorText, setErrorText] = useState<string>('')
  useEffect(() => {
    setErrorText('')
  }, [isValid])

  const descriptionPlaceholder =
    'Optional. Provide background info and market resolution criteria here.'

  const editor = useTextEditor({
    key: 'create market',
    max: MAX_DESCRIPTION_LENGTH,
    placeholder: descriptionPlaceholder,
    defaultValue: params?.description
      ? JSON.parse(params.description)
      : undefined,
  })

  function setCloseDateInDays(days: number) {
    const newCloseDate = dayjs().add(days, 'day').format('YYYY-MM-DD')
    setCloseDate(newCloseDate)
  }

  async function submit() {
    // TODO: Tell users why their contract is invalid
    if (!isValid) return
    setIsSubmitting(true)
    try {
      const result = await createMarket(
        removeUndefinedProps({
          question,
          outcomeType,
          description: editor?.getJSON(),
          initialProb,
          ante,
          closeTime,
          min,
          max,
          initialValue,
          isLogScale,
          answers,
          groupId: selectedGroup?.id,
          visibility,
        })
      )
      track('create market', {
        slug: result.slug,
        initialProb,
        selectedGroup: selectedGroup?.id,
        isFree: false,
      })
      editor?.commands.clearContent(true)
      // force clear save, because it can fail if editor unrenders
      safeLocalStorage?.removeItem(`text create market`)
      await router.push(`/loading/${result.id}`)
    } catch (e) {
      console.error('error creating contract', e, (e as any).details)
      setErrorText(
        JSON.stringify(
          (e as any).details || (e as any).message || 'Error creating contract'
        )
      )
      setIsSubmitting(false)
    }
  }

  const BONUS_OUTCOME_TYPES = [
    'BINARY',
    'FREE_RESPONSE',
    'MULTIPLE_CHOICE',
    'PSEUDO_NUMERIC',
  ]

  const [hideOptions, setHideOptions] = useState(true)

  return (
    <div className={clsx(className, 'text-ink-1000')}>
      <div className="flex w-full flex-col">
        <label className="px-1 pt-2 pb-3">
          Question<span className={'text-scarlet-500'}>*</span>
        </label>

        <ExpandingInput
          placeholder="e.g. Will the Democrats win the 2024 US presidential election?"
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
      <Spacer h={6} />
      {!fromGroup && visibility != 'private' && (
        <>
          <Row className={'items-end gap-x-2'}>
            <GroupSelector
              selectedGroup={selectedGroup}
              setSelectedGroup={setSelectedGroup}
              options={{ showSelector: true, showLabel: true }}
              isContractCreator={true}
            />
            {selectedGroup && (
              <a target="_blank" href={groupPath(selectedGroup.slug)}>
                <ExternalLinkIcon className=" text-ink-500 ml-1 mb-3 h-5 w-5" />
              </a>
            )}
          </Row>
        </>
      )}

      {hideOptions ? (
        <Row className="mt-4 justify-end">
          <Button color="gray-white" onClick={() => setHideOptions(false)}>
            <ChevronDownIcon className="h-5 w-5" />
            More options
          </Button>
        </Row>
      ) : (
        <>
          <Spacer h={6} />
          <label className="flex px-1 pt-2 pb-3">Answer type</label>
          <Row>
            <ChoicesToggleGroup
              currentChoice={outcomeType}
              setChoice={(choice) => {
                const text =
                  {
                    FREE_RESPONSE:
                      'Users can submit their own answers to this market.',
                    PSEUDO_NUMERIC:
                      '[EXPERIMENTAL] Predict the value of a number.',
                    CERT: '[EXPERIMENTAL] Tradeable shares of a stock.',
                    // QUADRATIC_FUNDING: '',
                    // '[EXPERIMENTAL] Radically fund projects. ',
                  }[choice] ?? ''
                setMarketInfoText(text)
                setOutcomeType(choice as outcomeType)
              }}
              choicesMap={{
                'Yes\xa0/ No': 'BINARY', // non-breaking space
                'Multi choice': 'MULTIPLE_CHOICE',
                'Free response': 'FREE_RESPONSE',
                Numeric: 'PSEUDO_NUMERIC',
                // 'Quadratic Funding': 'QUADRATIC_FUNDING',
                // Only show cert option in dev, for now
                ...(ENV !== 'PROD' ? { Cert: 'CERT' } : {}),
              }}
              disabled={isSubmitting}
              className={'col-span-4'}
            />
          </Row>
          {marketInfoText && (
            <div className="text-primary-700 mt-3 ml-1 text-sm">
              {marketInfoText}
            </div>
          )}
          <Spacer h={2} />
          {outcomeType === 'QUADRATIC_FUNDING' && <QfExplainer />}

          <Spacer h={4} />
          {outcomeType === 'MULTIPLE_CHOICE' && (
            <MultipleChoiceAnswers answers={answers} setAnswers={setAnswers} />
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
                  <InfoTooltip text="The starting value for this market. Should be in between min and max values." />
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
          <div className="mb-1 flex flex-col items-start">
            <label className="mb-1 gap-2 px-1 py-2">
              <span>Question closes in </span>
              <InfoTooltip text="Trading will be halted after this time (local timezone)." />
            </label>
            <Row className={'w-full items-center gap-2'}>
              <ChoicesToggleGroup
                currentChoice={dayjs(`${closeDate}T23:59`).diff(dayjs(), 'day')}
                setChoice={(choice) => {
                  setCloseDateInDays(choice as number)

                  if (!closeHoursMinutes) {
                    setCloseHoursMinutes(initTime)
                  }
                }}
                choicesMap={{
                  'A day': 1,
                  'A week': 7,
                  '30 days': 30,
                  'This year': daysLeftInTheYear,
                }}
                disabled={isSubmitting}
                className={'col-span-4 sm:col-span-2'}
              />
            </Row>
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
          </div>
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
                  on={visibility === 'public'}
                  setOn={(on) => setVisibility(on ? 'public' : 'unlisted')}
                />
              </Row>
            </>
          )}
          <Spacer h={6} />
        </>
      )}

      <span className={'text-error'}>{errorText}</span>
      <Row className="items-end justify-between">
        <div className="mb-1 flex flex-col items-start">
          <label className="mb-1 gap-2 px-1 py-2">
            <span>Cost </span>
            <InfoTooltip
              text={`Cost to create your question. This amount is used to subsidize predictions.`}
            />
          </label>

          <div className="text-ink-700 pl-1 text-sm">
            {formatMoney(ante)}
            {BONUS_OUTCOME_TYPES.includes(outcomeType) ? (
              <span>
                {' '}
                or <span className=" text-teal-500">FREE </span>
                if you get {ante / UNIQUE_BETTOR_BONUS_AMOUNT}+ participants{' '}
                <InfoTooltip
                  text={`You'll earn a bonus of ${formatMoney(
                    UNIQUE_BETTOR_BONUS_AMOUNT
                  )} for each unique trader you get on your market.`}
                />
              </span>
            ) : (
              <span className="text-red-500"> - no unique trader bonus</span>
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
        <Button
          className="w-full"
          type="submit"
          color="indigo"
          size="xl"
          loading={isSubmitting}
          disabled={!isValid || editor?.storage.upload.mutation.isLoading}
          onClick={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          {isSubmitting ? 'Creating...' : 'Create market'}
        </Button>
      </Row>

      <Spacer h={6} />
    </div>
  )
}
