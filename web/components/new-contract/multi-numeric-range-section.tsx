import { Col } from 'web/components/layout/col'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { Row } from 'web/components/layout/row'
import { Input } from 'web/components/widgets/input'
import { useEffect, useState } from 'react'
import { getMultiNumericAnswerBucketRanges } from 'common/multi-numeric'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'

export const MultiNumericRangeSection = (props: {
  minString: string
  setMinString: (value: string) => void
  maxString: string
  setMaxString: (value: string) => void
  submitState: 'EDITING' | 'LOADING' | 'DONE'
  min: number | undefined
  max: number | undefined
  paramsKey: string
}) => {
  const {
    minString,
    setMinString,
    maxString,
    setMaxString,
    submitState,
    min,
    max,
    paramsKey,
  } = props
  useEffect(() => {
    if (max === undefined || min === undefined) return
    const ranges = getMultiNumericAnswerBucketRanges(min, max)
    setBuckets(ranges)
  }, [max, min])

  const [buckets, setBuckets] = usePersistentLocalState<number[][] | undefined>(
    undefined,
    'new-buckets' + paramsKey
  )
  const [showBuckets, setShowBuckets] = useState(false)
  const bucketsToShow = 2
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
          {buckets && showBuckets && (
            <Row className={'items-center gap-2'}>
              <span>E.g. </span>
              {buckets.slice(0, bucketsToShow).map((a, i) => (
                <span key={a[0]}>
                  {a[0]}-{a[1]}
                  {bucketsToShow === i + 1 ? '' : ', '}
                </span>
              ))}
            </Row>
          )}
        </Row>

        {min !== undefined && max !== undefined && min >= max && (
          <div className="text-scarlet-500 mb-2 mt-2 text-sm">
            The maximum value must be greater than the minimum.
          </div>
        )}
      </Col>
    </Col>
  )
}
