import { forwardRef, MouseEventHandler, ReactNode, Ref } from 'react'
import clsx from 'clsx'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'

export type SizeType = '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
export type ColorType =
  | 'green'
  | 'green-outline'
  | 'red'
  | 'red-outline'
  | 'blue'
  | 'indigo'
  | 'indigo-outline'
  | 'yellow'
  | 'gray'
  | 'gray-outline'
  | 'gradient'
  | 'gradient-pink'
  | 'gray-white'
  | 'yellow-outline'
  | 'gold'
  | 'none'

const sizeClasses = {
  '2xs': 'px-2 py-1 text-xs',
  xs: 'px-2.5 py-1.5 text-sm',
  sm: 'px-3 py-2 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-4 py-2 text-base',
  xl: 'px-6 py-2.5 text-base font-semibold',
  '2xl': 'px-6 py-3 text-xl font-semibold',
}

const baseButtonClasses =
  'font-md inline-flex items-center justify-center rounded-md ring-inset transition-colors disabled:cursor-not-allowed text-center'

const solid = 'disabled:bg-ink-300 text-white'
const outline =
  'ring-2 ring-current hover:ring-transparent disabled:ring-ink-300 disabled:text-ink-300 enabled:hover:text-ink-0 disabled:bg-inherit'
const gradient = [solid, 'enabled:bg-gradient-to-r hover:saturate-150']

export function buttonClass(size: SizeType, color: ColorType | 'none') {
  return clsx(
    baseButtonClasses,
    sizeClasses[size],
    color === 'green' && [solid, 'bg-teal-500 hover:bg-teal-600'],
    color === 'green-outline' && [outline, 'text-teal-500 hover:bg-teal-500'],
    color === 'red' && [solid, 'bg-scarlet-300 hover:bg-scarlet-400'],
    color === 'red-outline' && [
      outline,
      'text-scarlet-300 hover:bg-scarlet-300',
    ],
    color === 'yellow' && [solid, 'bg-yellow-400 hover:bg-yellow-500'],
    color === 'yellow-outline' && [
      outline,
      'text-yellow-500 hover:bg-yellow-500',
    ],
    color === 'blue' && [solid, 'bg-blue-400 hover:bg-blue-500'],
    color === 'indigo' && [
      solid,
      'bg-primary-500 hover:bg-primary-600 enabled:hover:dark:bg-indigo-500',
    ],
    color === 'indigo-outline' && [
      outline,
      'text-primary-500 hover:bg-primary-500',
    ],
    color === 'gray' &&
      'bg-ink-200 text-ink-600 disabled:bg-ink-100 hover:bg-ink-300 hover:text-ink-700',
    color === 'gray-outline' && [outline, 'text-ink-500 hover:bg-ink-500'],
    color === 'gradient' && [gradient, 'from-primary-500 to-blue-500'],
    color === 'gradient-pink' && [gradient, 'from-primary-500 to-fuchsia-500'],
    color === 'gray-white' &&
      'text-ink-600 enabled:hover:bg-ink-200 disabled:text-ink-300',
    color === 'gold' && [
      gradient,
      'bg-gradient-to-br from-yellow-400 via-yellow-100 to-yellow-300 dark:from-yellow-500 dark:via-yellow-200 dark:to-yellow-600 text-gray-900',
    ]
  )
}

export const Button = forwardRef(function Button(
  props: {
    className?: string
    onClick?: MouseEventHandler<any> | undefined
    children?: ReactNode
    size?: SizeType
    color?: ColorType
    type?: 'button' | 'reset' | 'submit'
    disabled?: boolean
    loading?: boolean
  },
  ref: Ref<HTMLButtonElement>
) {
  const {
    children,
    className,
    onClick,
    size = 'md',
    color = 'indigo',
    type = 'button',
    disabled = false,
    loading,
  } = props

  return (
    <button
      type={type}
      className={clsx(buttonClass(size, color), className)}
      disabled={disabled || loading}
      onClick={onClick}
      ref={ref}
    >
      {loading && (
        <LoadingIndicator
          className="mr-2 w-fit self-stretch"
          size={size === '2xs' || size === 'xs' ? 'sm' : 'md'}
          spinnerClassName="!w-[unset] aspect-square"
        />
      )}
      {children}
    </button>
  )
})

export function IconButton(props: {
  className?: string
  onClick?: MouseEventHandler<any> | undefined
  children?: ReactNode
  size?: SizeType
  type?: 'button' | 'reset' | 'submit'
  disabled?: boolean
  loading?: boolean
}) {
  const {
    children,
    className,
    onClick,
    size = 'md',
    type = 'button',
    disabled = false,
    loading,
  } = props

  return (
    <button
      type={type}
      className={clsx(
        'inline-flex items-center justify-center transition-colors disabled:cursor-not-allowed',
        sizeClasses[size],
        'text-ink-500 hover:text-ink-600 disabled:text-ink-200',
        className
      )}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
