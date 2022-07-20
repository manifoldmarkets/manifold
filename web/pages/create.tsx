import router, { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import dayjs from 'dayjs'
import Textarea from 'react-expanding-textarea'
import { Spacer } from 'web/components/layout/spacer'
import { useUser } from 'web/hooks/use-user'
import { Contract, contractPath } from 'web/lib/firebase/contracts'
import { createMarket } from 'web/lib/firebase/api'
import { FIXED_ANTE } from 'common/antes'
import { InfoTooltip } from 'web/components/info-tooltip'
import { Page } from 'web/components/page'
import { Row } from 'web/components/layout/row'
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_QUESTION_LENGTH,
  outcomeType,
} from 'common/contract'
import { formatMoney } from 'common/util/format'
import { removeUndefinedProps } from 'common/util/object'
import { ChoicesToggleGroup } from 'web/components/choices-toggle-group'
import { setContractGroupSlugs, getGroup } from 'web/lib/firebase/groups'
import { Group } from 'common/group'
import { useTracking } from 'web/hooks/use-tracking'
import { useWarnUnsavedChanges } from 'web/hooks/use-warn-unsaved-changes'
import { track } from 'web/lib/service/analytics'
import { GroupSelector } from 'web/components/groups/group-selector'
import { User } from 'common/user'
import { TextEditor, useTextEditor } from 'web/components/editor'
import { Checkbox } from 'web/components/checkbox'
import { redirectIfLoggedOut } from 'web/lib/firebase/server-auth'

export const getServerSideProps = redirectIfLoggedOut('/')

type NewQuestionParams = {
  groupId?: string
  q: string
  type: string
  description: string
  closeTime: string
  outcomeType: string
  // Params for PSEUDO_NUMERIC outcomeType
  min?: string
  max?: string
  isLogScale?: string
  initValue?: string
}

export default function Create() {
  useTracking('view create page')
  const router = useRouter()
  const params = router.query as NewQuestionParams
  // TODO: Not sure why Question is pulled out as its own component;
  // Maybe merge into newContract and then we don't need useEffect here.
  const [question, setQuestion] = useState('')
  useEffect(() => {
    setQuestion(params.q ?? '')
  }, [params.q])

  const creator = useUser()
  if (!router.isReady || !creator) return <div />

  return (
    <Page>
      <div className="mx-auto w-full max-w-2xl">
        <div className="rounded-lg px-6 py-4 sm:py-0">
          <form>
            <div className="form-control w-full">
              <label className="label">
                <span className="mb-1">
                  Question<span className={'text-red-700'}>*</span>
                </span>
              </label>

              <Textarea
                placeholder="e.g. Will the Democrats win the 2024 US presidential election?"
                className="input input-bordered resize-none"
                autoFocus
                maxLength={MAX_QUESTION_LENGTH}
                value={question}
                onChange={(e) => setQuestion(e.target.value || '')}
              />
            </div>
          </form>
          <Spacer h={6} />
          <NewContract question={question} params={params} creator={creator} />
        </div>
      </div>
    </Page>
  )
}

