import clsx from 'clsx'
import Link from 'next/link'
import { useState } from 'react'

import { Col } from '../components/layout/col'
import { Row } from '../components/layout/row'
import { Spacer } from '../components/layout/spacer'
import { Linkify } from '../components/linkify'
import { Page } from '../components/page'
import { Title } from '../components/title'
import { useUser } from '../hooks/use-user'
import { createContract } from '../lib/firebase/api-call'
import {
  contractMetrics,
  Contract,
  contractPath,
} from '../lib/firebase/contracts'

type Prediction = {
  question: string
  description: string
  initialProb: number
  createdUrl?: string
}

function toPrediction(contract: Contract): Prediction {
  const { startProb } = contractMetrics(contract)
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
    <Row className="gap-4 justify-between hover:bg-gray-300 p-4">
      <Col className="justify-between">
        <div className="font-medium text-indigo-700 mb-2">
          <Linkify text={prediction.question} />
        </div>
        <div className="text-gray-500 text-sm">{prediction.description}</div>
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
    <Col className="divide-gray-300 divide-y border-gray-300 border rounded-md">
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
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdContracts, setCreatedContracts] = useState<Contract[]>([])

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
      }).then((r) => (r.data as any).contract)

      setCreatedContracts((prev) => [...prev, contract])
    }
    setPredictionsString('')
    setIsSubmitting(false)
  }

  return (
    <Page>
      <Title text="Make Predictions" />
      <div className="w-full bg-gray-100 rounded-lg shadow-xl px-6 py-4">
        <form>
          <div className="form-control">
            <label className="label">
              <span className="label-text">Prediction</span>
              <div className="text-sm text-gray-500 ml-1">
                One prediction per line, each formatted like "The sun will rise
                tomorrow: 99%"
              </div>
            </label>

            <textarea
              className="textarea h-60 textarea-bordered"
              placeholder={bulkPlaceholder}
              value={predictionsString}
              onChange={(e) => setPredictionsString(e.target.value || '')}
            ></textarea>
          </div>
        </form>

        <Spacer h={4} />

        <div className="form-control w-full">
          <label className="label">
            <span className="label-text">Tags</span>
          </label>

          <input
            type="text"
            placeholder="e.g. #ACX2021 #World"
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value || '')}
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

        <div className="flex justify-end my-4">
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
          <div className="w-full bg-gray-100 rounded-lg shadow-xl px-6 py-4">
            <PredictionList predictions={createdContracts.map(toPrediction)} />
          </div>
        </>
      )}
    </Page>
  )
}
