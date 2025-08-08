import { XIcon } from '@heroicons/react/solid'
import { MAX_MULTI_NUMERIC_ANSWERS } from 'common/multi-numeric'
import { formatMoney } from 'common/util/format'
import { debounce } from 'lodash'
import { useCallback, useEffect, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { Input } from 'web/components/widgets/input'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { api, APIError } from 'web/lib/api/api'
import { Button } from '../buttons/button'
import { ControlledTabs } from '../layout/tabs'
export const MultiNumericDateSection = (props: {
  submitState: 'EDITING' | 'LOADING' | 'DONE'
  question: string
  minString: string
  setMinString: (value: string) => void
  maxString: string
  setMaxString: (value: string) => void
  description?: string
  answers: string[]
  paramsKey: string
  setAnswers: (answers: string[]) => void
  midpoints: number[]
  setMidpoints: (midpoints: number[]) => void
  shouldAnswersSumToOne: boolean
  setShouldAnswersSumToOne: (shouldAnswersSumToOne: boolean) => void
  marginalCost: number
}) => {
  const {
    paramsKey,
    submitState,
    question,
    description,
    answers,
    midpoints,
    setAnswers,
    setMidpoints,
    minString,
    setMinString,
    maxString,
    setMaxString,
    setShouldAnswersSumToOne,
    shouldAnswersSumToOne,
    marginalCost,
  } = props
  const defaultAnswers = ['', '']
  const [isGeneratingRanges, setIsGeneratingRanges] = useState(false)
  // thresholds
  const [thresholdAnswers, setThresholdAnswers] = usePersistentLocalState<
    string[]
  >(
    shouldAnswersSumToOne ? defaultAnswers : answers,
    'threshold-answers' + paramsKey
  )
  const [thresholdMidpoints, setThresholdMidpoints] = usePersistentLocalState<
    number[]
  >(shouldAnswersSumToOne ? [] : midpoints, 'threshold-midpoints' + paramsKey)
  // buckets
  const [bucketAnswers, setBucketAnswers] = usePersistentLocalState<string[]>(
    !shouldAnswersSumToOne ? defaultAnswers : answers,
    'bucket-answers' + paramsKey
  )
  const [bucketMidpoints, setBucketMidpoints] = usePersistentLocalState<
    number[]
  >(!shouldAnswersSumToOne ? [] : midpoints, 'bucket-midpoints' + paramsKey)
  const minMaxError = minString === '' || maxString === ''
  const [error, setError] = useState<string>('')
  const [regenerateError, setRegenerateError] = useState<string>('')
  const [maxAnswersReached, setMaxAnswersReached] = useState<boolean>(false)

  const selectedTab = shouldAnswersSumToOne ? 'buckets' : 'thresholds'

  // Check if max answers limit is reached
  useEffect(() => {
    const currentAnswers =
      selectedTab === 'buckets' ? bucketAnswers : thresholdAnswers
    setMaxAnswersReached(currentAnswers.length > MAX_MULTI_NUMERIC_ANSWERS)
  }, [selectedTab, bucketAnswers.length, thresholdAnswers.length])

  const generateRanges = async () => {
    setError('')
    setRegenerateError('')
    if (!question || minString === '' || maxString === '') return
    setIsGeneratingRanges(true)
    try {
      const result = await api('generate-ai-date-ranges', {
        question,
        description,
        min: minString,
        max: maxString,
      })

      setThresholdAnswers(result.thresholds.answers)
      setThresholdMidpoints(result.thresholds.midpoints)
      setBucketAnswers(result.buckets.answers)
      setBucketMidpoints(result.buckets.midpoints)
    } catch (e) {
      console.error('Error generating date ranges:', e)
      if (e instanceof APIError) {
        setError(e.message.slice(0, 100))
      } else {
        setError('An error occurred while generating date ranges.')
      }
    }
    setIsGeneratingRanges(false)
  }

  const removeAnswer = (i: number, tab: 'thresholds' | 'buckets') => {
    const newAnswers =
      tab === 'thresholds'
        ? thresholdAnswers.slice(0, i).concat(thresholdAnswers.slice(i + 1))
        : bucketAnswers.slice(0, i).concat(bucketAnswers.slice(i + 1))
    const newMidpoints =
      tab === 'thresholds'
        ? thresholdMidpoints.slice(0, i).concat(thresholdMidpoints.slice(i + 1))
        : bucketMidpoints.slice(0, i).concat(bucketMidpoints.slice(i + 1))
    if (tab === 'thresholds') {
      setThresholdAnswers(newAnswers)
      setThresholdMidpoints(newMidpoints)
    } else {
      setBucketAnswers(newAnswers)
      setBucketMidpoints(newMidpoints)
    }
  }

  const handleRangeBlur = () => {
    setError('')
    setRegenerateError('')
    if (!minMaxError && question && !answers.length) {
      generateRanges()
    }
  }

  const handleTabChange = (tab: 'thresholds' | 'buckets') => {
    setShouldAnswersSumToOne(tab === 'buckets')
    // Switch between threshold and bucket answers without any post-processing
    if (tab === 'thresholds') {
      setAnswers(thresholdAnswers)
      setMidpoints(thresholdMidpoints)
    } else {
      setAnswers(bucketAnswers)
      setMidpoints(bucketMidpoints)
    }
  }

  useEffect(() => {
    handleTabChange(selectedTab)
  }, [
    JSON.stringify(thresholdAnswers),
    JSON.stringify(bucketAnswers),
    JSON.stringify(thresholdMidpoints),
    JSON.stringify(bucketMidpoints),
  ])

  const handleAnswerChanged = async (
    answers: string[],
    min: string,
    max: string,
    tab: 'thresholds' | 'buckets'
  ) => {
    setRegenerateError('')
    if (answers.every((answer) => answer.trim() === '')) {
      console.log('no answers to regenerate midpoints for')
      return
    }
    try {
      // Call regenerate-date-midpoints without tab parameter
      const result = await api('regenerate-date-midpoints', {
        question,
        answers,
        min,
        max,
        description,
        tab,
      })

      // Update midpoints state
      setMidpoints(result.midpoints)

      // Update the tab-specific state
      if (tab === 'thresholds') {
        setThresholdMidpoints(result.midpoints)
      } else {
        setBucketMidpoints(result.midpoints)
      }
    } catch (e) {
      console.error('Error regenerating date midpoints:', e)
      if (e instanceof APIError) {
        setRegenerateError(e.message.slice(0, 100))
      } else {
        setRegenerateError(
          'An error occurred while regenerating date midpoints.'
        )
      }
    }
  }

  // Create debounced version of handleAnswerChanged
  const debouncedHandleAnswerChanged = useCallback(
    debounce(
      (answers: string[], tab: 'thresholds' | 'buckets') =>
        handleAnswerChanged(answers, minString, maxString, tab),
      1500
    ),
    [minString, maxString, setMidpoints]
  )

  const addAnswer = () => {
    if (selectedTab === 'thresholds') {
      if (thresholdAnswers.length < MAX_MULTI_NUMERIC_ANSWERS) {
        setThresholdAnswers([...thresholdAnswers, ''])
      }
    } else {
      if (bucketAnswers.length < MAX_MULTI_NUMERIC_ANSWERS) {
        setBucketAnswers([...bucketAnswers, ''])
      }
    }
  }

  const tabs = [
    {
      title: 'Buckets',
      content: (
        <Col className="mt-2 gap-2">
          {bucketAnswers.map((answer, i) => (
            <Row key={i} className="items-center gap-2">
              {i + 1}.{' '}
              <Input
                className="w-full"
                value={answer}
                onChange={(e) => {
                  const newAnswers = [...bucketAnswers]
                  newAnswers[i] = e.target.value
                  setBucketAnswers(newAnswers)
                  debouncedHandleAnswerChanged(newAnswers, 'buckets')
                }}
              />
              {bucketAnswers.length > 2 && (
                <button
                  onClick={() => removeAnswer(i, 'buckets')}
                  type="button"
                  className="hover:bg-canvas-50 border-ink-300 text-ink-700 bg-canvas-0 focus:ring-primary-500 inline-flex items-center rounded-full border p-1 text-xs font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
                >
                  <XIcon className="h-5 w-5" aria-hidden="true" />
                </button>
              )}
            </Row>
          ))}
          <Row className="justify-end gap-2">
            <Button
              color="none"
              disabled={bucketAnswers.length >= MAX_MULTI_NUMERIC_ANSWERS}
              onClick={addAnswer}
              className="hover:bg-canvas-50 border-ink-300 text-ink-700 bg-canvas-0 focus:ring-primary-500 inline-flex items-center rounded border px-2.5 py-1.5 text-xs font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
            >
              Add bucket
              {marginalCost > 0 ? ` +${formatMoney(marginalCost)}` : ''}
            </Button>
          </Row>
        </Col>
      ),
    },
    {
      title: 'Thresholds',
      content: (
        <Col className="mt-2 gap-2">
          {thresholdAnswers.map((answer, i) => (
            <Row key={i} className="items-center gap-2">
              {i + 1}.{' '}
              <Input
                className="w-full"
                value={answer}
                onChange={(e) => {
                  const newAnswers = [...thresholdAnswers]
                  newAnswers[i] = e.target.value
                  setThresholdAnswers(newAnswers)
                  debouncedHandleAnswerChanged(newAnswers, 'thresholds')
                }}
              />
              {thresholdAnswers.length > 2 && (
                <button
                  onClick={() => removeAnswer(i, 'thresholds')}
                  type="button"
                  className="hover:bg-canvas-50 border-ink-300 text-ink-700 bg-canvas-0 focus:ring-primary-500 inline-flex items-center rounded-full border p-1 text-xs font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
                >
                  <XIcon className="h-5 w-5" aria-hidden="true" />
                </button>
              )}
            </Row>
          ))}
          <Row className="justify-end gap-2">
            <Button
              color="none"
              disabled={thresholdAnswers.length >= MAX_MULTI_NUMERIC_ANSWERS}
              onClick={addAnswer}
              className="hover:bg-canvas-50 border-ink-300 text-ink-700 bg-canvas-0 focus:ring-primary-500 inline-flex items-center rounded border px-2.5 py-1.5 text-xs font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
            >
              Add threshold
              {marginalCost > 0 ? ` +${formatMoney(marginalCost)}` : ''}
            </Button>
          </Row>
        </Col>
      ),
    },
  ]
  const titles = tabs.map((tab) => tab.title.toLowerCase())

  return (
    <Col>
      <Row className={' flex-wrap'}>
        <Col className="mb-2 w-full items-start">
          <Row className="items-baseline gap-1 px-1 py-2">
            <span className="">Date range</span>
            <InfoTooltip text="The start and end dates for your question. Choose dates the value could reasonably be expected to fall between." />
          </Row>
          <Row className={'w-full gap-2'}>
            <Input
              type="text"
              error={!!error}
              className="w-full"
              placeholder="Start"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setMinString(e.target.value)}
              onBlur={handleRangeBlur}
              disabled={submitState === 'LOADING'}
              value={minString}
            />

            <Input
              type="text"
              error={!!error}
              className="w-full"
              placeholder="End"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setMaxString(e.target.value)}
              onBlur={handleRangeBlur}
              disabled={submitState === 'LOADING'}
              value={maxString}
            />
            <Button
              className="hidden whitespace-nowrap sm:inline-flex"
              color="indigo-outline"
              onClick={generateRanges}
              loading={isGeneratingRanges}
              disabled={
                !question ||
                isGeneratingRanges ||
                minString === '' ||
                maxString === '' ||
                minMaxError
              }
            >
              {answers.length > 0
                ? 'Regenerate date ranges'
                : 'Generate date ranges'}
            </Button>
          </Row>
        </Col>
      </Row>
      <Row className="mb-2 w-full gap-2 sm:hidden">
        <Button
          color="indigo-outline"
          onClick={generateRanges}
          loading={isGeneratingRanges}
          disabled={
            !question ||
            isGeneratingRanges ||
            minString === '' ||
            maxString === '' ||
            minMaxError
          }
        >
          {answers.length > 0
            ? 'Regenerate date ranges'
            : 'Generate date ranges'}
        </Button>
      </Row>
      {error && (
        <div className="text-scarlet-500 mb-2 mt-2 text-sm">{error}</div>
      )}

      <ControlledTabs
        activeIndex={titles.indexOf(selectedTab)}
        onClick={(title) => {
          handleTabChange(title.toLowerCase() as 'thresholds' | 'buckets')
        }}
        tabs={tabs}
      />
      {regenerateError && (
        <div className="text-scarlet-500 mb-2 mt-2 text-sm">
          {regenerateError}
        </div>
      )}
      {maxAnswersReached && (
        <div className="mb-2 mt-2 text-sm text-amber-500">
          Maximum of {MAX_MULTI_NUMERIC_ANSWERS} answers reached.
        </div>
      )}
    </Col>
  )
}
