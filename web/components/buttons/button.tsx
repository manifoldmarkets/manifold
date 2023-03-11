import { MouseEventHandler, ReactNode } from 'react'
import clsx from 'clsx'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'

export type SizeType = '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
export type ColorType =
  | 'green'
  | 'red'
  | 'blue'
  | 'indigo'
  | 'indigo-outline'
  | 'yellow'
  | 'gray'
  | 'dark-gray'
  | 'gray-outline'
  | 'gradient'
  | 'gradient-pink'
  | 'gray-white'
  | 'yellow-outline'

export const sizeClasses = {
  '2xs': 'px-2 py-1 text-xs',
  xs: 'px-2.5 py-1.5 text-sm',
  sm: 'px-3 py-2 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-4 py-2 text-base',
  xl: 'px-6 py-2.5 text-base font-semibold',
  '2xl': 'px-6 py-3 text-xl font-semibold',
}

export const baseButtonClasses =
  'font-md inline-flex items-center justify-center rounded-md ring-inset shadow-sm transition-colors disabled:cursor-not-allowed text-center'

export function buttonClass(size: SizeType, color: ColorType | 'override') {
  return clsx(
    baseButtonClasses,
    sizeClasses[size],
    color === 'green' &&
      'disabled:bg-ink-300 bg-teal-500 text-white hover:bg-teal-600',
    color === 'red' &&
      'disabled:bg-ink-300 bg-scarlet-300 text-white hover:bg-scarlet-400',
    color === 'yellow' &&
      'disabled:bg-ink-300 bg-yellow-400 text-white hover:bg-yellow-500',
    color === 'blue' &&
      'disabled:bg-ink-300 bg-blue-400 text-white hover:bg-blue-500',
    color === 'indigo' &&
      'disabled:bg-ink-300 bg-primary-500 text-white hover:bg-primary-600',
    color === 'indigo-outline' &&
      'border-2 border-primary-500 disabled:border-ink-300 disabled:text-ink-300 text-primary-500 hover:bg-primary-500 hover:text-ink-0 disabled:focus:bg-inherit disabled:hover:bg-inherit',
    color === 'gray' &&
      'bg-ink-200 text-ink-600 enabled:hover:bg-ink-300 enabled:hover:text-ink-700 disabled:opacity-50',
    color === 'dark-gray' &&
      'bg-gray-500 dark:bg-gray-400 text-ink-0 hover:bg-ink-700 disabled:opacity-50',
    color === 'gray-outline' &&
      'ring-2 ring-ink-500 text-ink-500 enabled:hover:bg-ink-500 enabled:hover:text-ink-0 disabled:opacity-50',
    color === 'gradient' &&
      'disabled:bg-ink-300 enabled:bg-gradient-to-r from-primary-500 to-blue-500 text-white hover:from-primary-700 hover:to-blue-700',
    color === 'gradient-pink' &&
      'disabled:bg-ink-300 enabled:bg-gradient-to-r from-primary-500 to-fuchsia-500 text-white',
    color === 'gray-white' &&
      'text-ink-600 hover:bg-ink-200 shadow-none disabled:opacity-50',
    color === 'yellow-outline' &&
      'ring-2 ring-yellow-500 text-yellow-500 enabled:hover:bg-yellow-500 enabled:hover:text-ink-0 disabled:opacity-50'
  )
}

export function Button(props: {
  className?: string
  onClick?: MouseEventHandler<any> | undefined
  children?: ReactNode
  size?: SizeType
  color?: ColorType | 'override'
  type?: 'button' | 'reset' | 'submit'
  disabled?: boolean
  loading?: boolean
}) {
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
    >
      {loading && (
        <LoadingIndicator
          className="mr-4 w-fit self-stretch"
          spinnerClassName="!h-full !w-[unset] aspect-square"
        />
      )}
      {children}
    </button>
  )
}

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
