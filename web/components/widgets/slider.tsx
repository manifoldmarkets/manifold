import clsx from 'clsx'
import { mapValues } from 'lodash'
import RcSlider from 'rc-slider'
import 'rc-slider/assets/index.css'
import { ReactNode } from 'react'

const colors = {
  green: ['#14b8a6', '#0d9488'], // teal-500, teal-600
  red: ['#FF7C66', '#CC1D00'], // scarlet-300, scarlet-600
  indigo: ['#a5b4fc', '#6366f1'], // indigo-300, indigo-500
} as const

const handleStyle = {
  height: 20,
  width: 20,
  opacity: 1,
  border: 'none',
  boxShadow: 'none',
  top: 2,
  cursor: 'col-resize',
} as const

export function Slider(props: {
  amount: number
  onChange: (newAmount: number) => void
  min?: number
  max?: number
  step?: number
  marks?: { [key: number]: ReactNode }
  color?: keyof typeof colors
  className?: string
}) {
  const { amount, onChange, min, max, step, marks, className } = props

  const [light, dark] = colors[props.color ?? 'indigo']

  return (
    <div className={clsx('h-10 px-3 pt-1', className)}>
      <RcSlider
        value={amount}
        onChange={onChange as any}
        min={min}
        max={max}
        step={step}
        marks={mapValues(marks, (value) => (
          <Mark>{value}</Mark>
        ))}
        className={'[&>.rc-slider-rail]:bg-ink-200'}
        dotStyle={{ borderColor: 'lightgray' }}
        activeDotStyle={{ borderColor: dark }}
        trackStyle={{ backgroundColor: light }}
        handleStyle={{ ...handleStyle, backgroundColor: dark }}
      />
    </div>
  )
}

export function RangeSlider(props: {
  lowValue: number
  highValue: number
  setValues: (low: number, high: number) => void
  min?: number
  max?: number
  disabled?: boolean
  error?: boolean
  marks?: { [key: number]: ReactNode }
  overlappable?: boolean
  color?: keyof typeof colors
  handleSize?: number
  className?: string
}) {
  const {
    lowValue,
    highValue,
    setValues,
    min,
    max,
    marks,
    overlappable,
    disabled,
    error,
    className,
  } = props

  const [light, dark] = colors[props.color ?? 'indigo']

  return (
    <div className={clsx('h-10', className)}>
      <RcSlider
        range
        draggableTrack
        min={min}
        max={max}
        disabled={disabled}
        value={[lowValue, highValue]}
        onChange={(value) => {
          if (Array.isArray(value)) {
            // eslint-disable-next-line prefer-const
            let [low, high] = value
            if (low === high && !overlappable) high++
            setValues(low, high)
          }
        }}
        marks={mapValues(marks, (value) => (
          <Mark>{value}</Mark>
        ))}
        className={'[&>.rc-slider-rail]:bg-ink-200 !bg-inherit'}
        dotStyle={{ borderColor: 'lightgray' }}
        activeDotStyle={{ borderColor: dark }}
        trackStyle={{
          cursor: 'grab',
          backgroundColor: error ? '#FF2400' : light,
        }}
        handleStyle={[
          { ...handleStyle, backgroundColor: error ? '#FF2400' : dark },
          { ...handleStyle, backgroundColor: dark },
        ]}
      />
    </div>
  )
}

const Mark = (props: { children: ReactNode }) => (
  <span className="text-ink-400 text-xs">
    {/* <div className={'sm:h-0.5'} /> */}
    {props.children}
  </span>
)
