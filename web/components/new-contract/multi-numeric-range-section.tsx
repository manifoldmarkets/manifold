import { Col } from 'web/components/layout/col'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { Row } from 'web/components/layout/row'
import { Input } from 'web/components/widgets/input'
import { useEffect, useState } from 'react'
import { getMultiNumericAnswerBucketRangeNames } from 'common/multi-numeric'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { MULTI_NUMERIC_BUCKETS_MAX } from 'common/contract'

export const MultiNumericRangeSection = (props: {
  minString: string
  setMinString: (value: string) => void
  maxString: string
  setMaxString: (value: string) => void
  precision: number | undefined
  setPrecision: (value: number | undefined) => void
  submitState: 'EDITING' | 'LOADING' | 'DONE'
  min: number | undefined
  max: number | undefined
  paramsKey: string
}) => {
  const {
    minString,
    setMinString,
    precision,
    setPrecision,
    maxString,
    setMaxString,
    submitState,
    min,
    max,
    paramsKey,
  } = props
  const boundsDefined = min !== undefined && max !== undefined
  const highestPrecision = boundsDefined
    ? (max - min) / MULTI_NUMERIC_BUCKETS_MAX
    : undefined
  const lowestPrecision = boundsDefined ? (max - min) / 2 : undefined
  const numberOfBuckets = boundsDefined
    ? getMultiNumericAnswerBucketRangeNames(min, max, precision ?? 1).length
    : 0

  const [precisionError, setPrecisionError] = useState<string>()
  const minMaxError = min !== undefined && max !== undefined && min >= max

  useEffect(() => {
    if (
      !boundsDefined ||
      precision === undefined ||
      lowestPrecision === undefined ||
      highestPrecision === undefined
    )
      return
    if (minMaxError) {
      setPrecisionError(undefined)
    } else {
      if (precision < highestPrecision) {
        setPrecisionError(
          `Precision must be greater than or equal to ${highestPrecision}`
        )
      } else if (precision > lowestPrecision) {
        setPrecisionError(
          `Precision must be less than or equal to ${lowestPrecision}`
        )
      } else {
        setPrecisionError(undefined)
      }
    }
    if (precision < highestPrecision || precision > lowestPrecision) return
    const ranges = getMultiNumericAnswerBucketRangeNames(min, max, precision)
    setBuckets(ranges)
  }, [min, max, precision])

  const updatePrecision = (value: number) => {
    if (isNaN(value) || value <= 0) setPrecision(undefined)
    else setPrecision(value)
  }

  const [buckets, setBuckets] = usePersistentLocalState<string[] | undefined>(
    undefined,
    'new-buckets' + paramsKey
  )
  const bucketsToShow = 2
  const [showAllBuckets, setShowAllBuckets] = useState(
    max && min ? numberOfBuckets <= bucketsToShow * 2 : false
  )

  return (
    <Col>
      <Row className={'flex-wrap gap-x-4'}>
        <Col className="mb-2 items-start">
          <label className="gap-2 px-1 py-2">
            <span className="mb-1">Range (excludes max) </span>
            <InfoTooltip text="The lower and higher bounds of the numeric range. Choose bounds the value could reasonably be expected to hit." />
          </label>
          <Row className="gap-2">
            <Input
              type="number"
              error={minMaxError}
              className="w-32"
              placeholder="Low"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setMinString(e.target.value)}
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
              disabled={submitState === 'LOADING'}
              value={maxString}
            />
          </Row>
        </Col>
        <Col className={''}>
          <label className="gap-2 px-1 py-2">
            <span className="mb-1">Precision </span>
            <InfoTooltip
              text={`The precision of the range. The range will be divided into buckets of this size.`}
            />
          </label>
          <Input
            type="number"
            className="w-32"
            placeholder="Precision"
            error={!!precisionError && !minMaxError}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => updatePrecision(parseFloat(e.target.value))}
            disabled={submitState === 'LOADING'}
            min={highestPrecision}
            max={lowestPrecision}
            value={precision}
          />
          <span className="text-scarlet-500 text-sm">{precisionError}</span>
        </Col>
      </Row>

      {minMaxError && (
        <div className="text-scarlet-500 mb-2 mt-2 text-sm">
          The maximum value must be greater than the minimum.
        </div>
      )}
      {buckets && (
        <Col className={'gap-1'}>
          <label className="gap-2 px-1 py-2">
            <span className="mb-1">Buckets </span>
            <InfoTooltip
              text={`These are the possible answers to the question. The more buckets there are, the more precise forecast is.`}
            />
          </label>
          <Row className={'ml-1 flex-wrap items-center gap-2'}>
            {buckets
              .slice(
                0,
                showAllBuckets || numberOfBuckets <= 4
                  ? numberOfBuckets
                  : bucketsToShow
              )
              .map((a, i) => (
                <span className={'whitespace-nowrap'} key={a}>
                  {a}
                  {i === 0 ? ', ' : ''}
                </span>
              ))}
            {!showAllBuckets && numberOfBuckets > 4 && (
              <>
                {buckets.length > 4 && (
                  <span
                    className="cursor-pointer hover:underline "
                    onClick={() => setShowAllBuckets(true)}
                  >
                    ...
                  </span>
                )}
                {buckets.slice(-bucketsToShow).map((a, i) => (
                  <span className={'whitespace-nowrap'} key={a}>
                    {a}
                    {bucketsToShow === i + 1 ? '' : ', '}
                  </span>
                ))}
              </>
            )}
          </Row>
        </Col>
      )}
    </Col>
  )
}
