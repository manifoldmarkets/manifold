import router, { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import dayjs from 'dayjs'
import Textarea from 'react-expanding-textarea'
import { Spacer } from 'web/components/layout/spacer'
import { useUser } from 'web/hooks/use-user'
import { Contract, contractPath } from 'web/lib/firebase/contracts'
import { createMarket } from 'web/lib/firebase/api-call'
import { FIXED_ANTE, MINIMUM_ANTE } from 'common/antes'
import { InfoTooltip } from 'web/components/info-tooltip'
import { Page } from 'web/components/page'
import { Row } from 'web/components/layout/row'
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_QUESTION_LENGTH,
  outcomeType,
} from 'common/contract'
import { formatMoney } from 'common/util/format'
import { useHasCreatedContractToday } from 'web/hooks/use-has-created-contract-today'
import { removeUndefinedProps } from 'common/util/object'
import { ChoicesToggleGroup } from 'web/components/choices-toggle-group'
import {
  CheckIcon,
  PlusCircleIcon,
  SelectorIcon,
} from '@heroicons/react/outline'
import { Combobox } from '@headlessui/react'
import {
  getGroup,
  listenForMemberGroups,
  updateGroup,
} from 'web/lib/firebase/groups'
import { Group } from 'common/group'
import { CreateGroupButton } from 'web/components/groups/create-group-button'
import { useTracking } from 'web/hooks/use-tracking'
import { useWarnUnsavedChanges } from 'web/hooks/use-warn-unsaved-changes'
import { track } from 'web/lib/service/analytics'

export default function Create() {
  const [question, setQuestion] = useState('')
  // get query params:
  const router = useRouter()
  const { groupId } = router.query as { groupId: string }
  useTracking('view create page')
  if (!router.isReady) return <div />

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
          <NewContract question={question} groupId={groupId} />
        </div>
      </div>
    </Page>
  )
}

