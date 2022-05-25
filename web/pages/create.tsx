import router from 'next/router'
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import dayjs from 'dayjs'
import Textarea from 'react-expanding-textarea'
import { Spacer } from 'web/components/layout/spacer'
import { useUser } from 'web/hooks/use-user'
import { Contract, contractPath } from 'web/lib/firebase/contracts'
import { createContract } from 'web/lib/firebase/api-call'
import { FIXED_ANTE, MINIMUM_ANTE } from 'common/antes'
import { InfoTooltip } from 'web/components/info-tooltip'
import { Page } from 'web/components/page'
import { Row } from 'web/components/layout/row'
import { MAX_DESCRIPTION_LENGTH, outcomeType } from 'common/contract'
import { formatMoney } from 'common/util/format'
import { useHasCreatedContractToday } from 'web/hooks/use-has-created-contract-today'
import { removeUndefinedProps } from 'common/util/object'
import { CATEGORIES } from 'common/categories'
import { ChoicesToggleGroup } from 'web/components/choices-toggle-group'

export default function Create() {
  const [question, setQuestion] = useState('')

  return (
    <Page>
      <div className="mx-auto w-full max-w-2xl">
        <div className="rounded-lg  px-6 py-4">
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
                value={question}
                onChange={(e) => setQuestion(e.target.value || '')}
              />
            </div>
          </form>
          <NewContract question={question} />
        </div>
      </div>
    </Page>
  )
}

