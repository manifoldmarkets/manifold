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
import { Title } from 'web/components/title'
import { ProbabilitySelector } from 'web/components/probability-selector'
import { Row } from 'web/components/layout/row'
import { MAX_DESCRIPTION_LENGTH, outcomeType } from 'common/contract'
import { formatMoney } from 'common/util/format'
import { useHasCreatedContractToday } from 'web/hooks/use-has-created-contract-today'
import { removeUndefinedProps } from '../../common/util/object'
import { CATEGORIES } from 'common/categories'

export default function Create() {
  const [question, setQuestion] = useState('')

  return (
    <Page>
      <div className="mx-auto w-full max-w-2xl">
        <Title text="Create a new prediction market" />

        <div className="rounded-lg bg-gray-100 px-6 py-4 shadow-md">
          <form>
            <div className="form-control w-full">
              <label className="label">
                <span className="mb-1">Question</span>
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

  const [category, setCategory] = useState<string>('')
  // const [tagText, setTagText] = useState<string>(tag ?? '')
  // const tags = parseWordsAsTags(tagText)

  const [ante, setAnte] = useState(FIXED_ANTE)

  const deservesDailyFreeMarket = !useHasCreatedContractToday(creator)

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

  const [isSubmitting, setIsSubmitting] = useState(false)

  const closeTime = closeDate ? dayjs(closeDate).valueOf() : undefined

  const balance = creator?.balance || 0

  const min = minString ? parseFloat(minString) : undefined
  const max = maxString ? parseFloat(maxString) : undefined

  const isValid =
    initialProb > 0 &&
    initialProb < 100 &&
    question.length > 0 &&
    ante !== undefined &&
    ante !== null &&
    ante >= MINIMUM_ANTE &&
    (ante <= balance || deservesDailyFreeMarket) &&
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
      await router.push(contractPath(result.contract as Contract))
    } catch (e) {
      console.log('error creating contract', e)
    }
  }

  const descriptionPlaceholder =
    outcomeType === 'BINARY'
      ? `e.g. This market resolves to "YES" if, two weeks after closing, the...`
      : `e.g. I will choose the answer according to...`

  if (!creator) return <></>

  return (
    <div>
      <label className="label">
        <span className="mb-1">Answer type</span>
      </label>
      <Row className="form-control gap-2">
        <label className="label cursor-pointer gap-2">
          <input
            className="radio"
            type="radio"
            name="opt"
            checked={outcomeType === 'BINARY'}
            value="BINARY"
            onChange={() => setOutcomeType('BINARY')}
          />
          <span className="label-text">Yes / No</span>
        </label>

        <label className="label cursor-pointer gap-2">
          <input
            className="radio"
            type="radio"
            name="opt"
            checked={outcomeType === 'FREE_RESPONSE'}
            value="FREE_RESPONSE"
            onChange={() => setOutcomeType('FREE_RESPONSE')}
          />
          <span className="label-text">Free response</span>
        </label>
        <label className="label cursor-pointer gap-2">
          <input
            className="radio"
            type="radio"
            name="opt"
            checked={outcomeType === 'NUMERIC'}
            value="NUMERIC"
            onChange={() => setOutcomeType('NUMERIC')}
          />
          <span className="label-text">Numeric (experimental)</span>
        </label>
      </Row>
      <Spacer h={4} />

      {outcomeType === 'BINARY' && (
        <div className="form-control">
          <label className="label">
            <span className="mb-1">Initial probability</span>
          </label>

          <ProbabilitySelector
            probabilityInt={initialProb}
            setProbabilityInt={setInitialProb}
          />
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
          <InfoTooltip text="Optional. Describe how you will resolve this market." />
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
          <span>Market close</span>
          <InfoTooltip text="Trading will be halted after this time (local timezone)." />
        </label>
        <input
          type="datetime-local"
          className="input input-bordered"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setCloseDate(e.target.value || '')}
          min={Date.now()}
          disabled={isSubmitting}
          value={closeDate}
        />
      </div>

      <Spacer h={4} />

      <div className="form-control mb-1 items-start">
        <label className="label mb-1 gap-2">
          <span>Cost</span>
          {!deservesDailyFreeMarket && (
            <InfoTooltip
              text={`Cost to create your market. This amount is used to subsidize trading.`}
            />
          )}
        </label>
        {deservesDailyFreeMarket ? (
          <div className="label-text text-primary pl-1">FREE</div>
        ) : (
          <div className="label-text text-neutral pl-1">
            {formatMoney(ante)}
          </div>
        )}
        {!deservesDailyFreeMarket && ante > balance && (
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
          {isSubmitting ? 'Creating...' : 'Create market'}
        </button>
      </div>
    </div>
  )
}