// Allow user to create a new contract
export function NewContract(props: { question: string; groupId?: string }) {
  const { question, groupId } = props
  const creator = useUser()

  useEffect(() => {
    if (creator === null) router.push('/')
  }, [creator])

  const [outcomeType, setOutcomeType] = useState<outcomeType>('BINARY')
  const [initialProb] = useState(50)
  const [minString, setMinString] = useState('')
  const [maxString, setMaxString] = useState('')
  const [description, setDescription] = useState('')
  const [memberGroups, setMemberGroups] = useState<Group[]>([])
  // const [tagText, setTagText] = useState<string>(tag ?? '')
  // const tags = parseWordsAsTags(tagText)
  useEffect(() => {
    if (groupId && creator)
      getGroup(groupId).then((group) => {
        if (group && group.memberIds.includes(creator.id)) {
          setSelectedGroup(group)
          setShowGroupSelector(false)
        }
      })
    else if (creator) listenForMemberGroups(creator.id, setMemberGroups)
  }, [creator, groupId])
  const [ante, _setAnte] = useState(FIXED_ANTE)

  const mustWaitForDailyFreeMarketStatus = useHasCreatedContractToday(creator)
  const isFree =
    mustWaitForDailyFreeMarketStatus != 'loading' &&
    !mustWaitForDailyFreeMarketStatus

  // useEffect(() => {
  //   if (ante === null && creator) {
  //     const initialAnte = creator.balance < 100 ? MINIMUM_ANTE : 100
  //     setAnte(initialAnte)
  //   }
  // }, [ante, creator])

  // const [anteError, setAnteError] = useState<string | undefined>()
  // By default, close the market a week from today
  const weekFromToday = dayjs().add(7, 'day').format('YYYY-MM-DD')
  const [closeDate, setCloseDate] = useState<undefined | string>(weekFromToday)
  const [closeHoursMinutes, setCloseHoursMinutes] = useState<string>('23:59')
  const [marketInfoText, setMarketInfoText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedGroup, setSelectedGroup] = useState<Group | undefined>(
    undefined
  )
  const [showGroupSelector, setShowGroupSelector] = useState(true)

  const [isCreatingNewGroup, setIsCreatingNewGroup] = useState(false)
  const closeTime = closeDate
    ? dayjs(`${closeDate}T${closeHoursMinutes}`).valueOf()
    : undefined

  const balance = creator?.balance || 0

  const min = minString ? parseFloat(minString) : undefined
  const max = maxString ? parseFloat(maxString) : undefined
  // get days from today until the end of this year:
  const daysLeftInTheYear = dayjs().endOf('year').diff(dayjs(), 'day')

  const hasUnsavedChanges = !isSubmitting && Boolean(question || description)
  useWarnUnsavedChanges(hasUnsavedChanges)

  const isValid =
    (outcomeType === 'BINARY' ? initialProb >= 5 && initialProb <= 95 : true) &&
    question.length > 0 &&
    ante !== undefined &&
    ante !== null &&
    ante >= MINIMUM_ANTE &&
    (ante <= balance ||
      (mustWaitForDailyFreeMarketStatus != 'loading' &&
        !mustWaitForDailyFreeMarketStatus)) &&
    // closeTime must be in the future
    closeTime &&
    closeTime > Date.now() &&
    (outcomeType !== 'NUMERIC' ||
      (min !== undefined &&
        max !== undefined &&
        isFinite(min) &&
        isFinite(max) &&
        min < max &&
        max - min > 0.01))

  function setCloseDateInDays(days: number) {
    const newCloseDate = dayjs().add(days, 'day').format('YYYY-MM-DD')
    setCloseDate(newCloseDate)
  }

  async function submit() {
    // TODO: Tell users why their contract is invalid
    if (!creator || !isValid) return

    setIsSubmitting(true)
    // TODO: add contract id to the group contractIds
    try {
      const result = await createMarket(
        removeUndefinedProps({
          question,
          outcomeType,
          description,
          initialProb,
          ante,
          closeTime,
          min,
          max,
          groupId: selectedGroup?.id,
        })
      )
      track('create market', {
        slug: result.slug,
        initialProb,
        selectedGroup: selectedGroup?.id,
        isFree,
      })
      if (result && selectedGroup) {
        await updateGroup(selectedGroup, {
          contractIds: [...selectedGroup.contractIds, result.id],
        })
      }

      await router.push(contractPath(result as Contract))
    } catch (e) {
      console.log('error creating contract', e)
    }
  }

  const descriptionPlaceholder =
    outcomeType === 'BINARY'
      ? `e.g. This question resolves to "YES" if they receive the majority of votes...`
      : `e.g. I will choose the answer according to...`

  if (!creator) return <></>

  const filteredGroups =
    query === ''
      ? memberGroups
      : memberGroups.filter((group) => {
          return group.name.toLowerCase().includes(query.toLowerCase())
        })
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

      {outcomeType === 'NUMERIC' && (
        <div className="form-control items-start">
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
        </div>
      )}

      {showGroupSelector && (
        <div className="form-control items-start">
          <Combobox
            as="div"
            value={selectedGroup}
            onChange={setSelectedGroup}
            nullable={true}
          >
            <Combobox.Label className="label justify-start gap-2">
              Add to Group
              <InfoTooltip text="Question will be displayed alongside the other questions in the group and winnings will contribute to the group's leaderboard." />
            </Combobox.Label>
            <div className="relative mt-2">
              <Combobox.Input
                className="w-full rounded-md border border-gray-300 bg-white py-2 pl-3 pr-10 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
                onChange={(event) => setQuery(event.target.value)}
                displayValue={(group: Group) => group && group.name}
              />
              <Combobox.Button className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2 focus:outline-none">
                <SelectorIcon
                  className="h-5 w-5 text-gray-400"
                  aria-hidden="true"
                />
              </Combobox.Button>

              <Combobox.Options
                static={isCreatingNewGroup}
                className="absolute z-10 mt-1 max-h-60 w-full overflow-x-hidden rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm"
              >
                {filteredGroups.map((group: Group) => (
                  <Combobox.Option
                    key={group.id}
                    value={group}
                    className={({ active }) =>
                      clsx(
                        'relative h-12 cursor-pointer select-none py-2 pl-4 pr-9',
                        active ? 'bg-indigo-500 text-white' : 'text-gray-900'
                      )
                    }
                  >
                    {({ active, selected }) => (
                      <>
                        {selected && (
                          <span
                            className={clsx(
                              'absolute inset-y-0 left-2 flex items-center pr-4',
                              active ? 'text-white' : 'text-indigo-600'
                            )}
                          >
                            <CheckIcon className="h-5 w-5" aria-hidden="true" />
                          </span>
                        )}
                        <span
                          className={clsx(
                            'ml-5 mt-1 block truncate',
                            selected && 'font-semibold'
                          )}
                        >
                          {group.name}
                        </span>
                      </>
                    )}
                  </Combobox.Option>
                ))}

                <CreateGroupButton
                  user={creator}
                  onOpenStateChange={setIsCreatingNewGroup}
                  className={
                    'w-full justify-start rounded-none border-0 bg-white pl-2 text-base font-normal text-gray-900 hover:bg-indigo-500 hover:text-white'
                  }
                  label={'Create a new Group'}
                  goToGroupOnSubmit={false}
                  icon={
                    <PlusCircleIcon className="text-primary mr-2 h-5 w-5" />
                  }
                />
              </Combobox.Options>
            </div>
          </Combobox>
        </div>
      )}
      {!showGroupSelector && (
        <>
          <div className={'label justify-start'}>
            In Group:
            <span className=" ml-1.5 text-indigo-600">
              {selectedGroup?.name}
            </span>
          </div>
        </>
      )}
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
            onChange={(e) =>
              setCloseDate(dayjs(e.target.value).format('YYYY-MM-DD') || '')
            }
            min={Date.now()}
            disabled={isSubmitting}
            value={dayjs(closeDate).format('YYYY-MM-DD')}
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

      <div className="form-control mb-1 items-start">
        <label className="label mb-1 gap-2">
          <span className="mb-1">Description</span>
          <InfoTooltip text="Optional. Describe how you will resolve this question." />
        </label>
        <Textarea
          className="textarea textarea-bordered w-full resize-none"
          rows={3}
          maxLength={MAX_DESCRIPTION_LENGTH}
          placeholder={descriptionPlaceholder}
          value={description}
          disabled={isSubmitting}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDescription(e.target.value || '')}
        />
      </div>

      <Spacer h={6} />

      <Row className="items-end justify-between">
        <div className="form-control mb-1 items-start">
          <label className="label mb-1 gap-2">
            <span>Cost</span>
            {mustWaitForDailyFreeMarketStatus != 'loading' &&
              mustWaitForDailyFreeMarketStatus && (
                <InfoTooltip
                  text={`Cost to create your question. This amount is used to subsidize betting.`}
                />
              )}
          </label>
          {mustWaitForDailyFreeMarketStatus != 'loading' &&
          !mustWaitForDailyFreeMarketStatus ? (
            <div className="label-text text-primary pl-1">
              <span className={'label-text text-neutral line-through '}>
                {formatMoney(ante)}
              </span>{' '}
              FREE
            </div>
          ) : (
            mustWaitForDailyFreeMarketStatus != 'loading' && (
              <div className="label-text text-neutral pl-1">
                {formatMoney(ante)}
              </div>
            )
          )}
          {mustWaitForDailyFreeMarketStatus != 'loading' &&
            mustWaitForDailyFreeMarketStatus &&
            ante > balance && (
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
          disabled={isSubmitting || !isValid}
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