// Allow user to create a new contract
export function NewContract(props: {
  creator?: User | null
  question: string
  params?: NewQuestionParams
}) {
  const { creator, question, params } = props
  const { groupId, initValue } = params ?? {}
  const [outcomeType, setOutcomeType] = useState<outcomeType>(
    (params?.outcomeType as outcomeType) ?? 'BINARY'
  )
  const [initialProb] = useState(50)
  const [minString, setMinString] = useState(params?.min ?? '')
  const [maxString, setMaxString] = useState(params?.max ?? '')
  const [isLogScale, setIsLogScale] = useState<boolean>(!!params?.isLogScale)
  const [initialValueString, setInitialValueString] = useState(initValue)

  useEffect(() => {
    if (groupId && creator)
      getGroup(groupId).then((group) => {
        if (group && group.memberIds.includes(creator.id)) {
          setSelectedGroup(group)
          setShowGroupSelector(false)
        }
      })
  }, [creator, groupId])
  const [ante, _setAnte] = useState(FIXED_ANTE)

  // If params.closeTime is set, extract out the specified date and time
  // By default, close the market a week from today
  const weekFromToday = dayjs().add(7, 'day').format('YYYY-MM-DD')
  const timeInMs = Number(params?.closeTime ?? 0)
  const initDate = timeInMs
    ? dayjs(timeInMs).format('YYYY-MM-DD')
    : weekFromToday
  const initTime = timeInMs ? dayjs(timeInMs).format('HH:mm') : '23:59'
  const [closeDate, setCloseDate] = useState<undefined | string>(initDate)
  const [closeHoursMinutes, setCloseHoursMinutes] = useState<string>(initTime)

  const [marketInfoText, setMarketInfoText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<Group | undefined>(
    undefined
  )
  const [showGroupSelector, setShowGroupSelector] = useState(true)

  const closeTime = closeDate
    ? dayjs(`${closeDate}T${closeHoursMinutes}`).valueOf()
    : undefined

  const balance = creator?.balance || 0

  const min = minString ? parseFloat(minString) : undefined
  const max = maxString ? parseFloat(maxString) : undefined
  const initialValue = initialValueString
    ? parseFloat(initialValueString)
    : undefined

  // get days from today until the end of this year:
  const daysLeftInTheYear = dayjs().endOf('year').diff(dayjs(), 'day')

  const isValid =
    (outcomeType === 'BINARY' ? initialProb >= 5 && initialProb <= 95 : true) &&
    question.length > 0 &&
    ante !== undefined &&
    ante !== null &&
    ante <= balance &&
    // closeTime must be in the future
    closeTime &&
    closeTime > Date.now() &&
    (outcomeType !== 'PSEUDO_NUMERIC' ||
      (min !== undefined &&
        max !== undefined &&
        initialValue !== undefined &&
        isFinite(min) &&
        isFinite(max) &&
        min < max &&
        max - min > 0.01 &&
        min < initialValue &&
        initialValue < max))

  const descriptionPlaceholder =
    outcomeType === 'BINARY'
      ? `e.g. This question resolves to "YES" if they receive the majority of votes...`
      : `e.g. I will choose the answer according to...`

  const { editor, upload } = useTextEditor({
    max: MAX_DESCRIPTION_LENGTH,
    placeholder: descriptionPlaceholder,
    disabled: isSubmitting,
  })

  const isEditorFilled = editor != null && !editor.isEmpty
  useWarnUnsavedChanges(!isSubmitting && (Boolean(question) || isEditorFilled))

  function setCloseDateInDays(days: number) {
    const newCloseDate = dayjs().add(days, 'day').format('YYYY-MM-DD')
    setCloseDate(newCloseDate)
  }

  async function submit() {
    // TODO: Tell users why their contract is invalid
    if (!creator || !isValid) return
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
          groupId: selectedGroup?.id,
        })
      )
      track('create market', {
        slug: result.slug,
        initialProb,
        selectedGroup: selectedGroup?.id,
        isFree: false,
      })
      if (result && selectedGroup) {
        await setContractGroupSlugs(selectedGroup, result.id)
      }

      await router.push(contractPath(result as Contract))
    } catch (e) {
      console.error('error creating contract', e, (e as any).details)
      setIsSubmitting(false)
    }
  }

  if (!creator) return <></>

  return (
    <div>
      <label className="label">
        <span className="mb-1">Answer type</span>
      </label>
      <ChoicesToggleGroup
        currentChoice={outcomeType}
        setChoice={(choice) => {
          if (choice === 'FREE_RESPONSE')
            setMarketInfoText(
              'Users can submit their own answers to this market.'
            )
          else setMarketInfoText('')
          setOutcomeType(choice as 'BINARY' | 'FREE_RESPONSE')
        }}
        choicesMap={{
          'Yes / No': 'BINARY',
          'Free response': 'FREE_RESPONSE',
          Numeric: 'PSEUDO_NUMERIC',
        }}
        isSubmitting={isSubmitting}
        className={'col-span-4'}
      />
      {marketInfoText && (
        <div className="mt-3 ml-1 text-sm text-indigo-700">
          {marketInfoText}
        </div>
      )}

      <Spacer h={6} />

      {outcomeType === 'PSEUDO_NUMERIC' && (
        <>
          <div className="form-control mb-2 items-start">
            <label className="label gap-2">
              <span className="mb-1">Range</span>
              <InfoTooltip text="The minimum and maximum numbers across the numeric range." />
            </label>

            <Row className="gap-2">
              <input
                type="number"
                className="input input-bordered"
                placeholder="MIN"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setMinString(e.target.value)}
                min={Number.MIN_SAFE_INTEGER}
                max={Number.MAX_SAFE_INTEGER}
                disabled={isSubmitting}
                value={minString ?? ''}
              />
              <input
                type="number"
                className="input input-bordered"
                placeholder="MAX"
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
              <div className="mt-2 mb-2 text-sm text-red-500">
                The maximum value must be greater than the minimum.
              </div>
            )}
          </div>
          <div className="form-control mb-2 items-start">
            <label className="label gap-2">
              <span className="mb-1">Initial value</span>
              <InfoTooltip text="The starting value for this market. Should be in between min and max values." />
            </label>

            <Row className="gap-2">
              <input
                type="number"
                className="input input-bordered"
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
                <div className="mt-2 mb-2 text-sm text-red-500">
                  Initial value must be in between {min} and {max}.{' '}
                </div>
              )}
          </div>
        </>
      )}

      <div className={'mt-2'}>
        <GroupSelector
          selectedGroup={selectedGroup}
          setSelectedGroup={setSelectedGroup}
          creator={creator}
          showSelector={showGroupSelector}
        />
      </div>

      <Spacer h={6} />

      <div className="form-control mb-1 items-start">
        <label className="label mb-1 gap-2">
          <span>Question closes in</span>
          <InfoTooltip text="Betting will be halted after this time (local timezone)." />
        </label>
        <Row className={'w-full items-center gap-2'}>
          <ChoicesToggleGroup
            currentChoice={dayjs(`${closeDate}T23:59`).diff(dayjs(), 'day')}
            setChoice={(choice) => {
              setCloseDateInDays(choice as number)
            }}
            choicesMap={{
              'A day': 1,
              'A week': 7,
              '30 days': 30,
              'This year': daysLeftInTheYear,
            }}
            isSubmitting={isSubmitting}
            className={'col-span-4 sm:col-span-2'}
          />
        </Row>
        <Row>
          <input
            type={'date'}
            className="input input-bordered mt-4"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setCloseDate(e.target.value)}
            min={Date.now()}
            disabled={isSubmitting}
            value={closeDate}
          />
          <input
            type={'time'}
            className="input input-bordered mt-4 ml-2"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setCloseHoursMinutes(e.target.value)}
            min={'00:00'}
            disabled={isSubmitting}
            value={closeHoursMinutes}
          />
        </Row>
      </div>

      <Spacer h={6} />

      <div className="form-control mb-1 items-start gap-1">
        <label className="label gap-2">
          <span className="mb-1">Description</span>
          <InfoTooltip text="Optional. Describe how you will resolve this question." />
        </label>
        <TextEditor editor={editor} upload={upload} />
      </div>

      <Spacer h={6} />

      <Row className="items-end justify-between">
        <div className="form-control mb-1 items-start">
          <label className="label mb-1 gap-2">
            <span>Cost</span>
            <InfoTooltip
              text={`Cost to create your question. This amount is used to subsidize betting.`}
            />
          </label>

          <div className="label-text text-neutral pl-1">
            {formatMoney(ante)}
          </div>

          {ante > balance && (
            <div className="mb-2 mt-2 mr-auto self-center whitespace-nowrap text-xs font-medium tracking-wide">
              <span className="mr-2 text-red-500">Insufficient balance</span>
              <button
                className="btn btn-xs btn-primary"
                onClick={() => (window.location.href = '/add-funds')}
              >
                Get M$
              </button>
            </div>
          )}
        </div>

        <button
          type="submit"
          className={clsx(
            'btn btn-primary normal-case',
            isSubmitting && 'loading disabled'
          )}
          disabled={isSubmitting || !isValid || upload.isLoading}
          onClick={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          {isSubmitting ? 'Creating...' : 'Create question'}
        </button>
      </Row>
    </div>
  )
}