// Allow user to create a new contract
export function NewContract(props: { question: string; tag?: string }) {
  const { question, tag } = props
  const creator = useUser()

  useEffect(() => {
    if (creator === null) router.push('/')
  }, [creator])

  useEffect(() => {
    createContract({}).catch(() => {}) // warm up function
  }, [])

  const [outcomeType, setOutcomeType] = useState<outcomeType>('BINARY')
  const [initialProb, setInitialProb] = useState(50)
  const [minString, setMinString] = useState('')
  const [maxString, setMaxString] = useState('')
  const [description, setDescription] = useState('')
  const [showCalendar, setShowCalendar] = useState(false)
  const [showNumInput, setShowNumInput] = useState(false)

  const [category, setCategory] = useState<string>('')
  // const [tagText, setTagText] = useState<string>(tag ?? '')
  // const tags = parseWordsAsTags(tagText)

  const [ante, setAnte] = useState(FIXED_ANTE)

  const mustWaitForDailyFreeMarketStatus = useHasCreatedContractToday(creator)

  // useEffect(() => {
  //   if (ante === null && creator) {
  //     const initialAnte = creator.balance < 100 ? MINIMUM_ANTE : 100
  //     setAnte(initialAnte)
  //   }
  // }, [ante, creator])

  // const [anteError, setAnteError] = useState<string | undefined>()
  // By default, close the market a week from today
  const weekFromToday = dayjs().add(7, 'day').format('YYYY-MM-DDT23:59')
  const [closeDate, setCloseDate] = useState<undefined | string>(weekFromToday)
  const [showErrorText, setShowErrorText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const closeTime = closeDate ? dayjs(closeDate).valueOf() : undefined

  const balance = creator?.balance || 0

  const min = minString ? parseFloat(minString) : undefined
  const max = maxString ? parseFloat(maxString) : undefined
  // get days from today until the end of this year:
  const daysLeftInTheYear = dayjs().endOf('year').diff(dayjs(), 'day')

  const isValid =
    initialProb >= 5 &&
    initialProb <= 95 &&
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
    setShowCalendar(days === 0)
    const newCloseDate = dayjs().add(days, 'day').format('YYYY-MM-DDT23:59')
    setCloseDate(newCloseDate)
  }

  async function submit() {
    // TODO: Tell users why their contract is invalid
    if (!creator || !isValid) return

    setIsSubmitting(true)

    try {
      const result = await createContract(
        removeUndefinedProps({
          question,
          outcomeType,
          description,
          initialProb,
          ante,
          closeTime,
          tags: category ? [category] : undefined,
          min,
          max,
        })
      )
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

  return (
    <div>
      <label className="label mt-1">
        <span className="mt-1">Answer type</span>
      </label>
      <ChoicesToggleGroup
        currentChoice={outcomeType}
        setChoice={(choice) => setOutcomeType(choice as outcomeType)}
        choicesMap={{
          'Yes / No': 'BINARY',
          'Free response': 'FREE_RESPONSE',
          'Numeric (experimental)': 'NUMERIC',
        }}
        isSubmitting={isSubmitting}
        className={'col-span-6 sm:col-span-4'}
      />
      <Spacer h={4} />

      {outcomeType === 'BINARY' && (
        <div className="form-control">
          <Row className="label justify-start">
            <span className="mb-1">How likely is it to happen?</span>
          </Row>
          <div>
            <ChoicesToggleGroup
              currentChoice={showNumInput ? 'custom' : initialProb}
              setChoice={(option) => {
                if (option === 'custom') setShowNumInput(true)
                else {
                  setShowErrorText('')
                  setInitialProb(option as number)
                  setShowNumInput(false)
                }
              }}
              choicesMap={{
                'Unsure (50%)': 50,
                'Not likely (25%)': 25,
                'Likely (75%)': 75,
                Custom: 'custom',
              }}
              isSubmitting={isSubmitting}
              className={'col-span-3'}
            />
            {showNumInput && (
              <div className={'mt-2 ml-1'}>
                <input
                  type="number"
                  value={initialProb}
                  className={'input-bordered input-md mt-2 rounded-md text-lg'}
                  min={5}
                  max={95}
                  disabled={isSubmitting}
                  onChange={(e) => {
                    // show error if prob is less than 5 or greater than 95:
                    const prob = parseInt(e.target.value)
                    setInitialProb(prob)
                    if (prob < 5)
                      setShowErrorText(
                        'Probability must be between 5% and 95% for betting to work properly'
                      )
                    else if (prob > 95)
                      setShowErrorText(
                        'Probability must be between 5% and 95% for betting to work properly'
                      )
                    else setShowErrorText('')
                  }}
                />
                <span className={'mt-2 ml-0.5'}>%</span>
              </div>
            )}
            {showErrorText && (
              <div className="mt-2 ml-1 text-sm text-red-500">
                {showErrorText}
              </div>
            )}
          </div>
        </div>
      )}

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

      <Spacer h={4} />

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

      <Spacer h={4} />

      <div className="form-control max-w-sm items-start">
        <label className="label gap-2">
          <span className="mb-1">Category</span>
        </label>

        <select
          className="select select-bordered w-full max-w-xs"
          value={category}
          onChange={(e) => setCategory(e.currentTarget.value ?? '')}
        >
          <option value={''}>(none)</option>
          {Object.entries(CATEGORIES).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <Spacer h={4} />

      <div className="form-control mb-1 items-start">
        <label className="label mb-1 gap-2">
          <span>Question closes by the end of:</span>
          <InfoTooltip text="Betting will be halted after this date (local timezone)." />
        </label>
        <Row className={'w-full items-center gap-2'}>
          <ChoicesToggleGroup
            currentChoice={
              closeDate
                ? [1, 7, 30, daysLeftInTheYear, 0].includes(
                    dayjs(closeDate).diff(dayjs(), 'day')
                  )
                  ? dayjs(closeDate).diff(dayjs(), 'day')
                  : 0
                : -1
            }
            setChoice={(choice) => {
              setCloseDateInDays(choice as number)
            }}
            choicesMap={{
              Tomorrow: 1,
              'A week': 7,
              'A month': 30,
              'This year': daysLeftInTheYear,
              Custom: 0,
            }}
            isSubmitting={isSubmitting}
            className={'col-span-4 sm:col-span-2'}
          />
        </Row>
        {showCalendar && (
          <input
            type={'date'}
            className="input input-bordered mt-4"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) =>
              setCloseDate(
                dayjs(e.target.value).format('YYYY-MM-DDT23:59') || ''
              )
            }
            min={Date.now()}
            disabled={isSubmitting}
            value={dayjs(closeDate).format('YYYY-MM-DD')}
          />
        )}
      </div>

      <Spacer h={4} />

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
                Add funds
              </button>
            </div>
          )}

        {/* <BuyAmountInput
          amount={ante ?? undefined}
          minimumAmount={MINIMUM_ANTE}
          onChange={setAnte}
          error={anteError}
          setError={setAnteError}
          disabled={isSubmitting}
          contractIdForLoan={undefined}
        /> */}
      </div>

      <Spacer h={4} />

      <div className="my-4 flex justify-end">
        <button
          type="submit"
          className={clsx(
            'btn btn-primary capitalize',
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
      </div>
    </div>
  )
}
