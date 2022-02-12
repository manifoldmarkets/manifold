import router from 'next/router'
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import dayjs from 'dayjs'
import Textarea from 'react-expanding-textarea'

import { Spacer } from '../components/layout/spacer'
import { useUser } from '../hooks/use-user'
import { Contract, contractPath } from '../lib/firebase/contracts'
import { createContract } from '../lib/firebase/api-call'
import { AmountInput } from '../components/amount-input'
import { MINIMUM_ANTE } from '../../common/antes'
import { InfoTooltip } from '../components/info-tooltip'
import { CREATOR_FEE } from '../../common/fees'
import { Page } from '../components/page'
import { Title } from '../components/title'
import { ProbabilitySelector } from '../components/probability-selector'
import { parseWordsAsTags } from '../../common/util/parse'
import { TagsList } from '../components/tags-list'
import { Row } from '../components/layout/row'

export default function Create() {
  const [question, setQuestion] = useState('')

  return (
    <Page>
      <div className="w-full max-w-2xl mx-auto">
        <Title text="Create a new prediction market" />

        <div className="bg-gray-100 rounded-lg shadow-md px-6 py-4">
          <form>
            <div className="form-control w-full">
              <label className="label">
                <span className="mb-1">Question</span>
              </label>

              <Textarea
                placeholder="e.g. Will the Democrats win the 2024 US presidential election?"
                className="input input-bordered resize-none"
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
    createContract({}).catch() // warm up function
  }, [])

  const [outcomeType, setOutcomeType] = useState<'BINARY' | 'MULTI'>('BINARY')
  const [initialProb, setInitialProb] = useState(50)
  const [description, setDescription] = useState('')
  const [tagText, setTagText] = useState<string>(tag ?? '')
  const tags = parseWordsAsTags(tagText)

  const [ante, setAnte] = useState<number | undefined | null>(null)
  useEffect(() => {
    if (ante === null && creator) {
      const initialAnte = creator.balance < 100 ? 10 : 100
      setAnte(initialAnte)
    }
  }, [ante, creator])

  const [anteError, setAnteError] = useState<string | undefined>()
  // By default, close the market a week from today
  const weekFromToday = dayjs().add(7, 'day').format('YYYY-MM-DDT23:59')
  const [closeDate, setCloseDate] = useState<undefined | string>(weekFromToday)

  const [isSubmitting, setIsSubmitting] = useState(false)

  const closeTime = closeDate ? dayjs(closeDate).valueOf() : undefined

  const balance = creator?.balance || 0

  const isValid =
    initialProb > 0 &&
    initialProb < 100 &&
    question.length > 0 &&
    ante !== undefined &&
    ante !== null &&
    ante >= MINIMUM_ANTE &&
    ante <= balance &&
    // closeTime must be in the future
    closeTime &&
    closeTime > Date.now()

  async function submit() {
    // TODO: Tell users why their contract is invalid
    if (!creator || !isValid) return

    setIsSubmitting(true)

    const result: any = await createContract({
      question,
      outcomeType,
      description,
      initialProb,
      ante,
      closeTime,
      tags,
    }).then((r) => r.data || {})

    if (result.status !== 'success') {
      console.log('error creating contract', result)
      return
    }

    await router.push(contractPath(result.contract as Contract))
  }

  const descriptionPlaceholder = `e.g. This market resolves to "YES" if, two weeks after closing, the...`

  if (!creator) return <></>

  return (
    <div>
      <label className="label">
        <span className="mb-1">Answer type</span>
      </label>
      <Row className="form-control gap-2">
        <label className="cursor-pointer label gap-2">
          <input
            className="radio"
            type="radio"
            name="opt"
            checked={outcomeType === 'BINARY'}
            value="BINARY"
            onChange={(e) => setOutcomeType(e.target.value as 'BINARY')}
          />
          <span className="label-text">Yes / No</span>
        </label>

        <label className="cursor-pointer label gap-2">
          <input
            className="radio"
            type="radio"
            name="opt"
            checked={outcomeType === 'MULTI'}
            value="MULTI"
            onChange={(e) => setOutcomeType(e.target.value as 'MULTI')}
          />
          <span className="label-text">Free response</span>
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

      <Spacer h={4} />

      <div className="form-control items-start mb-1">
        <label className="label gap-2 mb-1">
          <span className="mb-1">Description</span>
          <InfoTooltip text="Optional. Describe how you will resolve this market." />
        </label>
        <Textarea
          className="textarea w-full textarea-bordered"
          rows={3}
          placeholder={descriptionPlaceholder}
          value={description}
          disabled={isSubmitting}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDescription(e.target.value || '')}
        />
      </div>

      <Spacer h={4} />

      <div className="form-control items-start max-w-sm">
        <label className="label gap-2">
          <span className="mb-1">Tags</span>
          <InfoTooltip text="Optional. Help categorize your market with related tags." />
        </label>

        <input
          placeholder="e.g. Politics, Economics..."
          className="input input-bordered resize-none"
          disabled={isSubmitting}
          value={tagText}
          onChange={(e) => setTagText(e.target.value || '')}
        />
      </div>

      <Spacer h={4} />
      <TagsList tags={tags} noLink noLabel />
      <Spacer h={4} />

      <div className="form-control items-start mb-1">
        <label className="label gap-2 mb-1">
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

      <div className="form-control items-start mb-1">
        <label className="label gap-2 mb-1">
          <span>Market ante</span>
          <InfoTooltip
            text={`Subsidize your market to encourage trading. Ante bets are set to match your initial probability. 
              You earn ${CREATOR_FEE * 100}% of trader profits.`}
          />
        </label>
        <AmountInput
          amount={ante ?? undefined}
          minimumAmount={MINIMUM_ANTE}
          onChange={setAnte}
          error={anteError}
          setError={setAnteError}
          disabled={isSubmitting}
        />
      </div>

      <Spacer h={4} />

      <div className="flex justify-end my-4">
        <button
          type="submit"
          className={clsx(
            'btn btn-primary',
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
