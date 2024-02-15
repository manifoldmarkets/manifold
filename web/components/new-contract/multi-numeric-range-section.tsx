import { Col } from 'web/components/layout/col'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { Row } from 'web/components/layout/row'
import { Input } from 'web/components/widgets/input'

export const MultiNumericRangeSection = (props: {
  minString: string
  setMinString: (value: string) => void
  maxString: string
  setMaxString: (value: string) => void
  numberOfBuckets: number | undefined
  setBuckets: (value: number) => void
  submitState: 'EDITING' | 'LOADING' | 'DONE'
  min: number | undefined
  max: number | undefined
  numericAnswers: number[] | undefined
}) => {
  const {
    minString,
    setMinString,
    maxString,
    setMaxString,
    numberOfBuckets,
    setBuckets,
    submitState,
    min,
    max,
    numericAnswers,
  } = props

  return (
    <Col>
      <Col className="mb-2 items-start">
        <label className="gap-2 px-1 py-2">
          <span className="mb-1">Range </span>
          <InfoTooltip text="The lower and higher bounds of the numeric range. Choose bounds the value could reasonably be expected to hit." />
        </label>

        <Row className="gap-2">
          <Input
            type="number"
            className="w-32"
            placeholder="LOW"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setMinString(e.target.value)}
            min={Number.MIN_SAFE_INTEGER}
            max={Number.MAX_SAFE_INTEGER}
            disabled={submitState === 'LOADING'}
            value={minString ?? ''}
          />
          <Input
            type="number"
            className="w-32"
            placeholder="HIGH"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setMaxString(e.target.value)}
            min={Number.MIN_SAFE_INTEGER}
            max={Number.MAX_SAFE_INTEGER}
            disabled={submitState === 'LOADING'}
            value={maxString}
          />
        </Row>

        {min !== undefined && max !== undefined && min >= max && (
          <div className="text-scarlet-500 mb-2 mt-2 text-sm">
            The maximum value must be greater than the minimum.
          </div>
        )}
      </Col>

      <div className="mb-2 flex flex-col items-start">
        <label className="gap-2 px-1 py-2">
          <span className="mb-1">Number of buckets </span>
        </label>

        <Row className="items-center gap-1">
          <Input
            type="number"
            placeholder="Number of buckets"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setBuckets(parseInt(e.target.value))}
            min={3}
            max={Number.MAX_SAFE_INTEGER}
            disabled={submitState === 'LOADING'}
            value={numberOfBuckets?.toString() ?? ''}
          />
          {numericAnswers?.slice(0, 3).map((answer) => (
            <span key={answer}>{answer.toFixed(1)}</span>
          ))}
          {numericAnswers && <span>...</span>}
          {numericAnswers
            ?.slice(numericAnswers.length - 3, numericAnswers.length)
            .map((answer) => (
              <span key={answer}>{answer.toFixed(1)}</span>
            ))}
        </Row>
      </div>
    </Col>
  )
}
