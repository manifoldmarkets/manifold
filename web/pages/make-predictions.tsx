import clsx from 'clsx'
import dayjs from 'dayjs'
import Link from 'next/link'
import { useState } from 'react'
import Textarea from 'react-expanding-textarea'

import { getProbability } from 'common/calculate'
import { Binary, CPMM, DPM, FullContract } from 'common/contract'
import { parseWordsAsTags } from 'common/util/parse'
import { BuyAmountInput } from '../components/amount-input'
import { InfoTooltip } from '../components/info-tooltip'
import { Col } from '../components/layout/col'
import { Row } from '../components/layout/row'
import { Spacer } from '../components/layout/spacer'
import { Linkify } from '../components/linkify'
import { Page } from '../components/page'
import { Title } from '../components/title'
import { useUser } from '../hooks/use-user'
import { createContract } from '../lib/firebase/api-call'
import { contractPath } from '../lib/firebase/contracts'

type Prediction = {
  question: string
  description: string
  initialProb: number
  createdUrl?: string
}

function toPrediction(contract: FullContract<DPM | CPMM, Binary>): Prediction {
  const startProb = getProbability(contract)
  return {
    question: contract.question,
    description: contract.description,
    initialProb: startProb * 100,
    createdUrl: contractPath(contract),
  }
}

function PredictionRow(props: { prediction: Prediction }) {
  const { prediction } = props
  return (
    <Row className="justify-between gap-4 p-4 hover:bg-gray-300">
      <Col className="justify-between">
        <div className="mb-2 font-medium text-indigo-700">
          <Linkify text={prediction.question} />
        </div>
        <div className="text-sm text-gray-500">{prediction.description}</div>
      </Col>
      {/* Initial probability */}
      <div className="ml-auto">
        <div className="text-3xl">
          <div className="text-primary">
            {prediction.initialProb.toFixed(0)}%
            <div className="text-lg">chance</div>
          </div>
        </div>
      </div>
      {/* Current probability; hidden for now */}
      {/* <div>
        <div className="text-3xl">
          <div className="text-primary">
            {prediction.initialProb}%<div className="text-lg">chance</div>
          </div>
        </div>
      </div> */}
    </Row>
  )
}

function PredictionList(props: { predictions: Prediction[] }) {
  const { predictions } = props
  return (
    <Col className="divide-y divide-gray-300 rounded-md border border-gray-300">
      {predictions.map((prediction) =>
        prediction.createdUrl ? (
          <Link href={prediction.createdUrl}>
            <a>
              <PredictionRow
                key={prediction.question}
                prediction={prediction}
              />
            </a>
          </Link>
        ) : (
          <PredictionRow key={prediction.question} prediction={prediction} />
        )
      )}
    </Col>
  )
}

const TEST_VALUE = `1. Biden approval rating (as per 538) is greater than 50%: 80%
2. Court packing is clearly going to happen (new justices don't have to be appointed by end of year): 5%
3. Yang is New York mayor: 80%
4. Newsom recalled as CA governor: 5%
5. At least $250 million in damage from BLM protests this year: 30%
6. Significant capital gains tax hike (above 30% for highest bracket): 20%`

export default function MakePredictions() {
  const user = useUser()
  const [predictionsString, setPredictionsString] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdContracts, setCreatedContracts] = useState<
    FullContract<DPM | CPMM, Binary>[]
  >([])

  const [ante, setAnte] = useState<number | undefined>(100)
  const [anteError, setAnteError] = useState<string | undefined>()
  // By default, close the market a week from today
  const weekFromToday = dayjs().add(7, 'day').format('YYYY-MM-DDT23:59')
  const [closeDate, setCloseDate] = useState<undefined | string>(weekFromToday)

  const closeTime = closeDate ? dayjs(closeDate).valueOf() : undefined

  const bulkPlaceholder = `e.g.
${TEST_VALUE}
...
`

  const predictions: Prediction[] = []

  // Parse bulkContracts, then run createContract for each
  const lines = predictionsString ? predictionsString.split('\n') : []
  for (const line of lines) {
    // Parse line with regex
    const matches = line.match(/^(.*):\s*(\d+)%\s*$/) || ['', '', '']
    const [_, question, prob] = matches

    if (!question || !prob) {
      console.error('Invalid prediction: ', line)
      continue
    }

    predictions.push({
      question,
      description,
      initialProb: parseInt(prob),
    })
  }

  async function createContracts() {
    if (!user) {
      // TODO: Convey error with snackbar/toast
      console.error('You need to be signed in!')
      return
    }
    setIsSubmitting(true)
    for (const prediction of predictions) {
      const contract = await createContract({
        question: prediction.question,
        description: prediction.description,
        initialProb: prediction.initialProb,
        ante,
        closeTime,
        tags: parseWordsAsTags(tags),
      }).then((r) => (r.data as any).contract)

      setCreatedContracts((prev) => [...prev, contract])
    }
    setPredictionsString('')
    setIsSubmitting(false)
  }

  return (
    <Page>
      <Title text="Make Predictions" />
      <div className="w-full rounded-lg bg-gray-100 px-6 py-4 shadow-xl">
        <form>
          <div className="form-control">
            <label className="label">
              <span className="label-text">Prediction</span>
              <div className="ml-1 text-sm text-gray-500">
                One prediction per line, each formatted like "The sun will rise
                tomorrow: 99%"
              </div>
            </label>

            <textarea
              className="textarea textarea-bordered h-60"
              placeholder={bulkPlaceholder}
              value={predictionsString}
              onChange={(e) => setPredictionsString(e.target.value || '')}
            ></textarea>
          </div>
        </form>

        <Spacer h={4} />

        <div className="form-control w-full">
          <label className="label">
            <span className="label-text">Description</span>
          </label>

          <Textarea
            placeholder="e.g. This market is part of the ACX predictions for 2022..."
            className="input resize-none"
            value={description}
            onChange={(e) => setDescription(e.target.value || '')}
          />
        </div>

        <div className="form-control w-full">
          <label className="label">
            <span className="label-text">Tags</span>
          </label>

          <input
            type="text"
            placeholder="e.g. ACX2021 World"
            className="input"
            value={tags}
            onChange={(e) => setTags(e.target.value || '')}
          />
        </div>

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
            <span>Market ante</span>
            <InfoTooltip
              text={`Subsidize your market to encourage trading. Ante bets are set to match your initial probability. 
              You earn ${0.01 * 100}% of trading volume.`}
            />
          </label>
          <BuyAmountInput
            amount={ante}
            minimumAmount={10}
            onChange={setAnte}
            error={anteError}
            setError={setAnteError}
            disabled={isSubmitting}
          />
        </div>

        {predictions.length > 0 && (
          <div>
            <Spacer h={4} />
            <label className="label">
              <span className="label-text">Preview</span>
            </label>
            <PredictionList predictions={predictions} />
          </div>
        )}

        <Spacer h={4} />

        <div className="my-4 flex justify-end">
          <button
            type="submit"
            className={clsx('btn btn-primary', {
              loading: isSubmitting,
            })}
            disabled={predictions.length === 0 || isSubmitting}
            onClick={(e) => {
              e.preventDefault()
              createContracts()
            }}
          >
            Create all
          </button>
        </div>
      </div>

      {createdContracts.length > 0 && (
        <>
          <Spacer h={16} />
          <Title text="Created Predictions" />
          <div className="w-full rounded-lg bg-gray-100 px-6 py-4 shadow-xl">
            <PredictionList predictions={createdContracts.map(toPrediction)} />
          </div>
        </>
      )}
    </Page>
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
