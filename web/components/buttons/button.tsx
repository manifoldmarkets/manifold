import { MouseEventHandler, ReactNode } from 'react'
import clsx from 'clsx'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'

export type SizeType = '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
export type ColorType =
  | 'green'
  | 'red'
  | 'blue'
  | 'indigo'
  | 'yellow'
  | 'gray'
  | 'dark-gray'
  | 'gray-outline'
  | 'gradient'
  | 'gradient-pink'
  | 'gray-white'

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
      'disabled:bg-gray-300 bg-teal-500 text-white hover:bg-teal-600',
    color === 'red' &&
      'disabled:bg-gray-300 bg-scarlet-300 text-white hover:bg-scarlet-400',
    color === 'yellow' &&
      'disabled:bg-gray-300 bg-yellow-400 text-white hover:bg-yellow-500',
    color === 'blue' &&
      'disabled:bg-gray-300 bg-blue-400 text-white hover:bg-blue-500',
    color === 'indigo' &&
      'disabled:bg-gray-300 bg-indigo-500 text-white hover:bg-indigo-600',
    color === 'gray' &&
      'bg-gray-200 text-gray-600 enabled:hover:bg-gray-300 enabled:hover:text-gray-700 disabled:opacity-50',
    color === 'dark-gray' &&
      'bg-gray-600 text-white hover:bg-gray-700 disabled:opacity-50',
    color === 'gray-outline' &&
      'ring-2 ring-gray-500 text-gray-500 enabled:hover:bg-gray-500 enabled:hover:text-white disabled:opacity-50',
    color === 'gradient' &&
      'disabled:bg-gray-300 enabled:bg-gradient-to-r from-indigo-500 to-blue-500 text-white hover:from-indigo-700 hover:to-blue-700',
    color === 'gradient-pink' &&
      'disabled:bg-gray-300 enabled:bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white',
    color === 'gray-white' &&
      'text-gray-600 hover:bg-gray-200 shadow-none disabled:opacity-50'
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
        'text-gray-500 hover:text-gray-600 disabled:text-gray-200',
        className
      )}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
