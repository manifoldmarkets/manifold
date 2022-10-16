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
  | 'gray-outline'
  | 'gradient'
  | 'gray-white'

const sizeClasses = {
  '2xs': 'px-2 py-1 text-xs',
  xs: 'px-2.5 py-1.5 text-sm',
  sm: 'px-3 py-2 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-4 py-2 text-base',
  xl: 'px-6 py-2.5 text-base font-semibold',
  '2xl': 'px-6 py-3 text-xl font-semibold',
}

export function buttonClass(size: SizeType, color: ColorType | 'override') {
  return clsx(
    'font-md inline-flex items-center justify-center rounded-md ring-inset shadow-sm transition-colors disabled:cursor-not-allowed',
    sizeClasses[size],
    color === 'green' &&
      'disabled:bg-greyscale-2 bg-teal-500 text-white hover:bg-teal-600',
    color === 'red' &&
      'disabled:bg-greyscale-2 bg-red-400 text-white hover:bg-red-500',
    color === 'yellow' &&
      'disabled:bg-greyscale-2 bg-yellow-400 text-white hover:bg-yellow-500',
    color === 'blue' &&
      'disabled:bg-greyscale-2 bg-blue-400 text-white hover:bg-blue-500',
    color === 'indigo' &&
      'disabled:bg-greyscale-2 bg-indigo-500 text-white hover:bg-indigo-600',
    color === 'gray' &&
      'bg-greyscale-1 text-greyscale-6 hover:bg-greyscale-2 disabled:opacity-50',
    color === 'gray-outline' &&
      'ring-2 ring-greyscale-5 text-greyscale-5 hover:bg-greyscale-5 hover:text-white disabled:opacity-50',
    color === 'gradient' &&
      'disabled:bg-greyscale-2 bg-gradient-to-r from-indigo-500 to-blue-500 text-white hover:from-indigo-700 hover:to-blue-700',
    color === 'gray-white' &&
      'text-greyscale-6 hover:bg-greyscale-2 shadow-none disabled:opacity-50'
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
      {loading && <LoadingIndicator className={'mr-2 border-gray-500'} />}
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
        'disabled:text-greyscale-2 text-greyscale-5 hover:text-greyscale-6',
        className
      )}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
