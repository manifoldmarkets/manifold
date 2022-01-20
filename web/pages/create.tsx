import router from 'next/router'
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import dayjs from 'dayjs'
import Textarea from 'react-expanding-textarea'

import { Spacer } from '../components/layout/spacer'
import { useUser } from '../hooks/use-user'
import { Contract, contractPath } from '../lib/firebase/contracts'
import { createContract } from '../lib/firebase/api-call'
import { Row } from '../components/layout/row'
import { AmountInput } from '../components/amount-input'
import { MINIMUM_ANTE } from '../../common/antes'
import { InfoTooltip } from '../components/info-tooltip'
import { CREATOR_FEE } from '../../common/fees'
import { Page } from '../components/page'
import { Title } from '../components/title'

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
export function NewContract(props: { question: string }) {
  const question = props.question
  const creator = useUser()

  useEffect(() => {
    if (creator === null) router.push('/')
  }, [creator])

  useEffect(() => {
    createContract({}).catch() // warm up function
  }, [])

  const [initialProb, setInitialProb] = useState(50)
  const [description, setDescription] = useState('')

  const [ante, setAnte] = useState<number | undefined>(undefined)
  useEffect(() => {
    if (creator) {
      const initialAnte = creator.balance < 100 ? 10 : 100
      setAnte(initialAnte)
    }
  }, [creator])

  const [anteError, setAnteError] = useState<string | undefined>()
  const [closeDate, setCloseDate] = useState('')

  const [isSubmitting, setIsSubmitting] = useState(false)

  const closeTime = dateToMillis(closeDate) || undefined

  const balance = creator?.balance || 0

  const isValid =
    initialProb > 0 &&
    initialProb < 100 &&
    question.length > 0 &&
    ante !== undefined &&
    ante >= MINIMUM_ANTE &&
    ante <= balance &&
    // If set, closeTime must be in the future
    closeTime &&
    closeTime > Date.now()

  async function submit() {
    // TODO: Tell users why their contract is invalid
    if (!creator || !isValid) return

    setIsSubmitting(true)

    const result: any = await createContract({
      question,
      description,
      initialProb,
      ante,
      closeTime: closeTime || undefined,
    }).then((r) => r.data || {})

    if (result.status !== 'success') {
      console.log('error creating contract', result)
      return
    }

    await router.push(contractPath(result.contract as Contract))
  }

  const descriptionPlaceholder = `(Optional) Describe how you will resolve this market.\ne.g. This market resolves to "YES" if, two weeks after closing, the...`

  if (!creator) return <></>

  return (
    <form>
      <Spacer h={4} />

      <div className="form-control">
        <label className="label">
          <span className="mb-1">Initial probability</span>
        </label>
        <Row className="items-center gap-2">
          <label className="input-group input-group-lg w-fit text-lg">
            <input
              type="number"
              value={initialProb}
              className="input input-bordered input-md text-lg"
              disabled={isSubmitting}
              min={1}
              max={99}
              onChange={(e) =>
                setInitialProb(parseInt(e.target.value.substring(0, 2)))
              }
            />
            <span>%</span>
          </label>
          <input
            type="range"
            className="range range-primary"
            min={1}
            max={99}
            value={initialProb}
            onChange={(e) => setInitialProb(parseInt(e.target.value))}
          />
        </Row>
      </div>

      <Spacer h={4} />

      <div className="form-control">
        <label className="label">
          <span className="mb-1">Description</span>
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

      <div className="form-control items-start mb-1">
        <label className="label gap-2 mb-1">
          <span>Last trading day</span>
          <InfoTooltip text="Trading allowed through 11:59 pm local time on this date." />
        </label>
        <input
          type="date"
          className="input input-bordered"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setCloseDate(e.target.value || '')}
          min={new Date().toISOString().split('T')[0]}
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
              You earn ${CREATOR_FEE * 100}% of trading volume.`}
          />
        </label>
        <AmountInput
          amount={ante}
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
    </form>
  )
}

// Given a date string like '2022-04-02',
// return the time just before midnight on that date (in the user's local time), as millis since epoch
function dateToMillis(date: string) {
  return dayjs(date)
    .set('hour', 23)
    .set('minute', 59)
    .set('second', 59)
    .valueOf()
}
