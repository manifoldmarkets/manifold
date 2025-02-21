import { Col } from 'web/components/layout/col'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { Row } from 'web/components/layout/row'
import { Input } from 'web/components/widgets/input'
import { useState, useCallback } from 'react'
import { Button } from '../buttons/button'
import { api } from 'web/lib/api/api'
import { RefreshIcon, XIcon } from '@heroicons/react/solid'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { ControlledTabs } from '../layout/tabs'
import { debounce } from 'lodash'

export const MultiNumericRangeSection = (props: {
  submitState: 'EDITING' | 'LOADING' | 'DONE'
  question: string
  minString: string
  setMinString: (value: string) => void
  maxString: string
  setMaxString: (value: string) => void
  min: number | undefined
  max: number | undefined
  description?: string
  answers: string[]
  paramsKey: string
  setAnswers: (answers: string[]) => void
  midpoints: number[]
  setMidpoints: (midpoints: number[]) => void
  shouldAnswersSumToOne: boolean
  setShouldAnswersSumToOne: (shouldAnswersSumToOne: boolean) => void
  unit: string
  setUnit: (unit: string) => void
}) => {
  const {
    paramsKey,
    submitState,
    question,
    description,
    answers,
    setAnswers,
    setMidpoints,
    min,
    max,
    minString,
    setMinString,
    maxString,
    setMaxString,
    setShouldAnswersSumToOne,
    shouldAnswersSumToOne,
    unit,
    setUnit,
  } = props
  const [isGeneratingRanges, setIsGeneratingRanges] = useState(false)
  const [thresholdAnswers, setThresholdAnswers] = usePersistentLocalState<
    string[]
  >([], 'threshold-answers' + paramsKey)
  const [thresholdMidpoints, setThresholdMidpoints] = usePersistentLocalState<
    number[]
  >([], 'threshold-midpoints' + paramsKey)
  const [bucketAnswers, setBucketAnswers] = usePersistentLocalState<string[]>(
    [],
    'bucket-answers' + paramsKey
  )
  const [bucketMidpoints, setBucketMidpoints] = usePersistentLocalState<
    number[]
  >([], 'bucket-midpoints' + paramsKey)
  const minMaxError = min !== undefined && max !== undefined && min >= max

  const selectedTab = shouldAnswersSumToOne ? 'buckets' : 'thresholds'

  const generateRanges = async () => {
    console.log('generateRanges', question, min, max)
    if (!question || min === undefined || max === undefined) return
    setIsGeneratingRanges(true)
    try {
      const result = await api('generate-ai-numeric-ranges', {
        question,
        description,
        min,
        max,
      })

      setThresholdAnswers(result.thresholds.answers)
      setThresholdMidpoints(result.thresholds.midpoints)
      setBucketAnswers(result.buckets.answers)
      setBucketMidpoints(result.buckets.midpoints)
      if (selectedTab === 'thresholds') {
        setAnswers(result.thresholds.answers)
        setMidpoints(result.thresholds.midpoints)
      } else {
        setAnswers(result.buckets.answers)
        setMidpoints(result.buckets.midpoints)
      }
    } catch (e) {
      console.error('Error generating ranges:', e)
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
    console.log('handleRangeBlur', min, max, minMaxError, question)
    if (min !== undefined && max !== undefined && !minMaxError && question) {
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

  const handleAnswerChanged = async (
    answers: string[],
    min: number | undefined,
    max: number | undefined,
    setMidpoints: (midpoints: number[]) => void,
    tab: 'thresholds' | 'buckets'
  ) => {
    // Only regenerate midpoints if we have min and max
    if (min === undefined || max === undefined) return

    try {
      const result = await api('regenerate-numeric-midpoints', {
        question,
        answers,
        min,
        max,
        description,
      })
      setMidpoints(result.midpoints)

      // Update the stored answers and midpoints based on current tab
      if (tab === 'thresholds') {
        setThresholdMidpoints(result.midpoints)
      } else {
        setBucketMidpoints(result.midpoints)
      }
    } catch (e) {
      console.error('Error regenerating midpoints:', e)
    }
  }

  // Create debounced version of handleAnswerChanged
  const debouncedHandleAnswerChanged = useCallback(
    debounce(
      (answers: string[], tab: 'thresholds' | 'buckets') =>
        handleAnswerChanged(answers, min, max, setMidpoints, tab),
      1000
    ),
    [min, max, setMidpoints]
  )

  const addAnswer = () => {
    if (selectedTab === 'thresholds') {
      setThresholdAnswers([...thresholdAnswers, ''])
    } else {
      setBucketAnswers([...bucketAnswers, ''])
    }
  }

  return (
    <Col>
      <Row className={'flex-wrap gap-x-4'}>
        <Col className="mb-2 items-start">
          <Row className=" gap-1 px-1 py-2">
            <span className="">Range & unit</span>
            <span className={'text-scarlet-500'}>*</span>
            <InfoTooltip text="The lower and higher bounds of the numeric range. Choose bounds the value could reasonably be expected to hit." />
          </Row>
          <Row className={'gap-2'}>
            <Input
              type="number"
              error={minMaxError}
              className="w-32"
              placeholder="Low"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setMinString(e.target.value)}
              onBlur={handleRangeBlur}
              disabled={submitState === 'LOADING'}
              value={minString ?? ''}
            />

            <Input
              type="number"
              error={minMaxError}
              className="w-32"
              placeholder="High"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setMaxString(e.target.value)}
              onBlur={handleRangeBlur}
              disabled={submitState === 'LOADING'}
              value={maxString}
            />
            <Input
              type="text"
              className="w-32"
              placeholder="Unit"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setUnit(e.target.value)}
              disabled={submitState === 'LOADING'}
              value={unit}
            />

            {min !== undefined && max !== undefined && !minMaxError && (
              <Button
                color="indigo-outline"
                onClick={generateRanges}
                disabled={!question || isGeneratingRanges}
              >
                {isGeneratingRanges ? (
                  <LoadingIndicator size="sm" />
                ) : (
                  <RefreshIcon className="h-5 w-5" aria-hidden="true" />
                )}
              </Button>
            )}
          </Row>
        </Col>
      </Row>

      {minMaxError && (
        <div className="text-scarlet-500 mb-2 mt-2 text-sm">
          The maximum value must be greater than the minimum.
        </div>
      )}

      <ControlledTabs
        activeIndex={selectedTab === 'thresholds' ? 0 : 1}
        onClick={(_, index) =>
          handleTabChange(index === 0 ? 'thresholds' : 'buckets')
        }
        tabs={[
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
                    <button
                      onClick={() => removeAnswer(i, 'thresholds')}
                      type="button"
                      className="hover:bg-canvas-50 border-ink-300 text-ink-700 bg-canvas-0 focus:ring-primary-500 inline-flex items-center rounded-full border p-1 text-xs font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
                    >
                      <XIcon className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </Row>
                ))}
                <Row className="justify-end gap-2">
                  <Button
                    color="indigo-outline"
                    onClick={addAnswer}
                    className="hover:bg-canvas-50 border-ink-300 text-ink-700 bg-canvas-0 focus:ring-primary-500 inline-flex items-center rounded border px-2.5 py-1.5 text-xs font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
                  >
                    Add threshold
                  </Button>
                </Row>
              </Col>
            ),
          },
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
                    <button
                      onClick={() => removeAnswer(i, 'buckets')}
                      type="button"
                      className="hover:bg-canvas-50 border-ink-300 text-ink-700 bg-canvas-0 focus:ring-primary-500 inline-flex items-center rounded-full border p-1 text-xs font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
                    >
                      <XIcon className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </Row>
                ))}
                <Row className="justify-end gap-2">
                  <Button
                    color="indigo-outline"
                    onClick={addAnswer}
                    className="hover:bg-canvas-50 border-ink-300 text-ink-700 bg-canvas-0 focus:ring-primary-500 inline-flex items-center rounded border px-2.5 py-1.5 text-xs font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
                  >
                    Add bucket
                  </Button>
                </Row>
              </Col>
            ),
          },
        ]}
      />
    </Col>
  )
}
