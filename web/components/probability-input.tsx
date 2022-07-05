import clsx from 'clsx'
import { Col } from './layout/col'
import { Spacer } from './layout/spacer'

export function ProbabilityInput(props: {
  prob: number | undefined
  onChange: (newProb: number | undefined) => void
  error: string | undefined
  setError: (error: string | undefined) => void
  disabled?: boolean
  className?: string
  inputClassName?: string
}) {
  const { prob, onChange, error, disabled, className, inputClassName } = props

  const onProbChange = (str: string) => {
    let prob = parseInt(str.replace(/\D/g, ''))
    const isInvalid = !str || isNaN(prob)
    if (prob.toString().length > 2) {
      if (prob === 100) prob = 99
      else if (prob < 1) prob = 1
      else prob = +prob.toString().slice(-2)
    }
    onChange(isInvalid ? undefined : prob)
  }

  return (
    <Col className={className}>
      <label className="input-group">
        <input
          className={clsx(
            'input input-bordered max-w-[200px] text-lg',
            error && 'input-error',
            inputClassName
          )}
          type="number"
          max={99}
          min={1}
          pattern="[0-9]*"
          inputMode="numeric"
          placeholder="0"
          maxLength={2}
          value={prob ?? ''}
          disabled={disabled}
          onChange={(e) => onProbChange(e.target.value)}
        />
        <span className="bg-gray-200 text-sm">%</span>
      </label>

      <Spacer h={4} />

      {error && (
        <div className="mb-2 mr-auto self-center whitespace-nowrap text-xs font-medium tracking-wide text-red-500">
          {error}
        </div>
      )}
    </Col>
  )
}
