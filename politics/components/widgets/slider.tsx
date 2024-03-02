import clsx from 'clsx'
import * as RxSlider from '@radix-ui/react-slider'
import { ReactNode } from 'react'

export function Slider(props: {
  amount: number
  onChange: (newAmount: number) => void
  min?: number
  max?: number
  step?: number
  marks?: { value: number; label: string }[]
  className?: string
  disabled?: boolean
}) {
  const { amount, onChange, min, max, step, marks, className, disabled } = props

  return (
    <RxSlider.Root
      className={clsx(
        className,
        '0 relative flex touch-none select-none items-center',
        marks ? 'h-[42px]' : 'h-4'
      )}
      value={[amount]}
      onValueChange={([val]) => onChange(val)}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
    >
      <Track>
        <div className="absolute left-2.5 right-2.5 h-full">
          {marks?.map(({ value, label }) => (
            <div
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${value}%` }}
              key={value}
            >
              <div className={clsx('h-2 w-2 ')} />
              <span className="text-ink-400 absolute left-1/2 top-4 -translate-x-1/2 text-xs">
                {label}
              </span>
            </div>
          ))}
        </div>
      </Track>
      <Thumb />
      {/* {marks.map (value) => (
          <Mark>{value}</Mark>
        } */}
    </RxSlider.Root>
  )
}

export function RangeSlider(props: {
  lowValue: number
  highValue: number
  setValues: (low: number, high: number) => void
  min?: number
  max?: number
  disabled?: boolean
  overlappable?: boolean
  handleSize?: number
  className?: string
  marks?: { value: number; label: string }[]
}) {
  const {
    lowValue,
    highValue,
    setValues,
    min,
    max,
    overlappable,
    disabled,
    className,
    marks,
  } = props

  return (
    <RxSlider.Root
      className={clsx(
        className,
        'relative flex h-7 touch-none select-none items-center'
      )}
      value={[lowValue, highValue]}
      minStepsBetweenThumbs={overlappable ? 0 : 1}
      onValueChange={([low, high]) => setValues(low, high)}
      min={min}
      max={max}
      disabled={disabled}
    >
      <Track>
        <div>
          {marks?.map(({ value, label }) => (
            <div
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 font-mono"
              style={{ left: `${value}%` }}
              key={value}
            >
              <span className="text-ink-400 absolute left-1/2 top-4 -translate-x-1/2 text-xs">
                {label}
              </span>
            </div>
          ))}
        </div>
      </Track>
      <Thumb />
      <Thumb />
    </RxSlider.Root>
  )
}

const Track = (props: { className?: string; children?: ReactNode }) => {
  const { className, children } = props
  return (
    <RxSlider.Track className="bg-ink-200 relative h-1 grow ">
      {children}
      <RxSlider.Range className={clsx(className, 'absolute h-full')} />
    </RxSlider.Track>
  )
}

const Thumb = (props: { className?: string }) => (
  <RxSlider.Thumb
    className={clsx(
      props.className,
      'bg-ink-1000 border-ink-1000 hover:bg-ink-0 block h-3 w-3 cursor-col-resize border-2  transition-colors'
    )}
  />
)
